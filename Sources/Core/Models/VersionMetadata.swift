import Foundation

/// A per-version JSON (e.g. versions/1.20.4/1.20.4.json), including modloader
/// profiles that use `inheritsFrom`. Field shapes follow Mojang's format.
struct VersionMetadata: Codable {
    var id: String
    var inheritsFrom: String?
    var mainClass: String?
    var type: String?
    var assets: String?
    var assetIndex: AssetIndexRef?
    var javaVersion: JavaVersion?
    var downloads: Downloads?
    var libraries: [Library]?
    var arguments: Arguments?
    /// Pre-1.13 format: a single space-separated template string.
    var minecraftArguments: String?

    struct JavaVersion: Codable {
        var component: String?
        var majorVersion: Int
    }

    struct AssetIndexRef: Codable {
        var id: String
        var url: URL
        var sha1: String
        var totalSize: Int?
        var size: Int?
    }

    struct Downloads: Codable {
        var client: Artifact?
    }

    struct Artifact: Codable {
        var path: String?
        var url: URL
        var sha1: String?
        var size: Int?
    }

    struct Library: Codable {
        var name: String                 // maven coords "group:artifact:version[:classifier]"
        var downloads: LibraryDownloads?
        var rules: [Rule]?
        /// Fabric-style: maven base URL, path derived from `name`.
        var url: URL?

        struct LibraryDownloads: Codable {
            var artifact: Artifact?
            var classifiers: [String: Artifact]?
        }

        /// "group:artifact:version" → "group/path/artifact/version/artifact-version.jar"
        var mavenPath: String? {
            let parts = name.split(separator: ":").map(String.init)
            guard parts.count >= 3 else { return nil }
            let (g, a, v) = (parts[0], parts[1], parts[2])
            let classifier = parts.count > 3 ? "-\(parts[3])" : ""
            return "\(g.replacingOccurrences(of: ".", with: "/"))/\(a)/\(v)/\(a)-\(v)\(classifier).jar"
        }

        var groupID: String { String(name.split(separator: ":").first ?? "") }
    }

    struct Rule: Codable {
        var action: String               // "allow" | "disallow"
        var os: OSMatch?
        var features: [String: Bool]?

        struct OSMatch: Codable {
            var name: String?            // "windows" | "linux" | "osx"
            var arch: String?
            var version: String?
        }
    }

    /// 1.13+ argument lists: entries are either plain strings or
    /// { rules: [...], value: string | [string] }.
    struct Arguments: Codable {
        var game: [Argument]?
        var jvm: [Argument]?
    }

    enum Argument: Codable {
        case plain(String)
        case conditional(rules: [Rule], value: [String])

        init(from decoder: Decoder) throws {
            let single = try decoder.singleValueContainer()
            if let s = try? single.decode(String.self) {
                self = .plain(s)
                return
            }
            let obj = try decoder.container(keyedBy: CodingKeys.self)
            let rules = try obj.decodeIfPresent([Rule].self, forKey: .rules) ?? []
            if let one = try? obj.decode(String.self, forKey: .value) {
                self = .conditional(rules: rules, value: [one])
            } else {
                let many = try obj.decode([String].self, forKey: .value)
                self = .conditional(rules: rules, value: many)
            }
        }

        func encode(to encoder: Encoder) throws {
            switch self {
            case .plain(let s):
                var c = encoder.singleValueContainer()
                try c.encode(s)
            case .conditional(let rules, let value):
                var c = encoder.container(keyedBy: CodingKeys.self)
                try c.encode(rules, forKey: .rules)
                try c.encode(value, forKey: .value)
            }
        }

        private enum CodingKeys: String, CodingKey { case rules, value }
    }

    /// Merge a child (modloader profile) over its parent, Mojang-launcher
    /// semantics: child wins on scalars, lists concatenate child-first.
    func merging(parent: VersionMetadata) -> VersionMetadata {
        var merged = parent
        merged.id = id
        merged.inheritsFrom = nil
        merged.mainClass = mainClass ?? parent.mainClass
        merged.type = type ?? parent.type
        merged.assets = assets ?? parent.assets
        merged.assetIndex = assetIndex ?? parent.assetIndex
        merged.javaVersion = javaVersion ?? parent.javaVersion
        merged.downloads = downloads ?? parent.downloads
        merged.libraries = (libraries ?? []) + (parent.libraries ?? [])
        if let childArgs = arguments {
            merged.arguments = VersionMetadata.Arguments(
                game: (parent.arguments?.game ?? []) + (childArgs.game ?? []),
                jvm: (parent.arguments?.jvm ?? []) + (childArgs.jvm ?? [])
            )
        }
        merged.minecraftArguments = minecraftArguments ?? parent.minecraftArguments
        return merged
    }
}
