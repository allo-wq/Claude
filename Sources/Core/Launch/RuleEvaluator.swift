import Foundation

/// Evaluates Mojang `rules` arrays. We present ourselves as osx/arm64 — the
/// closest match for the Darwin-based iOS environment — and rely on
/// LibraryResolver to swap out anything actually platform-specific (LWJGL,
/// natives). Feature flags mirror what the vanilla launcher passes.
struct RuleEvaluator {
    var osName = "osx"
    var osArch = "arm64"
    var features: [String: Bool] = [
        "is_demo_user": false,
        "has_custom_resolution": true,
        "has_quick_plays_support": false,
        "is_quick_play_singleplayer": false,
        "is_quick_play_multiplayer": false,
        "is_quick_play_realms": false,
    ]

    /// No rules ⇒ allowed. Otherwise: last matching rule wins, default deny.
    func allows(_ rules: [VersionMetadata.Rule]?) -> Bool {
        guard let rules, !rules.isEmpty else { return true }
        var allowed = false
        for rule in rules {
            guard matches(rule) else { continue }
            allowed = (rule.action == "allow")
        }
        return allowed
    }

    private func matches(_ rule: VersionMetadata.Rule) -> Bool {
        if let os = rule.os {
            if let name = os.name, name != osName { return false }
            if let arch = os.arch, arch != osArch { return false }
            // os.version regexes target real macOS versions; ignore on iOS.
        }
        if let wanted = rule.features {
            for (key, value) in wanted where (features[key] ?? false) != value {
                return false
            }
        }
        return true
    }
}
