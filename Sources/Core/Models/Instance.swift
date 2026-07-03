import Foundation

enum ModLoader: String, Codable, CaseIterable, Identifiable {
    case vanilla
    case fabric
    case forge

    var id: String { rawValue }
    var displayName: String {
        switch self {
        case .vanilla: return "Vanilla"
        case .fabric: return "Fabric"
        case .forge: return "Forge"
        }
    }
}

enum Renderer: String, Codable, CaseIterable, Identifiable {
    case gl4es      // desktop GL → GLES3
    case angle      // desktop GL → Metal (better for 1.17+ core profile)

    var id: String { rawValue }
    var libraryName: String {
        switch self {
        case .gl4es: return "libgl4es.dylib"
        case .angle: return "libtinywrapper.dylib"
        }
    }
}

/// One playable configuration: a Minecraft version + optional mod loader +
/// its own game directory, JVM settings, and control layout.
struct Instance: Codable, Identifiable, Hashable {
    var id = UUID()
    var name: String
    var minecraftVersion: String            // e.g. "1.20.4"
    var modLoader: ModLoader = .vanilla
    /// Loader version, e.g. Fabric "0.15.11" or Forge "49.0.30".
    var modLoaderVersion: String?
    var memoryMB: Int = 2048
    var renderer: Renderer = .gl4es
    var extraJVMArgs: String = ""
    var controlLayoutName: String = "default"
    var lastPlayed: Date?

    /// The version JSON id actually launched. Modloader installers write a
    /// profile JSON under versions/ with `inheritsFrom` = minecraftVersion.
    var effectiveVersionID: String {
        switch modLoader {
        case .vanilla:
            return minecraftVersion
        case .fabric:
            return "fabric-loader-\(modLoaderVersion ?? "unknown")-\(minecraftVersion)"
        case .forge:
            return "\(minecraftVersion)-forge-\(modLoaderVersion ?? "unknown")"
        }
    }

    func gameDirectory(paths: LauncherPaths) -> URL {
        paths.instances.appendingPathComponent(id.uuidString).appendingPathComponent("gamedir")
    }
}
