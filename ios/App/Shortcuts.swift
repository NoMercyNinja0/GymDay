import AppIntents

/// "Hey Siri, log a meal photo in GymDay" and the Shortcuts app.
struct GymDayShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: OpenMealPhotoIntent(), phrases: ["Log a meal photo in \(.applicationName)", "Take a meal photo in \(.applicationName)"],
                    shortTitle: "Meal photo", systemImageName: "camera")
        AppShortcut(intent: OpenAddFoodIntent(), phrases: ["Add food in \(.applicationName)", "Log food in \(.applicationName)"],
                    shortTitle: "Add food", systemImageName: "fork.knife")
        AppShortcut(intent: StartWorkoutIntent(), phrases: ["Start a workout in \(.applicationName)", "Start my \(.applicationName) workout"],
                    shortTitle: "Start workout", systemImageName: "figure.strengthtraining.traditional")
    }
}
