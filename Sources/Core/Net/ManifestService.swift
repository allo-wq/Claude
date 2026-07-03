import Foundation

/// Fetches the Mojang version manifest and per-version JSONs, caching them on
/// disk, and resolves `inheritsFrom` chains (Fabric/Forge profiles).
final class ManifestService {
    private let paths: LauncherPaths
    private let engine = DownloadEngine()
    private var cachedManifest: VersionManifest?

    init(paths: LauncherPaths) {
        self.paths = paths
    }

    func fetchManifest() async throws -> VersionManifest {
        if let cachedManifest { return cachedManifest }
        let cacheFile = paths.cache.appendingPathComponent("version_manifest_v2.json")
        do {
            let data = try await engine.fetchData(LauncherPaths.versionManifestURL)
            try? data.write(to: cacheFile)
            let manifest = try VersionManifest.dateDecoder.decode(VersionManifest.self, from: data)
            cachedManifest = manifest
            return manifest
        } catch {
            // Offline: fall back to the cached copy so existing instances still launch.
            guard let data = try? Data(contentsOf: cacheFile) else { throw error }
            let manifest = try VersionManifest.dateDecoder.decode(VersionManifest.self, from: data)
            cachedManifest = manifest
            return manifest
        }
    }

    /// Loads a version JSON — local first (covers modloader profiles that only
    /// exist on disk), then Mojang's CDN via the manifest entry.
    func fetchVersionMetadata(id: String) async throws -> VersionMetadata {
        let local = paths.versionJSON(id: id)
        if let data = try? Data(contentsOf: local) {
            return try JSONDecoder().decode(VersionMetadata.self, from: data)
        }
        let manifest = try await fetchManifest()
        guard let entry = manifest.versions.first(where: { $0.id == id }) else {
            throw LauncherError.unknownVersion(id)
        }
        let data = try await engine.fetchData(entry.url)
        try FileManager.default.createDirectory(at: local.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: local)
        return try JSONDecoder().decode(VersionMetadata.self, from: data)
    }

    /// Resolves the full `inheritsFrom` chain into a single flattened version.
    func resolveVersion(id: String) async throws -> VersionMetadata {
        var chain: [VersionMetadata] = []
        var currentID: String? = id
        while let cid = currentID {
            guard chain.count < 8 else { throw LauncherError.inheritanceLoop(id) }
            let meta = try await fetchVersionMetadata(id: cid)
            chain.append(meta)
            currentID = meta.inheritsFrom
        }
        // chain = [child, parent, grandparent…] → fold right-to-left
        var resolved = chain.removeLast()
        while let child = chain.popLast() {
            resolved = child.merging(parent: resolved)
        }
        return resolved
    }
}

enum LauncherError: LocalizedError {
    case unknownVersion(String)
    case inheritanceLoop(String)
    case missingMainClass(String)
    case runtimeUnavailable(major: Int)
    case notEntitled
    case jvmStartFailed(Int32)

    var errorDescription: String? {
        switch self {
        case .unknownVersion(let id): return "Unknown Minecraft version “\(id)”."
        case .inheritanceLoop(let id): return "Version “\(id)” has a circular inheritsFrom chain."
        case .missingMainClass(let id): return "Version “\(id)” resolved without a mainClass."
        case .runtimeUnavailable(let major): return "No downloadable Java \(major) runtime is available for this device."
        case .notEntitled: return "This Microsoft account does not own Minecraft: Java Edition."
        case .jvmStartFailed(let code): return "The Java VM failed to start (code \(code)). See the log tab."
        }
    }
}
