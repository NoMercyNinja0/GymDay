import Foundation

/// The words of the morning brief, the evening wrap-up and the Today widget, worked out from the JSON the page writes ("tData"),
/// by the same rules as on Android (Brief.java and Wrap.java there). An iPhone cannot run code when a reminder is due, so the app
/// works out each day's brief and wrap-up ahead, and again whenever the page writes new numbers.
enum Words {
    static func n0(_ v: Double) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.maximumFractionDigits = 0
        f.locale = Locale(identifier: "en_US")
        return f.string(from: NSNumber(value: v.rounded())) ?? String(Int(v.rounded()))
    }

    static func plan(_ d: [String: Any], _ day: String) -> [String: Any]? { J.obj(J.obj(d, "plan"), day) }

    /// Today's readiness as ("78", "Good to train"), or nil when the page has not worked it out today.
    static func ready(_ d: [String: Any], today: String) -> (String, String)? {
        guard J.str(d, "day") == today, d["ready"] != nil else { return nil }
        return (String(Int(J.num(d, "ready").rounded())), J.str(d, "rword"))
    }

    /// "1,140 kcal left", "120 kcal over", "1,820 kcal eaten" or "" (no target and nothing eaten).
    static func kcalLine(_ d: [String: Any], today: String) -> String {
        let fresh = J.str(d, "day") == today
        let p = plan(d, today)
        let kt = fresh ? J.num(d, "kt") : J.num(p, "kt"), eaten = fresh ? J.num(d, "kcal") : 0
        if kt > 0 { return eaten <= kt ? n0(kt - eaten) + " kcal left" : n0(eaten - kt) + " kcal over" }
        return eaten > 0 ? n0(eaten) + " kcal eaten" : ""
    }

    /// "Next: Push day · today", "Done today ✓ · next: Legs tomorrow", "Rest day" or "" (nothing known).
    static func nextLine(_ d: [String: Any], now: Date = Date()) -> String {
        let today = AppGroup.dayKey(now)
        if J.str(d, "day") == today {
            let next = J.str(d, "next"), when = J.str(d, "when").lowercased()
            if J.bool(d, "done") { return next.isEmpty ? "Done today ✓" : "Done today ✓ · next: " + next + (when.isEmpty ? "" : " " + when) }
            if !next.isEmpty { return "Next: " + next + (when.isEmpty ? "" : " · " + when) }
            return plan(d, today) == nil ? "" : "Rest day"
        }
        if J.obj(d, "plan") == nil { return "" }
        var up = ""
        for i in 0..<8 {
            guard let day = Calendar.current.date(byAdding: .day, value: i, to: now) else { break }
            let p = plan(d, AppGroup.dayKey(day))
            let w = J.str(p, "w")
            if !w.isEmpty {
                let f = DateFormatter()
                f.locale = Locale(identifier: "en_US")
                f.dateFormat = "EEEE"
                return "Next: " + w + " · " + (i == 0 ? "today" : i == 1 ? "tomorrow" : f.string(from: day))
            }
            if i == 0 && p == nil { return "" }
            if i == 0 { up = J.str(p, "up") }
        }
        return up.isEmpty ? "Rest day" : "Next: " + up
    }

    /// The morning brief for the morning of `day`: (title, text).
    static func brief(_ d: [String: Any], on day: Date) -> (String, String) {
        let key = AppGroup.dayKey(day)
        let p = plan(d, key)
        let w = J.str(p, "w"), up = J.str(p, "up")
        let title = p == nil ? "Good morning" : !w.isEmpty ? "Today: " + w : !up.isEmpty ? "Next up: " + up : "Rest day today"
        let kt = J.num(p, "kt")
        let target = kt > 0 ? "Target " + n0(kt) + " kcal" : ""
        if let r = ready(d, today: key) {
            return (title, "Readiness " + r.0 + (r.1.isEmpty ? "" : " · " + r.1) + (target.isEmpty ? "" : " · " + target))
        }
        return (title, (target.isEmpty ? "" : target + " · ") + (p == nil ? "Tap for today's plan and readiness" : "Tap for today's readiness"))
    }

    static func tomorrow(_ d: [String: Any], after day: Date) -> String {
        guard let t = Calendar.current.date(byAdding: .day, value: 1, to: day), let p = plan(d, AppGroup.dayKey(t)) else { return "" }
        let w = J.str(p, "w"), up = J.str(p, "up")
        if !w.isEmpty { return "Tomorrow: " + w }
        if !up.isEmpty { return "Next: " + up }
        return "Tomorrow: rest day"
    }

    /// The evening wrap-up for the evening of `day`: (title, text, opens the Food tab), or nil to stay quiet.
    static func wrap(_ d: [String: Any], on day: Date) -> (String, String, Bool)? {
        let key = AppGroup.dayKey(day)
        let fresh = J.str(d, "day") == key, food = J.bool(d, "food")
        let wn = fresh ? J.str(d, "wn") : ""
        let nf = fresh ? Int(J.num(d, "nf")) : 0
        let next = tomorrow(d, after: day)
        if wn.isEmpty && nf == 0 {
            if !food { return nil }
            return ("Nothing logged today", "Add today's meals before you sleep, so this week's numbers stay right." + (next.isEmpty ? "" : " " + next + "."), true)
        }
        var parts: [String] = []
        if food && nf > 0 {
            let kcal = J.num(d, "kcal"), kt = J.num(d, "kt"), p = J.num(d, "p"), pt = J.num(d, "pt")
            parts.append(kt > 0 ? n0(kcal) + " of " + n0(kt) + " kcal" : n0(kcal) + " kcal")
            if pt > 0 { parts.append("protein " + n0(p) + " of " + n0(pt) + " g") } else if p > 0 { parts.append(n0(p) + " g protein") }
        } else if food {
            parts.append("no food logged yet")
        }
        if !next.isEmpty { parts.append(next) }
        let title = wn.isEmpty ? "Today's wrap-up" : "Today: " + wn + " ✓"
        return (title, parts.isEmpty ? "Tap to see your day." : parts.joined(separator: " · "), food && nf == 0)
    }
}
