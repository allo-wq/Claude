import Foundation

/// Downloads the asset index and every missing asset object into the shared
/// hashed store (assets/objects/ab/abcdef…), same layout as the desktop
/// launcher so indexes can be shared across versions.
struct AssetDownloader {
    let paths: LauncherPaths
    let engine: DownloadEngine

    private struct AssetIndex: Codable {
        struct Object: Codable {
            let hash: String
            let size: Int
        }
        let objects: [String: Object]
        let virtual: Bool?
        let mapToResources: Bool?

        enum CodingKeys: String, CodingKey {
            case objects, virtual
            case mapToResources = "map_to_resources"
        }
    }

    func ensureAssets(for version: VersionMetadata,
                      progress: @escaping @Sendable (Double) -> Void) async throws {
        guard let ref = version.assetIndex else { return }

        let indexFile = paths.assetIndexes.appendingPathComponent("\(ref.id).json")
        try await engine.run([DownloadTask(url: ref.url, destination: indexFile,
                                           sha1: ref.sha1, size: ref.size)])
        let index = try JSONDecoder().decode(AssetIndex.self, from: Data(contentsOf: indexFile))

        let tasks = index.objects.map { (_, object) -> DownloadTask in
            let prefix = String(object.hash.prefix(2))
            return DownloadTask(
                url: LauncherPaths.assetBaseURL.appendingPathComponent("\(prefix)/\(object.hash)"),
                destination: paths.assetObjects.appendingPathComponent("\(prefix)/\(object.hash)"),
                sha1: object.hash,
                size: object.size
            )
        }
        try await engine.run(tasks, progress: progress)

        // Legacy (< 1.7.3) versions read assets by filename, not hash.
        if index.virtual == true || index.mapToResources == true {
            try materializeVirtual(index: index, id: ref.id)
        }
    }

    private func materializeVirtual(index: AssetIndex, id: String) throws {
        let virtualRoot = paths.assets.appendingPathComponent("virtual/\(id)")
        let fm = FileManager.default
        for (name, object) in index.objects {
            let source = paths.assetObjects.appendingPathComponent("\(object.hash.prefix(2))/\(object.hash)")
            let target = virtualRoot.appendingPathComponent(name)
            guard !fm.fileExists(atPath: target.path) else { continue }
            try fm.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
            try? fm.linkItem(at: source, to: target)   // hard link: no extra space
        }
    }
}
