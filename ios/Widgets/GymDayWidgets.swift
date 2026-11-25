import WidgetKit
import SwiftUI
import AppIntents

@main
struct GymDayWidgets: WidgetBundle {
    var body: some Widget {
        WeekWidget()
        TodayWidget()
        FoodWidget()
        WorkoutLiveActivity()
        MealPhotoControl()
        AddFoodControl()
        StartWorkoutControl()
    }
}

// MARK: the look shared by the widgets

enum Look {
    static let bg = Color(red: 11 / 255, green: 17 / 255, blue: 26 / 255)
    static let accent = Color(red: 61 / 255, green: 155 / 255, blue: 1)
    static let cyan = Color(red: 34 / 255, green: 227 / 255, blue: 1)
    static let green = Color(red: 52 / 255, green: 211 / 255, blue: 153 / 255)
    static let dim = Color.white.opacity(0.62)
}

/// One entry for now; the widgets are drawn again when the page sends new numbers, and at midnight (a new "today").
struct DayEntry: TimelineEntry {
    let date: Date
}

struct DayProvider: TimelineProvider {
    func placeholder(in context: Context) -> DayEntry { DayEntry(date: Date()) }
    func getSnapshot(in context: Context, completion: @escaping (DayEntry) -> Void) { completion(DayEntry(date: Date())) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<DayEntry>) -> Void) {
        let now = Date()
        let midnight = Calendar.current.startOfDay(for: now.addingTimeInterval(86400)).addingTimeInterval(60)
        completion(Timeline(entries: [DayEntry(date: now)], policy: .after(midnight)))
    }
}

struct Bar: View {
    let value: Double
    var color: Color = Look.accent
    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.12))
                Capsule().fill(color).frame(width: max(4, g.size.width * min(1, max(0, value))))
            }
        }
        .frame(height: 6)
    }
}

// MARK: Today: readiness, calories left and what is next (Android's TodayWidget)

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "GymDayToday", provider: DayProvider()) { e in TodayView(entry: e) }
            .configurationDisplayName("GymDay today")
            .description("Readiness, calories left and your next workout.")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct TodayView: View {
    let entry: DayEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        let d = AppGroup.json(AppGroup.todayKey)
        let today = AppGroup.dayKey(entry.date)
        let r = Words.ready(d, today: today)
        let k = Words.kcalLine(d, today: today), n = Words.nextLine(d, now: entry.date)
        VStack(alignment: .leading, spacing: 6) {
            Text("TODAY").font(.caption2.weight(.bold)).foregroundStyle(Look.accent)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(r?.0 ?? "–").font(.system(size: family == .systemSmall ? 34 : 40, weight: .bold, design: .rounded)).foregroundStyle(.white)
                Text(r == nil ? "Open for today's readiness" : (r!.1.isEmpty ? "Readiness" : r!.1))
                    .font(.caption).foregroundStyle(Look.dim).lineLimit(2)
            }
            Spacer(minLength: 0)
            Label(k.isEmpty ? "No calorie target" : k, systemImage: "flame.fill").font(.caption.weight(.semibold)).foregroundStyle(.white).lineLimit(1)
            Label(n.isEmpty ? "Open GymDay to plan your week" : n, systemImage: "dumbbell.fill").font(.caption).foregroundStyle(Look.dim).lineLimit(2)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .containerBackground(Look.bg, for: .widget)
        .widgetURL(URL(string: "gymday://go/home"))
    }
}

// MARK: Food: calories and protein against their targets, with Add (Android's FoodWidget)

struct FoodWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "GymDayFood", provider: DayProvider()) { e in FoodView(entry: e) }
            .configurationDisplayName("GymDay food")
            .description("Calories and protein today, and a quick Add.")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct FoodView: View {
    let entry: DayEntry

    var body: some View {
        let d = AppGroup.json(AppGroup.foodKey)
        let fresh = J.str(d, "day") == AppGroup.dayKey(entry.date)
        let kcal = fresh ? J.num(d, "kcal") : 0, kt = J.num(d, "kt"), p = fresh ? J.num(d, "p") : 0, pt = J.num(d, "pt")
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("FOOD TODAY").font(.caption2.weight(.bold)).foregroundStyle(Look.accent)
                Spacer()
                Link(destination: URL(string: "gymday://go/food")!) {
                    Image(systemName: "plus.circle.fill").font(.title3).foregroundStyle(Look.accent)
                }
            }
            Text(kt > 0 ? Words.n0(kcal) + " / " + Words.n0(kt) + " kcal" : Words.n0(kcal) + " kcal").font(.headline).foregroundStyle(.white).lineLimit(1)
                .minimumScaleFactor(0.7)
            Bar(value: kt > 0 ? kcal / kt : 0)
            Text(kt > 0 ? (kcal <= kt ? Words.n0(kt - kcal) + " left" : Words.n0(kcal - kt) + " over") : (kcal > 0 ? "" : "nothing yet"))
                .font(.caption).foregroundStyle(Look.dim)
            Spacer(minLength: 0)
            Text(pt > 0 ? "Protein \(Int(p.rounded())) / \(Int(pt.rounded())) g" : "Protein \(Int(p.rounded())) g").font(.caption.weight(.semibold)).foregroundStyle(.white)
            Bar(value: pt > 0 ? p / pt : 0, color: Look.green)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .containerBackground(Look.bg, for: .widget)
        .widgetURL(URL(string: "gymday://go/foodtab"))
    }
}

// MARK: Week: workouts this week, a dot a day, and today's workout with Start; while training, the workout itself (WeekWidget)

struct WeekWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "GymDayWeek", provider: DayProvider()) { e in WeekView(entry: e) }
            .configurationDisplayName("GymDay")
            .description("Your week, today's workout and a Start button. While you train: the workout and its buttons.")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct WeekView: View {
    let entry: DayEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        let d = AppGroup.json(AppGroup.weekKey)
        Group {
            if let w = d["w"] as? [String: Any] {
                training(WorkoutAttributes.ContentState(card: w))
            } else {
                week(d)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .containerBackground(Look.bg, for: .widget)
    }

    private func week(_ d: [String: Any]) -> some View {
        let n = Int(J.num(d, "n")), goal = Int(J.num(d, "goal"))
        let ws = Date(timeIntervalSince1970: J.num(d, "ws") / 1000)
        let thisWeek = entry.date.timeIntervalSince(ws) < 7 * 86400 && entry.date >= ws
        let days = thisWeek ? ((d["days"] as? [Any]) ?? []).map { ($0 as? NSNumber)?.intValue ?? 0 } : Array(repeating: 0, count: 7)
        let wd = Calendar.current.component(.weekday, from: entry.date) - 1                 // 0 = Sunday
        let plan = (d["plan"] as? [Any]) ?? []
        let today = wd < plan.count ? plan[wd] as? [String: Any] : nil
        let todayIndex = (wd + 6) % 7                                                     // Monday first
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(thisWeek ? "\(n)" : "0").font(.system(size: 30, weight: .bold, design: .rounded)).foregroundStyle(.white)
                Text(goal > 0 ? "of \(goal) this week" : "this week").font(.caption).foregroundStyle(Look.dim)
            }
            HStack(spacing: 6) {
                ForEach(0..<7, id: \.self) { i in
                    Circle()
                        .fill(i < days.count && days[i] > 0 ? Look.accent : Color.white.opacity(0.12))
                        .overlay(Circle().stroke(i == todayIndex ? Look.cyan : .clear, lineWidth: 2))
                        .frame(width: 12, height: 12)
                }
            }
            Spacer(minLength: 0)
            if let t = today {
                Text(J.str(t, "name")).font(.subheadline.weight(.semibold)).foregroundStyle(.white).lineLimit(1)
                Link(destination: URL(string: "gymday://start/" + J.str(t, "id"))!) {
                    Text("Start").font(.caption.weight(.bold)).padding(.horizontal, 14).padding(.vertical, 6)
                        .background(Capsule().fill(Look.accent)).foregroundStyle(.white)
                }
            } else {
                Text(J.bool(d, "sched") ? "Rest day" : (J.str(d, "last").isEmpty ? "Ready when you are" : "Last: " + J.str(d, "last")))
                    .font(.caption).foregroundStyle(Look.dim).lineLimit(1)
                Link(destination: URL(string: "gymday://start/-")!) {
                    Text("Start").font(.caption.weight(.bold)).padding(.horizontal, 14).padding(.vertical, 6)
                        .background(Capsule().fill(Color.white.opacity(0.14))).foregroundStyle(.white)
                }
            }
        }
    }

    private func training(_ s: WorkoutAttributes.ContentState) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(s.title).font(.subheadline.weight(.bold)).foregroundStyle(.white).lineLimit(1)
                Spacer()
                // the same timer as the Lock Screen card (timerInterval; the .timer date style stood still on the home screen in the Simulator)
                TimerText(s: s).font(.caption.monospacedDigit())
            }
            Text(s.text).font(.caption).foregroundStyle(Look.dim).lineLimit(2)
            Bar(value: s.progress)
            Spacer(minLength: 0)
            HStack(spacing: 6) {
                ForEach(0..<min(s.buttons.count, s.labels.count, family == .systemSmall ? 1 : 3), id: \.self) { i in
                    Button(intent: WorkoutButtonIntent(action: s.buttons[i])) {
                        Text(s.labels[i]).font(.caption2.weight(.bold)).lineLimit(1).minimumScaleFactor(0.7).frame(maxWidth: .infinity)
                    }
                    .tint(s.buttons[i] == "tick" ? Look.accent : Color.white.opacity(0.2))
                }
            }
        }
    }
}

// MARK: Control Center buttons (Android's Quick Settings tiles)

struct MealPhotoControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "app.gymday.control.mealphoto") {
            ControlWidgetButton(action: OpenMealPhotoIntent()) {
                Label("Meal photo", systemImage: "camera.fill")
            }
        }
        .displayName("Meal photo")
        .description("Opens GymDay's camera for a meal photo.")
    }
}

struct AddFoodControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "app.gymday.control.food") {
            ControlWidgetButton(action: OpenAddFoodIntent()) {
                Label("Add food", systemImage: "fork.knife")
            }
        }
        .displayName("Add food")
        .description("Opens GymDay's food search.")
    }
}

struct StartWorkoutControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "app.gymday.control.start") {
            ControlWidgetButton(action: StartWorkoutIntent()) {
                Label("Start workout", systemImage: "figure.strengthtraining.traditional")
            }
        }
        .displayName("Start workout")
        .description("Opens GymDay to start today's workout.")
    }
}
