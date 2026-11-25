import WidgetKit
import SwiftUI
import ActivityKit
import AppIntents

/// The running workout on the Lock Screen and in the Dynamic Island, with the card's buttons (Tick set, Next, Pause, Finish).
struct WorkoutLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: WorkoutAttributes.self) { context in
            LockCard(s: context.state)
                .activityBackgroundTint(Look.bg)
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label(context.state.chip.isEmpty ? "GymDay" : context.state.chip, systemImage: "dumbbell.fill")
                        .font(.caption.weight(.semibold)).foregroundStyle(Look.accent).lineLimit(1)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    TimerText(s: context.state).font(.caption.monospacedDigit().weight(.semibold))
                        .frame(minWidth: 52, alignment: .trailing).padding(.trailing, 6)   // the island's corner cut the last digit
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.title).font(.subheadline.weight(.bold)).lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(context.state.text).font(.caption).foregroundStyle(Look.dim).lineLimit(1)
                        Bar(value: context.state.progress)
                        Buttons(s: context.state)
                    }
                }
            } compactLeading: {
                Image(systemName: "dumbbell.fill").foregroundStyle(Look.accent)
            } compactTrailing: {
                TimerText(s: context.state).font(.caption2.monospacedDigit()).frame(maxWidth: 52)
            } minimal: {
                Image(systemName: "dumbbell.fill").foregroundStyle(Look.accent)
            }
            .keylineTint(Look.accent)
        }
    }
}

struct TimerText: View {
    let s: WorkoutAttributes.ContentState
    var body: some View {
        if s.paused || s.ended {
            Text(s.still).foregroundStyle(Look.dim)
        } else {
            // timerInterval is the Live Activity timer: it keeps ticking on the Lock Screen (the .timer date style showed "2 minutes" there)
            Text(timerInterval: s.base...Date.distantFuture, countsDown: false, showsHours: true)
                .foregroundStyle(Look.cyan).multilineTextAlignment(.trailing)
        }
    }
}

struct Buttons: View {
    let s: WorkoutAttributes.ContentState
    var body: some View {
        HStack(spacing: 8) {
            ForEach(0..<min(s.buttons.count, s.labels.count), id: \.self) { i in
                Button(intent: WorkoutButtonIntent(action: s.buttons[i])) {
                    Text(s.labels[i]).font(.caption.weight(.bold)).lineLimit(1).minimumScaleFactor(0.7).frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(s.buttons[i] == "tick" || s.buttons[i] == "resume" ? Look.accent : Color.white.opacity(0.18))
            }
        }
    }
}

struct LockCard: View {
    let s: WorkoutAttributes.ContentState
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: s.ended ? "checkmark.circle.fill" : "dumbbell.fill").foregroundStyle(s.ended ? Look.green : Look.accent)
                Text(s.title).font(.headline).foregroundStyle(.white).lineLimit(1)
                Spacer()
                TimerText(s: s).font(.headline.monospacedDigit())
            }
            if !s.text.isEmpty { Text(s.text).font(.subheadline).foregroundStyle(Look.dim).lineLimit(2) }
            if !s.ended { Bar(value: s.progress) }
            if !s.buttons.isEmpty { Buttons(s: s) }
        }
        .padding(16)
    }
}
