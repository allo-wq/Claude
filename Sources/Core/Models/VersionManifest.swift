import Foundation

/// piston-meta.mojang.com/mc/game/version_manifest_v2.json
struct VersionManifest: Codable {
    struct Latest: Codable {
        let release: String
        let snapshot: String
    }

    struct Entry: Codable, Identifiable, Hashable {
        let id: String
        let type: String        // "release" | "snapshot" | "old_beta" | "old_alpha"
        let url: URL
        let sha1: String
        let releaseTime: Date

        var isRelease: Bool { type == "release" }
    }

    let latest: Latest
    let versions: [Entry]

    static let dateDecoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}
