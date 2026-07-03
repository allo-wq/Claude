import Foundation
import CryptoKit

/// One file to fetch and verify. Everything the launcher downloads (version
/// JSONs aside) goes through DownloadEngine so verification, retry, and
/// progress reporting behave uniformly.
struct DownloadTask: Hashable {
    let url: URL
    let destination: URL
    let sha1: String?
    let size: Int?
}

enum DownloadError: LocalizedError {
    case badStatus(URL, Int)
    case hashMismatch(URL, expected: String, actual: String)

    var errorDescription: String? {
        switch self {
        case .badStatus(let url, let code):
            return "HTTP \(code) for \(url.lastPathComponent)"
        case .hashMismatch(let url, let expected, let actual):
            return "Corrupt download \(url.lastPathComponent): expected \(expected.prefix(8))…, got \(actual.prefix(8))…"
        }
    }
}

actor DownloadEngine {
    private let session: URLSession
    private let maxConcurrent: Int
    private let maxRetries = 3

    init(maxConcurrent: Int = 6) {
        let config = URLSessionConfiguration.default
        config.httpMaximumConnectionsPerHost = maxConcurrent
        config.timeoutIntervalForRequest = 30
        self.session = URLSession(configuration: config)
        self.maxConcurrent = maxConcurrent
    }

    /// Runs all tasks, skipping files already present with a matching SHA-1.
    /// `progress` is called with completed/total in [0,1].
    func run(_ tasks: [DownloadTask], progress: @escaping @Sendable (Double) -> Void = { _ in }) async throws {
        let pending = tasks.filter { !Self.isSatisfied($0) }
        guard !pending.isEmpty else {
            progress(1)
            return
        }
        var completed = 0
        var iterator = pending.makeIterator()

        try await withThrowingTaskGroup(of: Void.self) { group in
            var inFlight = 0
            func addNext() -> Bool {
                guard let task = iterator.next() else { return false }
                group.addTask { try await self.fetch(task) }
                return true
            }
            while inFlight < maxConcurrent, addNext() { inFlight += 1 }
            while try await group.next() != nil {
                completed += 1
                progress(Double(completed) / Double(pending.count))
                _ = addNext()
            }
        }
    }

    func fetchData(_ url: URL) async throws -> Data {
        let (data, response) = try await session.data(from: url)
        if let http = response as? HTTPURLResponse, http.statusCode != 200 {
            throw DownloadError.badStatus(url, http.statusCode)
        }
        return data
    }

    private func fetch(_ task: DownloadTask) async throws {
        var lastError: Error?
        for attempt in 0..<maxRetries {
            do {
                try await fetchOnce(task)
                return
            } catch {
                lastError = error
                let backoff = UInt64(500_000_000) << attempt   // 0.5s, 1s, 2s
                try? await Task.sleep(nanoseconds: backoff)
            }
        }
        throw lastError!
    }

    private func fetchOnce(_ task: DownloadTask) async throws {
        let (tmp, response) = try await session.download(from: task.url)
        defer { try? FileManager.default.removeItem(at: tmp) }
        if let http = response as? HTTPURLResponse, http.statusCode != 200 {
            throw DownloadError.badStatus(task.url, http.statusCode)
        }
        if let expected = task.sha1 {
            let actual = try Self.sha1Hex(of: tmp)
            guard actual == expected.lowercased() else {
                throw DownloadError.hashMismatch(task.url, expected: expected, actual: actual)
            }
        }
        let fm = FileManager.default
        try fm.createDirectory(at: task.destination.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? fm.removeItem(at: task.destination)
        try fm.moveItem(at: tmp, to: task.destination)
    }

    static func isSatisfied(_ task: DownloadTask) -> Bool {
        guard FileManager.default.fileExists(atPath: task.destination.path) else { return false }
        guard let expected = task.sha1 else { return true }
        return (try? sha1Hex(of: task.destination)) == expected.lowercased()
    }

    static func sha1Hex(of file: URL) throws -> String {
        // SHA-1 is what Mojang's manifests provide; used for integrity, not security.
        let handle = try FileHandle(forReadingFrom: file)
        defer { try? handle.close() }
        var hasher = Insecure.SHA1()
        while let chunk = try handle.read(upToCount: 1 << 20), !chunk.isEmpty {
            hasher.update(data: chunk)
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }
}
