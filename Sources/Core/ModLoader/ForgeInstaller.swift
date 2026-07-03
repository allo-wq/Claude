import Foundation

/// Forge is the hard loader. Modern (1.13+) Forge installers run "processors"
/// (deobfuscation, jar patching) that must execute in a JVM. Rather than
/// re-implement that pipeline, we do what PojavLauncher does: download the
/// official installer jar and run it headless *inside our own JVM* on device,
/// pointed at our launcher directory laid out like a vanilla .minecraft.
///
/// The installer expects a `launcher_profiles.json` to exist and writes
/// versions/<mc>-forge-<ver>/<…>.json + libraries/ in place — which is
/// exactly our on-disk layout, so no post-processing is needed.
struct ForgeInstaller {
    let paths: LauncherPaths
    let jreManager: JREManager
    private let engine = DownloadEngine()

    /// promotions_slim.json: { "promos": { "1.20.4-recommended": "49.0.30", … } }
    struct Promotions: Decodable {
        let promos: [String: String]
    }

    func availableVersions(minecraftVersion: String) async throws -> [String] {
        let url = LauncherPaths.forgeMavenURL
            .appendingPathComponent("net/minecraftforge/forge/promotions_slim.json")
        let data = try await engine.fetchData(url)
        let promos = try JSONDecoder().decode(Promotions.self, from: data).promos
        var versions: [String] = []
        if let recommended = promos["\(minecraftVersion)-recommended"] { versions.append(recommended) }
        if let latest = promos["\(minecraftVersion)-latest"], !versions.contains(latest) { versions.append(latest) }
        return versions
    }

    @discardableResult
    func install(minecraftVersion: String, forgeVersion: String,
                 progress: @escaping @Sendable (Double) -> Void) async throws -> String {
        let full = "\(minecraftVersion)-\(forgeVersion)"
        let versionID = "\(minecraftVersion)-forge-\(forgeVersion)"

        // 1. Download the official installer jar.
        let installerURL = LauncherPaths.forgeMavenURL.appendingPathComponent(
            "net/minecraftforge/forge/\(full)/forge-\(full)-installer.jar")
        let installerJar = paths.cache.appendingPathComponent("forge-\(full)-installer.jar")
        try await engine.run([DownloadTask(url: installerURL, destination: installerJar, sha1: nil, size: nil)],
                             progress: { progress($0 * 0.3) })

        // 2. The installer refuses to run without a launcher_profiles.json.
        let profilesFile = paths.root.appendingPathComponent("launcher_profiles.json")
        if !FileManager.default.fileExists(atPath: profilesFile.path) {
            try #"{"profiles":{},"settings":{},"version":3}"#.data(using: .utf8)!.write(to: profilesFile)
        }

        // 3. Run it headless in our JVM (interpreter — installs take a few
        //    minutes on device; the UI shows an indeterminate phase).
        //    ForgeCLI-style entrypoint: --installClient <root>.
        let runtime = try await jreManager.ensureRuntime(major: 17) { p in progress(0.3 + p * 0.2) }
        progress(0.55)
        let rc = installerJar.path.withCString { jarPath -> Int32 in
            let args = ["java", "-jar", installerJar.path, "--installClient", paths.root.path]
            var cArgs: [UnsafeMutablePointer<CChar>?] = args.map { strdup($0) }
            defer { cArgs.forEach { free($0) } }
            _ = jarPath
            return cArgs.withUnsafeMutableBufferPointer { buffer in
                mojo_run_jvm_and_wait(runtime.libjliPath.path, Int32(args.count), buffer.baseAddress)
            }
        }
        guard rc == 0 else { throw LauncherError.jvmStartFailed(rc) }
        progress(1)

        // 4. The installer wrote versions/<versionID>/<versionID>.json in place.
        guard FileManager.default.fileExists(atPath: paths.versionJSON(id: versionID).path) else {
            throw LauncherError.unknownVersion(versionID)
        }
        return versionID
    }
}
