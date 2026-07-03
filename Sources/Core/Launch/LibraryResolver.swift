import Foundation

/// Turns a resolved VersionMetadata into a concrete download + classpath plan.
///
/// The one big deviation from a desktop launcher: **LWJGL and its natives are
/// never taken from Mojang.** Desktop LWJGL hard-depends on Cocoa/X11/Win32;
/// the LWJGL 3 iOS fork (downloaded by JREManager into `paths.lwjglDir`)
/// provides GLFW/OpenGL/OpenAL bindings that talk to our surface_bridge and
/// input_bridge instead. Its jars are appended to every classpath.
struct LibraryResolver {
    let paths: LauncherPaths
    var rules = RuleEvaluator()

    struct Plan {
        var downloads: [DownloadTask]
        var classpath: [URL]
    }

    func plan(for version: VersionMetadata) throws -> Plan {
        var downloads: [DownloadTask] = []
        var classpath: [URL] = []
        var seenModules = Set<String>()   // "group:artifact" — child (modloader) wins on duplicates

        for library in version.libraries ?? [] {
            guard rules.allows(library.rules) else { continue }
            if isReplacedByIOSPort(library) { continue }

            let coords = library.name.split(separator: ":").map(String.init)
            guard coords.count >= 3 else { continue }
            let module = "\(coords[0]):\(coords[1])"
            guard seenModules.insert(module).inserted else { continue }

            if let artifact = library.downloads?.artifact, let path = artifact.path ?? library.mavenPath {
                let dest = paths.libraries.appendingPathComponent(path)
                downloads.append(DownloadTask(url: artifact.url, destination: dest,
                                              sha1: artifact.sha1, size: artifact.size))
                classpath.append(dest)
            } else if let path = library.mavenPath {
                // Fabric/Forge style: maven base URL + derived path.
                let base = library.url ?? URL(string: "https://libraries.minecraft.net")!
                let dest = paths.libraries.appendingPathComponent(path)
                downloads.append(DownloadTask(url: base.appendingPathComponent(path),
                                              destination: dest, sha1: nil, size: nil))
                classpath.append(dest)
            }
            // `downloads.classifiers` (desktop natives) are intentionally
            // dropped: natives come from the LWJGL iOS artifact instead.
        }

        // Client jar
        if let client = version.downloads?.client {
            let dest = paths.clientJar(id: version.id)
            downloads.append(DownloadTask(url: client.url, destination: dest,
                                          sha1: client.sha1, size: client.size))
            classpath.append(dest)
        }

        // LWJGL 3 iOS fork jars, present after JREManager.ensureSharedArtifacts().
        let lwjglJars = (try? FileManager.default.contentsOfDirectory(at: paths.lwjglDir, includingPropertiesForKeys: nil))?
            .filter { $0.pathExtension == "jar" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent } ?? []
        classpath.append(contentsOf: lwjglJars)

        return Plan(downloads: downloads, classpath: classpath)
    }

    private func isReplacedByIOSPort(_ library: VersionMetadata.Library) -> Bool {
        let group = library.groupID
        // Everything LWJGL, plus desktop-only helpers that crash off-desktop.
        return group.hasPrefix("org.lwjgl")
            || library.name.contains("java-objc-bridge")
            || library.name.contains(":natives-")
    }
}
