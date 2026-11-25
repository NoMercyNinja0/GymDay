import Foundation
import AppIntents

/// What Control Center buttons, the widgets' buttons and the Lock Screen card's buttons do. They run inside the GymDay app (iOS
/// starts it when needed): each one leaves a note in the App Group and tells the app, so the page gets it as soon as it can.
enum GymDayIntents {
    static func go(_ to: String) {
        AppGroup.defaults.set(to, forKey: AppGroup.goKey)
        DispatchQueue.main.async { NotificationCenter.default.post(name: .gymdayGo, object: to) }
    }

    static func act(_ a: String) {
        AppGroup.defaults.set(a, forKey: AppGroup.actionKey)
        DispatchQueue.main.async { NotificationCenter.default.post(name: .gymdayLiveAction, object: a) }
    }
}

struct OpenMealPhotoIntent: AppIntent {
    static let title: LocalizedStringResource = "Meal photo"
    static let description = IntentDescription("Opens GymDay's camera for a meal photo.")
    static let openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        GymDayIntents.go("mealphoto")
        return .result()
    }
}

struct OpenAddFoodIntent: AppIntent {
    static let title: LocalizedStringResource = "Add food"
    static let description = IntentDescription("Opens GymDay's food search to add what you ate.")
    static let openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        GymDayIntents.go("food")
        return .result()
    }
}

struct StartWorkoutIntent: AppIntent {
    static let title: LocalizedStringResource = "Start workout"
    static let description = IntentDescription("Opens GymDay to start today's workout.")
    static let openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        GymDayIntents.go("start:-")
        return .result()
    }
}

/// Tick set, Next exercise, Pause, Resume and Finish on the running workout's card.
struct WorkoutButtonIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Workout button"
    static let isDiscoverable: Bool = false

    @Parameter(title: "Button")
    var action: String

    init() {}

    init(action: String) {
        self.action = action
    }

    func perform() async throws -> some IntentResult {
        GymDayIntents.act(action)
        return .result()
    }
}
