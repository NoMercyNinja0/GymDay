import UIKit
import UniformTypeIdentifiers
import LocalAuthentication
import Speech
import AVFoundation
import VisionKit

/// The phone's own pieces the page asks for: sharing, saving and opening files, Face ID, vibration, voice and barcodes.
final class Phone: NSObject, UIDocumentPickerDelegate {
    private weak var bridge: Bridge?
    private var importing = false
    private var savedMessage = "Saved"

    init(bridge: Bridge) { self.bridge = bridge }

    private var top: UIViewController? {
        var v = bridge?.host as UIViewController?
        while let p = v?.presentedViewController { v = p }
        return v
    }

    func openSettings() {
        if let u = URL(string: UIApplication.openNotificationSettingsURLString) { UIApplication.shared.open(u) }
    }

    // MARK: sharing

    private func present(_ items: [Any]) {
        guard let t = top else { return }
        let vc = UIActivityViewController(activityItems: items, applicationActivities: nil)
        vc.popoverPresentationController?.sourceView = t.view
        vc.popoverPresentationController?.sourceRect = CGRect(x: t.view.bounds.midX, y: t.view.bounds.maxY - 40, width: 1, height: 1)
        t.present(vc, animated: true)
    }

    func shareText(_ text: String) { present([text]) }

    private func tempFile(_ name: String, _ data: Data) -> URL? {
        let safe = String(name.unicodeScalars.filter { ($0.isASCII && CharacterSet.alphanumerics.contains($0)) || ".-_".unicodeScalars.contains($0) })
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("out", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let u = dir.appendingPathComponent(safe.isEmpty ? "GymDay-file" : safe)
        do { try data.write(to: u, options: .atomic); return u } catch { return nil }
    }

    /// A text file (the history spreadsheet) shared through the share sheet.
    func shareFile(name: String, mime: String, text: String) {
        guard let u = tempFile(name, Data(text.utf8)) else { bridge?.toast("Could not share the file"); return }
        present([u])
    }

    /// A picture (a workout card, the year wrapped) with words.
    func shareImage(dataUrl: String, text: String) {
        let b64 = dataUrl.firstIndex(of: ",").map { String(dataUrl[dataUrl.index(after: $0)...]) } ?? dataUrl
        guard let d = Data(base64Encoded: b64, options: .ignoreUnknownCharacters), let img = UIImage(data: d) else {
            bridge?.toast("Could not share the picture")
            return
        }
        present(text.isEmpty ? [img] : [img, text])
    }

    // MARK: files: Save to Files, and a backup back in

    func saveFile(name: String, mime: String, text: String, done: String) {
        guard let u = tempFile(name, Data(text.utf8)), let t = top else { bridge?.toast("Could not save the file"); return }
        savedMessage = done
        importing = false
        let p = UIDocumentPickerViewController(forExporting: [u], asCopy: true)
        p.delegate = self
        t.present(p, animated: true)
    }

    func importBackup() {
        guard let t = top else { return }
        importing = true
        let p = UIDocumentPickerViewController(forOpeningContentTypes: [.json, .text, .data], asCopy: true)
        p.delegate = self
        p.allowsMultipleSelection = false
        t.present(p, animated: true)
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard importing else { bridge?.toast(savedMessage); return }
        importing = false
        guard let u = urls.first else { return }
        let ok = u.startAccessingSecurityScopedResource()
        defer { if ok { u.stopAccessingSecurityScopedResource() } }
        guard let s = try? String(contentsOf: u, encoding: .utf8) else { bridge?.toast("Could not read that file"); return }
        bridge?.call("onBackupImported", s)
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { importing = false }

    // MARK: a tap you can feel

    func vibrate(ms: Double) {
        if ms >= 120 {
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        } else {
            let g = UIImpactFeedbackGenerator(style: ms >= 40 ? .medium : .light)
            g.impactOccurred()
        }
    }

    // MARK: Face ID before GymDay opens (the fingerprint lock on Android)

    func unlock() {
        let c = LAContext()
        c.localizedFallbackTitle = "Use passcode"
        guard c.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) else { bridge?.call("onUnlock", true); return }
        c.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Unlock GymDay") { ok, _ in
            DispatchQueue.main.async { self.bridge?.call("onUnlock", ok) }
        }
    }

    // MARK: voice: what was said comes back to window.onVoice([heard…], "ok" | "cancel" | "none")

    func listen(lang: String, prompt: String) {
        SFSpeechRecognizer.requestAuthorization { st in
            DispatchQueue.main.async {
                guard st == .authorized else { self.bridge?.call("onVoice", nil, "none"); return }
                AVAudioApplication.requestRecordPermission { ok in
                    DispatchQueue.main.async {
                        guard ok, let t = self.top else { self.bridge?.call("onVoice", nil, "none"); return }
                        let v = VoiceSheet(lang: lang, prompt: prompt) { heard, how in self.bridge?.call("onVoice", heard, how) }
                        t.present(v, animated: true)
                    }
                }
            }
        }
    }

    // MARK: barcodes on a packet: window.onBarcode(key, code, error)

    func scanBarcode(key: String) {
        guard DataScannerViewController.isSupported else { bridge?.call("onBarcode", key, nil, "This iPhone can't scan barcodes"); return }
        AVCaptureDevice.requestAccess(for: .video) { ok in
            DispatchQueue.main.async {
                guard ok, DataScannerViewController.isAvailable, let t = self.top else {
                    self.bridge?.call("onBarcode", key, nil, ok ? "The camera is busy" : "Allow the camera for GymDay in Settings to scan barcodes")
                    return
                }
                let s = BarcodeSheet { code, err in self.bridge?.call("onBarcode", key, code, err) }
                t.present(s, animated: true)
            }
        }
    }
}

/// Listens until the person taps Done (or stops talking for a while) and hands back what it heard.
final class VoiceSheet: UIViewController {
    private let lang: String, prompt: String
    private let done: ([String]?, String) -> Void
    private let engine = AVAudioEngine()
    private var task: SFSpeechRecognitionTask?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var heard: [String] = []
    private var finished = false
    private let label = UILabel()
    private var quiet: Timer?

    init(lang: String, prompt: String, done: @escaping ([String]?, String) -> Void) {
        self.lang = lang.range(of: "^[a-z]{2}-[A-Z]{2}$", options: .regularExpression) != nil ? lang : "en-IN"
        self.prompt = prompt
        self.done = done
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .pageSheet
        if let s = sheetPresentationController { s.detents = [.medium()]; s.prefersGrabberVisible = true }
    }

    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.08, green: 0.1, blue: 0.16, alpha: 1)
        let title = UILabel()
        title.text = prompt.isEmpty ? "Listening…" : prompt
        title.font = .preferredFont(forTextStyle: .headline)
        title.textColor = .white
        title.numberOfLines = 0
        title.textAlignment = .center
        label.text = "Speak now"
        label.font = .preferredFont(forTextStyle: .title3)
        label.textColor = UIColor(white: 1, alpha: 0.8)
        label.numberOfLines = 0
        label.textAlignment = .center
        let mic = UIImageView(image: UIImage(systemName: "mic.circle.fill"))
        mic.tintColor = Theme.accent
        mic.contentMode = .scaleAspectFit
        let btn = UIButton(type: .system)
        btn.setTitle("Done", for: .normal)
        btn.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        btn.addTarget(self, action: #selector(stop), for: .touchUpInside)
        let st = UIStackView(arrangedSubviews: [title, mic, label, btn])
        st.axis = .vertical
        st.spacing = 18
        st.alignment = .center
        st.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(st)
        NSLayoutConstraint.activate([
            st.centerXAnchor.constraint(equalTo: view.centerXAnchor), st.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 32),
            st.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 24), mic.heightAnchor.constraint(equalToConstant: 64),
            mic.widthAnchor.constraint(equalToConstant: 64),
        ])
        start()
    }

    /// The audio session and the engine can take a moment to switch on and off, so that is done here, never on the main thread
    /// (Xcode's "AVAudioSession Hang Risk"). One serial queue: stopping always comes after starting.
    private static let audioQ = DispatchQueue(label: "app.gymday.voice")

    private func start() {
        guard let rec = SFSpeechRecognizer(locale: Locale(identifier: lang)) ?? SFSpeechRecognizer(), rec.isAvailable else { finish("none"); return }
        let engine = self.engine
        Self.audioQ.async { [weak self] in
            do {
                let s = AVAudioSession.sharedInstance()
                try s.setCategory(.record, mode: .measurement, options: .duckOthers)
                try s.setActive(true, options: .notifyOthersOnDeactivation)
                let r = SFSpeechAudioBufferRecognitionRequest()
                r.shouldReportPartialResults = true
                let input = engine.inputNode
                input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { b, _ in r.append(b) }
                engine.prepare()
                try engine.start()
                DispatchQueue.main.async { [weak self] in
                    // closed while the microphone was switching on: finish() has already queued the stop
                    guard let self = self, !self.finished else { r.endAudio(); return }
                    self.request = r
                    self.task = rec.recognitionTask(with: r) { [weak self] res, err in
                        guard let self = self else { return }
                        if let res = res {
                            self.heard = [res.bestTranscription.formattedString] + res.transcriptions.dropFirst().prefix(2).map { $0.formattedString }
                            let said = res.bestTranscription.formattedString
                            DispatchQueue.main.async { [weak self] in
                                guard let self = self else { return }
                                self.label.text = said
                                self.quiet?.invalidate()
                                self.quiet = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: false) { [weak self] _ in self?.stop() }
                            }
                            if res.isFinal { DispatchQueue.main.async { [weak self] in self?.finish("ok") } }
                        }
                        if err != nil { DispatchQueue.main.async { [weak self] in guard let self = self else { return }; self.finish(self.heard.isEmpty ? "cancel" : "ok") } }
                    }
                }
            } catch {
                DispatchQueue.main.async { [weak self] in self?.finish("none") }
            }
        }
    }

    @objc private func stop() {
        request?.endAudio()
        finish(heard.isEmpty ? "cancel" : "ok")
    }

    private func finish(_ how: String) {
        guard !finished else { return }
        finished = true
        quiet?.invalidate()
        task?.cancel()
        let engine = self.engine
        Self.audioQ.async {
            if engine.isRunning { engine.stop(); engine.inputNode.removeTap(onBus: 0) }
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
        let h = heard, d = done
        dismiss(animated: true) { d(how == "ok" ? h : nil, how) }
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if !finished { finish(heard.isEmpty ? "cancel" : "ok") }
    }
}

/// The camera, reading the first barcode it sees (EAN, UPC, QR).
final class BarcodeSheet: UIViewController, DataScannerViewControllerDelegate {
    private let done: (String?, String?) -> Void
    private var answered = false
    private let scanner = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.ean13, .ean8, .upce, .code128, .qr])],
                                                    qualityLevel: .balanced, isHighlightingEnabled: true)

    init(done: @escaping (String?, String?) -> Void) {
        self.done = done
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .fullScreen
    }

    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        scanner.delegate = self
        addChild(scanner)
        scanner.view.frame = view.bounds
        scanner.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(scanner.view)
        scanner.didMove(toParent: self)
        let close = UIButton(type: .close)
        close.translatesAutoresizingMaskIntoConstraints = false
        close.addTarget(self, action: #selector(cancel), for: .touchUpInside)
        view.addSubview(close)
        let hint = UILabel()
        hint.text = "Point at the barcode on the packet"
        hint.textColor = .white
        hint.font = .preferredFont(forTextStyle: .headline)
        hint.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(hint)
        NSLayoutConstraint.activate([
            close.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            close.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            hint.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24),
            hint.centerXAnchor.constraint(equalTo: view.centerXAnchor),
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        try? scanner.startScanning()
    }

    func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
        for item in addedItems {
            if case .barcode(let b) = item, let v = b.payloadStringValue, !v.isEmpty { answer(v, nil); return }
        }
    }

    @objc private func cancel() { answer(nil, "cancelled") }

    private func answer(_ code: String?, _ err: String?) {
        guard !answered else { return }
        answered = true
        scanner.stopScanning()
        let d = done
        dismiss(animated: true) { d(code, err) }
    }
}
