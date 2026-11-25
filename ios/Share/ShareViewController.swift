import UIKit
import UniformTypeIdentifiers

/// "Share → GymDay" from Photos (or any app): the pictures (up to 4) are made smaller and left in the App Group's Inbox. The next
/// time GymDay opens, they open as a meal photo, as Share does on Android.
final class ShareViewController: UIViewController {
    private let label = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.04, green: 0.07, blue: 0.11, alpha: 1)
        let icon = UIImageView(image: UIImage(systemName: "fork.knife.circle.fill"))
        icon.tintColor = UIColor(red: 61 / 255, green: 155 / 255, blue: 1, alpha: 1)
        icon.contentMode = .scaleAspectFit
        label.text = "Adding to GymDay…"
        label.textColor = .white
        label.font = .preferredFont(forTextStyle: .headline)
        label.numberOfLines = 0
        label.textAlignment = .center
        let done = UIButton(type: .system)
        done.setTitle("Done", for: .normal)
        done.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        done.addTarget(self, action: #selector(close), for: .touchUpInside)
        let st = UIStackView(arrangedSubviews: [icon, label, done])
        st.axis = .vertical
        st.spacing = 16
        st.alignment = .center
        st.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(st)
        NSLayoutConstraint.activate([
            st.centerXAnchor.constraint(equalTo: view.centerXAnchor), st.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            st.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 24),
            icon.widthAnchor.constraint(equalToConstant: 56), icon.heightAnchor.constraint(equalToConstant: 56),
        ])
        Task { await take() }
    }

    private func take() async {
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        let providers = items.flatMap { $0.attachments ?? [] }.filter { $0.hasItemConformingToTypeIdentifier(UTType.image.identifier) }
        try? FileManager.default.createDirectory(at: AppGroup.inbox, withIntermediateDirectories: true)
        var n = 0
        let stamp = Int(Date().timeIntervalSince1970 * 1000)
        for p in providers.prefix(4) {
            guard let img = await load(p), let jpg = Self.smaller(img, 1600).jpegData(compressionQuality: 0.85) else { continue }
            let u = AppGroup.inbox.appendingPathComponent("\(stamp)-\(n).jpg")
            if (try? jpg.write(to: u, options: .atomic)) != nil { n += 1 }
        }
        await MainActor.run {
            label.text = n == 0 ? "That picture couldn't be opened." :
                (n == 1 ? "Added. Open GymDay to log this meal." : "Added \(n) photos. Open GymDay to log this meal.")
        }
    }

    private func load(_ p: NSItemProvider) async -> UIImage? {
        await withCheckedContinuation { (c: CheckedContinuation<UIImage?, Never>) in
            p.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) { data, _ in
                c.resume(returning: data.flatMap { UIImage(data: $0) })
            }
        }
    }

    /// No side longer than `side` points of pixels, as on Android (SharedPhoto.java), so the photo reads fast and stays small.
    static func smaller(_ img: UIImage, _ side: CGFloat) -> UIImage {
        let w = img.size.width * img.scale, h = img.size.height * img.scale
        let k = min(1, side / max(w, h))
        let size = CGSize(width: (w * k).rounded(), height: (h * k).rounded())
        let f = UIGraphicsImageRendererFormat()
        f.scale = 1
        return UIGraphicsImageRenderer(size: size, format: f).image { _ in img.draw(in: CGRect(origin: .zero, size: size)) }
    }

    @objc private func close() {
        extensionContext?.completeRequest(returningItems: nil)
    }
}
