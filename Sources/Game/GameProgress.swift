import Foundation

// Per-level best progress + attempts, persisted in UserDefaults.
enum GameProgress {
    static func bestPercent(levelId: Int) -> Int {
        UserDefaults.standard.integer(forKey: "best_\(levelId)")
    }

    static func recordRun(levelId: Int, percent: Int) {
        if percent > bestPercent(levelId: levelId) {
            UserDefaults.standard.set(percent, forKey: "best_\(levelId)")
        }
        let attempts = UserDefaults.standard.integer(forKey: "attempts_\(levelId)") + 1
        UserDefaults.standard.set(attempts, forKey: "attempts_\(levelId)")
    }

    static func attempts(levelId: Int) -> Int {
        UserDefaults.standard.integer(forKey: "attempts_\(levelId)")
    }

    static var practiceMode: Bool {
        get { UserDefaults.standard.bool(forKey: "practiceMode") }
        set { UserDefaults.standard.set(newValue, forKey: "practiceMode") }
    }
}
