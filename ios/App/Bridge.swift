import UIKit
import WebKit
import WidgetKit
import UserNotifications
import LocalAuthentication
import Speech

/// The iPhone side of the page's "Android" bridge (ios-bridge.js gives the page the same methods as on Android). Each message
/// is { m: method, a: [arguments] }; answers go back through the same window.onXxx callbacks Android uses.
final class Bridge: NSObject, WKScriptMessageHandler {
    weak var host: WebViewController?
    /// Kept until the page asks for them: go (a screen), start (a day), join (a club code).
    var pending: [String: String] = [:]
    /// Photos shared from Photos (data URLs as a JSON list), until the page takes them.
    var shared = ""
    private var notifOK = false

    lazy var health = Health(bridge: self)
    lazy var phone = Phone(bridge: self)

    // MARK: what the page has at once, before its scripts run (window.__GD)

    func startState() -> [String: Any] {
        return ["data": Files.shared.loadData(), "meta": Files.shared.loadMeta(), "pend": pending, "shared": shared,
                "hc": health.statusObject(), "notif": notifOK, "font": Self.fontScale(), "voice": Self.voiceOK(), "lock": Self.canLock(),
                "live": LiveWorkout.state()]
    }

    /// Permissions and settings that may have changed while GymDay was in the background.
    func refreshState() {
        UNUserNotificationCenter.current().getNotificationSettings { s in
            DispatchQueue.main.async {
                self.notifOK = s.authorizationStatus == .authorized || s.authorizationStatus == .provisional
                self.set("notif", self.notifOK)
            }
        }
        set("font", Self.fontScale())
        set("hc", health.statusObject())
        set("lock", Self.canLock())
        set("live", LiveWorkout.state())
    }

    func set(_ key: String, _ value: Any) {
        host?.run("window.__gdSet&&window.__gdSet(\(WebViewController.js(key)),\(WebViewController.js(value)))")
    }

    func call(_ fn: String, _ args: Any?...) {
        let a = args.map { WebViewController.js($0) }.joined(separator: ",")
        host?.run("window.\(fn)&&window.\(fn)(\(a))")
    }

    func toast(_ msg: String) { call("toast", msg) }

    // MARK: messages from the page

    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let m = body["m"] as? String else { return }
        let a = body["a"] as? [Any] ?? []
        func s(_ i: Int) -> String {
            guard i < a.count else { return "" }
            if let x = a[i] as? String { return x }
            if let n = a[i] as? NSNumber { return n.stringValue }
            return ""
        }
        func b(_ i: Int) -> Bool { i < a.count ? ((a[i] as? Bool) ?? ((a[i] as? NSNumber)?.boolValue ?? false)) : false }
        func d(_ i: Int) -> Double { i < a.count ? ((a[i] as? NSNumber)?.doubleValue ?? Double(s(i)) ?? 0) : 0 }

        switch m {
        // storage
        case "save": Files.shared.saveData(s(0))
        case "metaSave": Files.shared.saveMeta(s(0))
        case "savePhoto": Files.shared.savePhoto(id: s(0), dataUrl: s(1))
        case "deletePhoto": Files.shared.deletePhoto(id: s(0))
        case "sharedTaken": shared = ""

        // Apple Health (Health Connect on Android)
        case "hcRequest": health.request(.basic)
        case "hcAutoAsk": health.request(.auto)
        case "hcWeightAsk": health.request(.weight)
        case "hcSessionsAsk": health.request(.workouts)
        case "hcWriteAsk": health.request(.write)
        case "hcOpen": health.open()
        case "hcRead": health.read(key: s(0), from: d(1), to: d(2))
        case "hcDay": health.day(key: s(0), from: d(1), to: d(2))
        case "hcWeight": health.weight(key: s(0))
        case "hcSessions": health.sessions(key: s(0), from: d(1), to: d(2))
        case "hcWrite": health.write(key: s(0), json: s(1))
        case "hcRemove": health.remove(key: s(0), idsJson: s(1))

        // the running workout on the Lock Screen and in the Dynamic Island (the card and the capsule on Android)
        case "workoutCard": LiveWorkout.shared.show(json: s(0))
        case "workoutSaved": LiveWorkout.shared.saved(title: s(0), text: s(1))
        case "workoutClear": LiveWorkout.shared.clear()

        // reminders
        case "notifAsk": askNotifications()
        case "openSettings": phone.openSettings()
        case "stillAt": Reminders.shared.still(at: d(0))
        case "remindersSet": Reminders.shared.gym(json: s(0))
        case "suppRemindSet": Reminders.shared.supps(json: s(0))
        case "proteinNudgeSet": Reminders.shared.protein(json: s(0))

        // widgets (and the morning brief and evening wrap-up, which read the same numbers)
        case "todayData":
            AppGroup.defaults.set(s(0), forKey: AppGroup.todayKey)
            Reminders.shared.briefAndWrap()
            WidgetCenter.shared.reloadTimelines(ofKind: "GymDayToday")
        case "foodWidgetData":
            AppGroup.defaults.set(s(0), forKey: AppGroup.foodKey)
            WidgetCenter.shared.reloadTimelines(ofKind: "GymDayFood")
        case "widgetData":
            AppGroup.defaults.set(s(0), forKey: AppGroup.weekKey)
            WidgetCenter.shared.reloadTimelines(ofKind: "GymDayWeek")

        // the phone
        case "themeBars": host?.setTheme(light: b(0))
        case "share": phone.shareText(s(0))
        case "shareFile": phone.shareFile(name: s(0), mime: s(1), text: s(2))
        case "shareImage": phone.shareImage(dataUrl: s(0), text: s(1))
        case "saveFile": phone.saveFile(name: s(0), mime: s(1), text: s(2), done: "Saved")
        case "exportBackup": phone.saveFile(name: "gymday-backup-" + AppGroup.dayKey() + ".json", mime: "application/json", text: s(0), done: "Backup saved")
        case "importBackup": phone.importBackup()
        case "keepAwake": UIApplication.shared.isIdleTimerDisabled = b(0)
        case "vibrate": phone.vibrate(ms: d(0))
        case "openUrl": if let u = URL(string: s(0)), ["http", "https", "mailto", "tel"].contains(u.scheme ?? "") { UIApplication.shared.open(u) }
        case "unlock": phone.unlock()
        case "voiceListen": phone.listen(lang: s(0), prompt: s(1))
        case "scanBarcode": phone.scanBarcode(key: s(0))
        default: break
        }
    }

    private func askNotifications() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { ok, _ in
            DispatchQueue.main.async {
                self.notifOK = ok
                self.set("notif", ok)
                self.call("onNotifPerm", ok)
                if ok { Reminders.shared.rescheduleAll() }
            }
        }
    }

    // MARK: photos shared from Photos (the Share extension leaves them in the App Group's Inbox)

    func takeSharedPhotos() {
        let fm = FileManager.default
        guard let names = try? fm.contentsOfDirectory(at: AppGroup.inbox, includingPropertiesForKeys: [.contentModificationDateKey]), !names.isEmpty else { return }
        let files = names.filter { ["jpg", "jpeg"].contains($0.pathExtension.lowercased()) }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
        var list: [String] = []
        for f in files.prefix(4) {
            if let d = try? Data(contentsOf: f) { list.append("data:image/jpeg;base64," + d.base64EncodedString()) }
        }
        for f in names { try? fm.removeItem(at: f) }
        guard !list.isEmpty else { return }
        shared = J.text(list)
        set("shared", shared)
        host?.run("window.onSharedPhotos&&window.onSharedPhotos()")
    }

    // MARK: small answers the page asks for at once

    /// The phone's text size (Settings → Display & Brightness → Text Size), as Android's font scale: 1 is the usual size.
    static func fontScale() -> Double {
        switch UIApplication.shared.preferredContentSizeCategory {
        case .extraSmall: return 0.82
        case .small: return 0.88
        case .medium: return 0.94
        case .large: return 1.0
        case .extraLarge: return 1.12
        case .extraExtraLarge: return 1.24
        case .extraExtraExtraLarge: return 1.35
        case .accessibilityMedium: return 1.5
        case .accessibilityLarge: return 1.65
        case .accessibilityExtraLarge: return 1.8
        case .accessibilityExtraExtraLarge: return 1.95
        case .accessibilityExtraExtraExtraLarge: return 2.0
        default: return 1.0
        }
    }

    static func voiceOK() -> Bool { SFSpeechRecognizer(locale: Locale(identifier: "en-IN"))?.isAvailable ?? SFSpeechRecognizer()?.isAvailable ?? false }

    /// Face ID / Touch ID or the phone's passcode can be asked for (the phone has a passcode).
    static func canLock() -> Bool { LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) }
}
