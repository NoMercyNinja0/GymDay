import UIKit

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let ws = scene as? UIWindowScene else { return }
        let w = UIWindow(windowScene: ws)
        let vc = WebViewController()
        Router.shared.host = vc
        w.rootViewController = vc
        w.backgroundColor = Theme.dark
        w.makeKeyAndVisible()
        window = w
        // opened from a link, a long-press shortcut on the icon, or a widget
        for c in connectionOptions.urlContexts { Router.shared.open(c.url) }
        if let s = connectionOptions.shortcutItem { Router.shared.shortcut(s.type) }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for c in URLContexts { Router.shared.open(c.url) }
    }

    func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
        Router.shared.shortcut(shortcutItem.type)
        completionHandler(true)
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        Router.shared.becameActive()
    }

    func sceneWillResignActive(_ scene: UIScene) {
        Router.shared.host?.call("appPause")
    }
}

/// Where a link, a shortcut, a widget, a Control Center button or a reminder wants to go, handed to the page the way Android
/// hands it over (window.onShortcut, onWidgetStart, onJoinLink, onSharedPhotos), or kept until the page asks for it.
final class Router {
    static let shared = Router()
    weak var host: WebViewController?

    /// gymday://join/ABC123 (a club invite), gymday://go/food (a widget or a Control Center button), gymday://start/<day id>
    func open(_ url: URL) {
        guard url.scheme == "gymday" else { return }
        let parts = url.pathComponents.filter { $0 != "/" }
        switch url.host ?? "" {
        case "join":
            let code = (parts.last ?? "").filter { $0.isLetter || $0.isNumber }
            if code.count >= 4 && code.count <= 12 { host?.handOver("join", code, fn: "onJoinLink") }
        case "go":
            go(parts.first ?? "")
        case "start":
            start(parts.first ?? "-")
        default:
            break
        }
    }

    func shortcut(_ type: String) {
        switch type {
        case "app.gymday.start": start("-")
        case "app.gymday.mealphoto": go("mealphoto")
        case "app.gymday.food": go("food")
        case "app.gymday.weight": go("weight")
        default: break
        }
    }

    func go(_ to: String) {
        if to.hasPrefix("start:") { start(String(to.dropFirst(6))); return }
        guard ["weight", "food", "foodtab", "supps", "mealphoto"].contains(to) else { return }
        host?.handOver("go", to, fn: "onShortcut")
    }

    func start(_ day: String) {
        var id = day.filter { $0.isLetter || $0.isNumber || $0 == "_" || $0 == "-" }
        if id.isEmpty || id.count > 40 { id = "-" }
        host?.handOver("start", id, fn: "onWidgetStart", arg: id == "-" ? "" : id)
    }

    /// Each time GymDay comes to the front: a Control Center button or widget may have asked for a screen, a photo may have been
    /// shared from Photos, and a button on the Lock Screen card may have been pressed while the app was closed.
    func becameActive() {
        guard let h = host else { return }
        h.call("appResume")
        let d = AppGroup.defaults
        if let to = d.string(forKey: AppGroup.goKey), !to.isEmpty {
            d.removeObject(forKey: AppGroup.goKey)
            go(to)
        }
        if let a = d.string(forKey: AppGroup.actionKey), !a.isEmpty {
            d.removeObject(forKey: AppGroup.actionKey)
            h.liveAction(a)
        }
        h.bridge.takeSharedPhotos()
        h.bridge.refreshState()
    }
}
