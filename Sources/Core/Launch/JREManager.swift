import Foundation

/// Downloads, unpacks, and selects OpenJDK mobile-port runtimes (Zero VM,
/// interpreter-only) plus the shared LWJGL iOS artifact. Runtimes are treated
/// as versioned server-side artifacts so upstream rebuilds never require an
/// app update.
final class JREManager {
    private let paths: LauncherPaths
    private let engine = DownloadEngine()

    init(paths: LauncherPaths) {
        self.paths = paths
    }

    struct Runtime {
        let major: Int
        let home: URL           // e.g. Documents/runtimes/jre17
        /// Zero-variant HotSpot still installs as lib/server/libjvm.dylib;
        /// libjli.dylib next to it is what jvm_bridge actually dlopens.
        var libjliPath: URL { home.appendingPathComponent("lib/libjli.dylib") }
    }

    /// runtime_manifest.json on the artifact server:
    /// { "runtimes": [ { "major": 17, "version": "17.0.11+1", "url": "…tar.xz", "sha1": "…" } ],
    ///   "lwjgl": { "version": "3.3.3-ios1", "url": "…tar.xz", "sha1": "…" } }
    struct RuntimeManifest: Codable {
        struct Entry: Codable {
            let major: Int
            let version: String
            let url: URL
            let sha1: String?
        }
        let runtimes: [Entry]
        let lwjgl: Entry?
    }

    /// Ensures a runtime able to run class-file major `major` is installed and
    /// returns it. Exact match preferred; otherwise the smallest newer one.
    func ensureRuntime(major: Int, progress: @escaping @Sendable (Double) -> Void) async throws -> Runtime {
        let home = paths.runtimes.appendingPathComponent("jre\(major)")
        let installed = Runtime(major: major, home: home)
        if FileManager.default.fileExists(atPath: installed.libjliPath.path) {
            try await ensureSharedArtifacts(progress: { _ in })
            return installed
        }

        let manifest = try await fetchRuntimeManifest()
        let candidates = manifest.runtimes.filter { $0.major >= major }.sorted { $0.major < $1.major }
        guard let entry = candidates.first(where: { $0.major == major }) ?? candidates.first else {
            throw LauncherError.runtimeUnavailable(major: major)
        }

        let archive = paths.cache.appendingPathComponent("jre\(entry.major).tar.xz")
        try await engine.run([DownloadTask(url: entry.url, destination: archive, sha1: entry.sha1, size: nil)],
                             progress: { progress($0 * 0.85) })
        try TarXZExtractor.extract(archive: archive, into: home)
        try? FileManager.default.removeItem(at: archive)
        progress(0.95)

        try await ensureSharedArtifacts(progress: { _ in })
        progress(1)
        return Runtime(major: entry.major, home: home)
    }

    /// LWJGL 3 iOS fork (jars + libgl4es/ANGLE/GLFW-stub dylibs) shared by
    /// every runtime and every instance.
    func ensureSharedArtifacts(progress: @escaping @Sendable (Double) -> Void) async throws {
        guard !FileManager.default.fileExists(atPath: paths.lwjglDir.path) else { return }
        let manifest = try await fetchRuntimeManifest()
        guard let lwjgl = manifest.lwjgl else { return }
        let archive = paths.cache.appendingPathComponent("lwjgl3-ios.tar.xz")
        try await engine.run([DownloadTask(url: lwjgl.url, destination: archive, sha1: lwjgl.sha1, size: nil)],
                             progress: progress)
        try TarXZExtractor.extract(archive: archive, into: paths.lwjglDir)
        try? FileManager.default.removeItem(at: archive)
    }

    private var cachedManifest: RuntimeManifest?

    private func fetchRuntimeManifest() async throws -> RuntimeManifest {
        if let cachedManifest { return cachedManifest }
        let data = try await engine.fetchData(LauncherPaths.runtimeManifestURL)
        let manifest = try JSONDecoder().decode(RuntimeManifest.self, from: data)
        cachedManifest = manifest
        return manifest
    }
}
