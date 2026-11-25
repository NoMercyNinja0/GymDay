import Foundation
import ActivityKit

/// The running workout as a Live Activity (Lock Screen and Dynamic Island), kept up to date from the card the page sends.
final class LiveWorkout {
    static let shared = LiveWorkout()
    private var current: Activity<WorkoutAttributes>?

    /// The page's switch for Android 16's capsule has no twin here: an iPhone shows Live Activities unless they are turned off
    /// in Settings, so the page is told "na" and does not show that switch.
    static func state() -> String { "na" }

    private var activity: Activity<WorkoutAttributes>? {
        if let a = current, a.activityState == .active || a.activityState == .stale { return a }
        current = Activity<WorkoutAttributes>.activities.first { $0.activityState == .active || $0.activityState == .stale }
        return current
    }

    func show(json: String) {
        guard let o = J.parse(json) as? [String: Any] else { return }
        let content = ActivityContent(state: WorkoutAttributes.ContentState(card: o), staleDate: nil)
        if let a = activity {
            Task { await a.update(content) }
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        current = try? Activity<WorkoutAttributes>.request(attributes: WorkoutAttributes(name: "GymDay"), content: content, pushType: nil)
    }

    /// After Finish: the card says the workout was saved, and goes after a while.
    func saved(title: String, text: String) {
        guard let a = activity else { return }
        var st = a.content.state
        st.title = title.isEmpty ? "Workout saved" : title
        st.text = text
        if !st.paused { st.elapsed = Date().timeIntervalSince(st.base) }
        st.paused = true
        st.buttons = []
        st.labels = []
        st.ended = true
        let end = ActivityContent(state: st, staleDate: nil)
        Task { await a.end(end, dismissalPolicy: .after(Date().addingTimeInterval(10 * 60))) }
        current = nil
    }

    func clear() {
        for a in Activity<WorkoutAttributes>.activities {
            Task { await a.end(nil, dismissalPolicy: .immediate) }
        }
        current = nil
    }
}
