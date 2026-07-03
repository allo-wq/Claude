import Foundation

/// Fabric is the easy loader: its meta server hands us a complete version
/// JSON (with `inheritsFrom`) — no installer to run, no processors.
struct FabricInstaller {
    let paths: LauncherPaths
    private let engine = DownloadEngine()

    struct LoaderVersion: Decodable, Identifiable {
        struct Loader: Decodable {
            let version: String
            let stable: Bool?
        }
        let loader: Loader
        var id: String { loader.version }
    }

    /// Loader versions available for a given Minecraft version, newest first.
    func availableLoaders(minecraftVersion: String) async throws -> [LoaderVersion] {
        let url = LauncherPaths.fabricMetaURL
            .appendingPathComponent("versions/loader/\(minecraftVersion)")
        let data = try await engine.fetchData(url)
        return try JSONDecoder().decode([LoaderVersion].self, from: data)
    }

    /// Writes versions/fabric-loader-<loader>-<mc>/….json; returns the version id.
    @discardableResult
    func install(minecraftVersion: String, loaderVersion: String) async throws -> String {
        let versionID = "fabric-loader-\(loaderVersion)-\(minecraftVersion)"
        let url = LauncherPaths.fabricMetaURL
            .appendingPathComponent("versions/loader/\(minecraftVersion)/\(loaderVersion)/profile/json")
        let data = try await engine.fetchData(url)
        let file = paths.versionJSON(id: versionID)
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: file)
        return versionID
    }
}
