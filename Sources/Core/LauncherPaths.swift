import Foundation

/// Single source of truth for the on-disk layout and remote endpoints.
/// Everything lives under the app sandbox's Documents directory so users can
/// inspect/import files through the Files app (UIFileSharingEnabled).
struct LauncherPaths {
    let root: URL

    static let `default` = LauncherPaths(
        root: FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    )

    var versions: URL { root.appendingPathComponent("versions") }
    var libraries: URL { root.appendingPathComponent("libraries") }
    var assets: URL { root.appendingPathComponent("assets") }
    var assetIndexes: URL { assets.appendingPathComponent("indexes") }
    var assetObjects: URL { assets.appendingPathComponent("objects") }
    var runtimes: URL { root.appendingPathComponent("runtimes") }
    var instances: URL { root.appendingPathComponent("instances") }
    var controls: URL { root.appendingPathComponent("controls") }
    var cache: URL { root.appendingPathComponent("cache") }

    /// LWJGL 3 iOS-fork jars + dylibs (GLFW stub, GL4ES/ANGLE). Downloaded by
    /// JREManager alongside the runtimes; substituted into every classpath by
    /// LibraryResolver.
    var lwjglDir: URL { runtimes.appendingPathComponent("lwjgl3-ios") }

    // MARK: Remote endpoints

    static let versionManifestURL = URL(string: "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json")!
    static let assetBaseURL = URL(string: "https://resources.download.minecraft.net")!
    static let fabricMetaURL = URL(string: "https://meta.fabricmc.net/v2")!
    static let forgeMavenURL = URL(string: "https://maven.minecraftforge.net")!

    /// Manifest describing downloadable OpenJDK mobile-port runtimes and the
    /// LWJGL iOS artifact. Point this at your artifact host (e.g. a GitHub
    /// release). Schema: see JREManager.RuntimeManifest.
    static let runtimeManifestURL = URL(string: "https://github.com/OWNER/mojolauncher-artifacts/releases/latest/download/runtime_manifest.json")!

    func versionJSON(id: String) -> URL {
        versions.appendingPathComponent(id).appendingPathComponent("\(id).json")
    }

    func clientJar(id: String) -> URL {
        versions.appendingPathComponent(id).appendingPathComponent("\(id).jar")
    }

    func createDirectories() throws {
        for dir in [versions, libraries, assetIndexes, assetObjects, runtimes, instances, controls, cache] {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
    }
}
