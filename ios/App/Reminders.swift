import Foundation
import UserNotifications

/// GymDay's reminders on iPhone: gym days, "still training?", supplements, the evening protein reminder, the morning brief and
/// the evening wrap-up, from the same JSON the page gives Android. An iPhone runs no code when a reminder is due, so each one is
/// written in full ahead of time and written again whenever the page sends new numbers. iOS keeps at most 64 waiting reminders
/// for an app, so the nearest ones are kept first.
final class Reminders {
    static let shared = Reminders()
    private let center = UNUserNotificationCenter.current()
    private let defaults = UserDefaults.standard
    private let cap = 60

    func registerCategories() {
        center.setNotificationCategories([])
    }

    /// Everything again (after notifications were allowed, say).
    func rescheduleAll() {
        if let s = defaults.string(forKey: "rem.gym") { gym(json: s) }
        if let s = defaults.string(forKey: "rem.supps") { supps(json: s) }
        if let s = defaults.string(forKey: "rem.protein") { protein(json: s) }
        briefAndWrap()
    }

    private func content(_ title: String, _ body: String, to: String = "") -> UNMutableNotificationContent {
        let c = UNMutableNotificationContent()
        c.title = title
        c.body = body
        c.sound = .default
        if !to.isEmpty { c.userInfo = ["to": to] }
        return c
    }

    private func at(_ date: Date, id: String, _ c: UNNotificationContent) -> UNNotificationRequest {
        let comps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
        return UNNotificationRequest(identifier: id, content: c, trigger: UNCalendarNotificationTrigger(dateMatching: comps, repeats: false))
    }

    /// Takes away the waiting reminders whose names start with `prefix`, then adds `list` (nearest first, up to `max`).
    private func replace(prefix: String, with list: [UNNotificationRequest], max: Int) {
        center.getPendingNotificationRequests { pending in
            let old = pending.map { $0.identifier }.filter { $0.hasPrefix(prefix) }
            self.center.removePendingNotificationRequests(withIdentifiers: old)
            let others = pending.filter { !$0.identifier.hasPrefix(prefix) }.count
            let room = Swift.max(0, Swift.min(max, self.cap - others))
            for r in list.prefix(room) { self.center.add(r) }
        }
    }

    private func time(_ mins: Int, daysAhead: Int, from now: Date = Date()) -> Date? {
        let m = Swift.max(0, Swift.min(1439, mins))
        guard let day = Calendar.current.date(byAdding: .day, value: daysAhead, to: now) else { return nil }
        return Calendar.current.date(bySettingHour: m / 60, minute: m % 60, second: 0, of: day)
    }

    // MARK: gym days: {"on":true,"mins":1020,"days":["","Push day",…]} (Sunday first, "" = rest day)

    func gym(json: String) {
        defaults.set(json, forKey: "rem.gym")
        let o = J.parse(json) as? [String: Any] ?? [:]
        let days = (J.arr(o, "days") as? [String]) ?? []
        var list: [UNNotificationRequest] = []
        if J.bool(o, "on") {
            let now = Date()
            for i in 0..<8 {
                guard let t = time(Int(J.num(o, "mins", 1020)), daysAhead: i, from: now), t > now.addingTimeInterval(30) else { continue }
                let wd = Calendar.current.component(.weekday, from: t) - 1          // 0 = Sunday, as on Android
                let name = wd < days.count ? days[wd] : ""
                if name.isEmpty { continue }
                list.append(at(t, id: "gym.\(i)", content(name + " today", "Time for the gym. Tap to open GymDay.")))
            }
        }
        replace(prefix: "gym.", with: list, max: 8)
    }

    /// "Still training?" when a running workout has been left alone too long; 0 (or a time gone by) takes it away.
    func still(at ms: Double) {
        center.removePendingNotificationRequests(withIdentifiers: ["still"])
        let when = Date(timeIntervalSince1970: ms / 1000)
        guard when > Date() else { return }
        center.add(at(when, id: "still", content("Still training?", "Your workout is still running. Tap to finish it or keep going.")))
    }

    // MARK: supplements: [{"t":<ms>,"id":"…","title":"Creatine","text":"1 scoop · every day"}, …] for the next two weeks

    func supps(json: String) {
        defaults.set(json, forKey: "rem.supps")
        let now = Date()
        let items = ((J.parse(json) as? [Any]) ?? []).compactMap { $0 as? [String: Any] }
            .map { (Date(timeIntervalSince1970: J.num($0, "t") / 1000), $0) }
            .filter { $0.0 > now }
            .sorted { $0.0 < $1.0 }
        var list: [UNNotificationRequest] = []
        for (n, (t, o)) in items.enumerated() {
            let title = J.str(o, "title").isEmpty ? "Supplement" : J.str(o, "title")
            let text = J.str(o, "text").isEmpty ? "Time to take it. Tap to tick it off." : J.str(o, "text")
            list.append(at(t, id: "supp.\(n)", content(title, text, to: "supps")))
        }
        replace(prefix: "supp.", with: list, max: 36)
    }

    // MARK: protein in the evening: {"on":true,"mins":1140,"day":"2026-11-17","got":62,"goal":95}

    func protein(json: String) {
        defaults.set(json, forKey: "rem.protein")
        let o = J.parse(json) as? [String: Any] ?? [:]
        var list: [UNNotificationRequest] = []
        // only today can be known: it is written again each time food is logged
        if J.bool(o, "on"), J.str(o, "day") == AppGroup.dayKey(), let t = time(Int(J.num(o, "mins", 1140)), daysAhead: 0), t > Date() {
            let got = Int(J.num(o, "got").rounded()), goal = Int(J.num(o, "goal").rounded()), left = goal - got
            if goal > 0 && left >= 10 {
                list.append(at(t, id: "protein.0", content("Protein: \(got) of \(goal) g today",
                                                           "\(left) g to go. Dal, paneer, curd, eggs, chicken, fish or a glass of milk with dinner gets you there.", to: "foodtab")))
            }
        }
        replace(prefix: "protein.", with: list, max: 1)
    }

    // MARK: the morning brief and the evening wrap-up, for the next seven days, from "tData"

    func briefAndWrap() {
        let d = AppGroup.json(AppGroup.todayKey)
        let now = Date()
        var list: [UNNotificationRequest] = []
        for i in 0..<7 {
            if J.bool(d, "bOn"), let t = time(Int(J.num(d, "bMin", 420)), daysAhead: i, from: now), t > now.addingTimeInterval(30) {
                let b = Words.brief(d, on: t)
                list.append(at(t, id: "brief.\(i)", content(b.0, b.1)))
            }
            if J.bool(d, "wOn"), let t = time(Int(J.num(d, "wMin", 1260)), daysAhead: i, from: now), t > now.addingTimeInterval(30),
               let w = Words.wrap(d, on: t) {
                list.append(at(t, id: "brief.w\(i)", content(w.0, w.1, to: w.2 ? "foodtab" : "")))
            }
        }
        list.sort { a, b in
            let x = (a.trigger as? UNCalendarNotificationTrigger)?.nextTriggerDate() ?? .distantFuture
            let y = (b.trigger as? UNCalendarNotificationTrigger)?.nextTriggerDate() ?? .distantFuture
            return x < y
        }
        replace(prefix: "brief.", with: list, max: 14)
    }
}
