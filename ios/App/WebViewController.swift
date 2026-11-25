import UIKit
import WebKit

enum Theme {
    static let dark = UIColor(red: 5 / 255, green: 8 / 255, blue: 15 / 255, alpha: 1)        // #05080F, as on Android
    static let light = UIColor(red: 242 / 255, green: 246 / 255, blue: 252 / 255, alpha: 1)  // #F2F6FC
    static let accent = UIColor(red: 61 / 255, green: 155 / 255, blue: 1, alpha: 1)          // #3D9BFF
}

/// GymDay's one screen: the same page as on Android (www, served from inside the app), with the "Android" bridge answered by
/// this app (ios-bridge.js and Bridge.swift).
final class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, UIGestureRecognizerDelegate {
    private(set) var web: WKWebView!
    let bridge = Bridge()
    private var light = false
    private var loaded = false
    /// Calls that came before the page was ready; run once it is.
    private var waiting: [String] = []

    override var preferredStatusBarStyle: UIStatusBarStyle { light ? .darkContent : .lightContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Theme.dark
        bridge.host = self

        let cfg = WKWebViewConfiguration()
        cfg.setURLSchemeHandler(SchemeHandler(), forURLScheme: SchemeHandler.scheme)
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []
        cfg.dataDetectorTypes = []
        cfg.userContentController.add(WeakHandler(bridge), name: "gd")
        cfg.defaultWebpagePreferences.allowsContentJavaScript = true
        cfg.preferences.javaScriptCanOpenWindowsAutomatically = false

        let w = WKWebView(frame: .zero, configuration: cfg)
        w.navigationDelegate = self
        w.uiDelegate = self
        w.isOpaque = false
        w.backgroundColor = Theme.dark
        w.scrollView.backgroundColor = Theme.dark
        w.scrollView.contentInsetAdjustmentBehavior = .never
        w.scrollView.bounces = false
        w.allowsBackForwardNavigationGestures = false
        w.allowsLinkPreview = false
        #if DEBUG
        if #available(iOS 16.4, *) { w.isInspectable = true }       // Safari's Web Inspector can look inside (test builds only)
        #endif
        w.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(w)
        // Clear of the notch and the Home bar; the keyboard pushes the page up like Android's "adjustResize".
        NSLayoutConstraint.activate([
            w.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            w.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            w.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            w.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor),
        ])
        web = w

        // Swipe in from the left edge: back, as the page's own back button (Android's back button calls the same appBack()).
        let edge = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(edgeSwipe(_:)))
        edge.edges = .left
        edge.delegate = self
        view.addGestureRecognizer(edge)

        NotificationCenter.default.addObserver(self, selector: #selector(textSizeChanged), name: UIContentSizeCategory.didChangeNotification, object: nil)
        NotificationCenter.default.addObserver(forName: .gymdayLiveAction, object: nil, queue: .main) { [weak self] n in
            if let a = n.object as? String { AppGroup.defaults.removeObject(forKey: AppGroup.actionKey); self?.liveAction(a) }
        }
        NotificationCenter.default.addObserver(forName: .gymdayGo, object: nil, queue: .main) { n in
            if let to = n.object as? String { AppGroup.defaults.removeObject(forKey: AppGroup.goKey); Router.shared.go(to) }
        }
        load()
    }

    /// The page, with what it needs at once (its data, permissions, anything waiting) put in before its scripts run.
    func load() {
        loaded = false
        refreshScripts()
        web.load(URLRequest(url: URL(string: SchemeHandler.scheme + "://localhost/index.html")!))
    }

    private func refreshScripts() {
        let ucc = web.configuration.userContentController
        ucc.removeAllUserScripts()
        let state = J.text(bridge.startState())
        var shim = ""
        if let u = Bundle.main.url(forResource: "ios-bridge", withExtension: "js"), let s = try? String(contentsOf: u, encoding: .utf8) { shim = s }
        ucc.addUserScript(WKUserScript(source: "window.__GD = " + state + ";\n" + shim, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }

    // MARK: talking to the page

    /// window.<fn>(args…) if the page has it; each argument goes in as JSON (a string as a JS string).
    func call(_ fn: String, _ args: Any?...) {
        let a = args.map { Self.js($0) }.joined(separator: ",")
        run("window.\(fn)&&window.\(fn)(\(a))")
    }

    func run(_ js: String) {
        guard loaded else { waiting.append(js); return }
        web.evaluateJavaScript(js, completionHandler: nil)
    }

    static func js(_ v: Any?) -> String {
        guard let v = v else { return "null" }
        if let b = v as? Bool { return b ? "true" : "false" }
        if let s = v as? String {
            if let d = try? JSONSerialization.data(withJSONObject: s, options: [.fragmentsAllowed]), let t = String(data: d, encoding: .utf8) { return t }
            return "''"
        }
        if let n = v as? NSNumber { return n.stringValue }
        if JSONSerialization.isValidJSONObject(v) { return J.text(v) }
        return "null"
    }

    /// A screen, a club code or a day handed to the page as Android does: kept for the page to ask for (pendingGo, pendingJoin,
    /// pendingStart) and, when the page is already open, given to it now.
    func handOver(_ key: String, _ value: String, fn: String, arg: String? = nil) {
        bridge.pending[key] = value
        let take = key == "go" ? "pendingGo" : key == "join" ? "pendingJoin" : "pendingStart"
        run("window.__gdPend&&window.__gdPend(\(Self.js(key)),\(Self.js(value)));window.\(fn)&&(window.\(fn)(\(Self.js(arg ?? value))),window.Android.\(take)())")
    }

    /// A button on the running workout's Lock Screen card (tick, next, pause, resume, finish).
    func liveAction(_ what: String) {
        guard ["tick", "next", "pause", "resume", "finish"].contains(what) else { return }
        run("window.noteAction&&window.noteAction(\(Self.js(what)))")
    }

    func setTheme(light: Bool) {
        self.light = light
        let c = light ? Theme.light : Theme.dark
        view.backgroundColor = c
        view.window?.backgroundColor = c
        web.backgroundColor = c
        web.scrollView.backgroundColor = c
        setNeedsStatusBarAppearanceUpdate()
    }

    @objc private func edgeSwipe(_ g: UIScreenEdgePanGestureRecognizer) {
        guard g.state == .ended, g.translation(in: view).x > 60 else { return }
        run("window.appBack&&window.appBack()")
    }

    @objc private func textSizeChanged() {
        bridge.refreshState()
    }

    // MARK: WKNavigationDelegate

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        let s = url.scheme ?? ""
        if s == SchemeHandler.scheme || s == "about" || s == "blob" || s == "data" {
            if action.targetFrame?.isMainFrame == true && s == SchemeHandler.scheme && loaded {
                // the page is loading itself again (after a restore, say): give it the data as it is now
                loaded = false
                refreshScripts()
            }
            decisionHandler(.allow)
            return
        }
        if s == "gymday" { Router.shared.open(url); decisionHandler(.cancel); return }
        // Anything else (a recipe site, YouTube, the store) opens outside GymDay, as on Android.
        UIApplication.shared.open(url)
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loaded = true
        let w = waiting
        waiting = []
        for js in w { webView.evaluateJavaScript(js, completionHandler: nil) }
    }

    /// iOS may stop the page's process when memory is short; load it again rather than show a blank screen.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        load()
    }

    // MARK: WKUIDelegate

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let u = navigationAction.request.url { UIApplication.shared.open(u) }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(a, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (Bool) -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(a, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        let a = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        a.addTextField { $0.text = defaultText }
        a.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(a.textFields?.first?.text) })
        present(a, animated: true)
    }

    /// The page may use the camera and microphone (a meal photo from the camera, a voice entry) without asking again each time.
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(origin.protocol == SchemeHandler.scheme ? .grant : .prompt)
    }
}

/// WKUserContentController keeps its message handlers forever; this keeps only a weak hold on the bridge.
final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ t: WKScriptMessageHandler) { target = t }
    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(ucc, didReceive: message)
    }
}
