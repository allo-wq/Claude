import Foundation

/// Persists instances as instances/<uuid>/instance.json and owns CRUD.
@MainActor
final class InstanceStore: ObservableObject {
    @Published private(set) var instances: [Instance] = []

    private let paths: LauncherPaths

    init(paths: LauncherPaths) {
        self.paths = paths
    }

    func load() throws {
        let fm = FileManager.default
        guard let dirs = try? fm.contentsOfDirectory(at: paths.instances, includingPropertiesForKeys: nil) else {
            instances = []
            return
        }
        instances = dirs.compactMap { dir in
            guard let data = try? Data(contentsOf: dir.appendingPathComponent("instance.json")) else { return nil }
            return try? Self.decoder.decode(Instance.self, from: data)
        }
        .sorted { ($0.lastPlayed ?? .distantPast) > ($1.lastPlayed ?? .distantPast) }
    }

    func save(_ instance: Instance) throws {
        let dir = paths.instances.appendingPathComponent(instance.id.uuidString)
        try FileManager.default.createDirectory(at: instance.gameDirectory(paths: paths), withIntermediateDirectories: true)
        let data = try Self.encoder.encode(instance)
        try data.write(to: dir.appendingPathComponent("instance.json"))
        if let index = instances.firstIndex(where: { $0.id == instance.id }) {
            instances[index] = instance
        } else {
            instances.insert(instance, at: 0)
        }
    }

    func delete(_ instance: Instance) throws {
        try FileManager.default.removeItem(at: paths.instances.appendingPathComponent(instance.id.uuidString))
        instances.removeAll { $0.id == instance.id }
    }

    func markPlayed(_ instance: Instance) {
        var updated = instance
        updated.lastPlayed = Date()
        try? save(updated)
    }

    private static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.outputFormatting = [.prettyPrinted, .sortedKeys]
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}
