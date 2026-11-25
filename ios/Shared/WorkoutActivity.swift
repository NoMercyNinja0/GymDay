import Foundation
import ActivityKit

/// The running workout on the Lock Screen and in the Dynamic Island (a Live Activity): what Android shows as the workout card
/// and the capsule. The page sends the same card as on Android (WorkoutNotifier.java there):
/// {"title","text","chip","base" (ms the timer counts from),"paused","elapsed" (ms, while paused),"done","total","btns":[[id, label], …]}
struct WorkoutAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var title: String
        var text: String
        var chip: String
        var base: Date
        var paused: Bool
        var elapsed: Double
        var done: Int
        var total: Int
        var buttons: [String]
        var labels: [String]
        var ended: Bool = false

        /// The timer as text when it is not running (paused, or the workout is over).
        var still: String {
            let s = Int(max(0, elapsed))
            return s >= 3600 ? String(format: "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60) : String(format: "%d:%02d", s / 60, s % 60)
        }

        var progress: Double { total > 0 ? min(1, Double(done) / Double(total)) : 0 }
    }

    var name: String
}

extension WorkoutAttributes.ContentState {
    init(card o: [String: Any]) {
        let btns = (o["btns"] as? [[Any]]) ?? []
        self.init(title: J.str(o, "title").isEmpty ? "Workout" : J.str(o, "title"),
                  text: J.str(o, "text"), chip: J.str(o, "chip"),
                  base: Date(timeIntervalSince1970: J.num(o, "base", Date().timeIntervalSince1970 * 1000) / 1000),
                  paused: J.bool(o, "paused"), elapsed: J.num(o, "elapsed") / 1000,
                  done: Int(J.num(o, "done")), total: Int(J.num(o, "total")),
                  buttons: btns.compactMap { $0.first as? String }.prefix(3).map { $0 },
                  labels: btns.compactMap { $0.count > 1 ? $0[1] as? String : nil }.prefix(3).map { $0 })
    }
}
