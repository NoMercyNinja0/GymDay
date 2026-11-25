import Foundation

/// What GymDay, its widgets and its Share extension keep together: one App Group, with the same JSON the page writes for
/// Android's widgets and reminders.
enum AppGroup {
    /// group.app.gymday in the store build, group.app.gymday.dev in Xcode's Debug runs (each target's Info.plist says which)
    static let id = (Bundle.main.object(forInfoDictionaryKey: "GDAppGroup") as? String) ?? "group.app.gymday"

    static var defaults: UserDefaults { UserDefaults(suiteName: id) ?? .standard }

    /// The group's own folder (the app's Application Support folder if the group is missing).
    static var folder: URL {
        if let u = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: id) { return u }
        return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    }

    /// Photos shared to GymDay from Photos or another app wait here until GymDay opens.
    static var inbox: URL { folder.appendingPathComponent("Inbox", isDirectory: true) }

    // What the page writes (the same JSON as on Android: see Brief.java, FoodWidget.java and WeekWidget.java there)
    static let todayKey = "tData", foodKey = "fData", weekKey = "wData"
    /// A screen to open the next time GymDay comes to the front: mealphoto, food, foodtab, weight, supps, or start:<day id>.
    static let goKey = "go"
    /// A button pressed on the running workout's Lock Screen card while the app was not running: tick, next, pause, resume, finish.
    static let actionKey = "liveAction"

    static func json(_ key: String) -> [String: Any] {
        guard let s = defaults.string(forKey: key), let d = s.data(using: .utf8),
              let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] else { return [:] }
        return o
    }

    /// "2026-11-21" for a date on this phone's calendar (the page's own day keys).
    static func dayKey(_ date: Date = Date()) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }
}

/// Reading the page's JSON the way Android's optString / optDouble / optBoolean do.
enum J {
    static func str(_ o: [String: Any]?, _ k: String) -> String {
        guard let v = o?[k] else { return "" }
        if let s = v as? String { return s }
        if let n = v as? NSNumber { return n.stringValue }
        return ""
    }
    static func num(_ o: [String: Any]?, _ k: String, _ dflt: Double = 0) -> Double {
        guard let v = o?[k] else { return dflt }
        if let n = v as? NSNumber { return n.doubleValue }
        if let s = v as? String, let d = Double(s) { return d }
        return dflt
    }
    static func bool(_ o: [String: Any]?, _ k: String) -> Bool {
        guard let v = o?[k] else { return false }
        if let b = v as? Bool { return b }
        if let n = v as? NSNumber { return n.boolValue }
        return false
    }
    static func obj(_ o: [String: Any]?, _ k: String) -> [String: Any]? { o?[k] as? [String: Any] }
    static func arr(_ o: [String: Any]?, _ k: String) -> [Any]? { o?[k] as? [Any] }

    static func parse(_ s: String) -> Any? {
        guard let d = s.data(using: .utf8) else { return nil }
        return try? JSONSerialization.jsonObject(with: d, options: [.fragmentsAllowed])
    }
    static func text(_ o: Any) -> String {
        guard JSONSerialization.isValidJSONObject(o), let d = try? JSONSerialization.data(withJSONObject: o) else { return "{}" }
        return String(data: d, encoding: .utf8) ?? "{}"
    }
}

extension Notification.Name {
    /// A button on the running workout's Lock Screen card, pressed while the app is running (object: the action).
    static let gymdayLiveAction = Notification.Name("app.gymday.liveAction")
    /// A Control Center button or shortcut that opens a screen, while the app is running (object: the screen).
    static let gymdayGo = Notification.Name("app.gymday.go")
}
