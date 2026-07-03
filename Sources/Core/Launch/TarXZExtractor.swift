import Foundation
import Compression

/// Minimal in-process .tar.xz extractor — iOS has no `tar` binary to shell
/// out to. XZ decompression uses Apple's Compression framework (LZMA);
/// the tar side implements plain ustar/pax, which is all our artifact
/// pipeline emits. Symlinks are materialized (runtime bundles contain a few),
/// and the executable bit is preserved for dylibs.
enum TarXZExtractor {
    enum ExtractError: LocalizedError {
        case decompressInit
        case decompressFailed
        case badArchive(String)

        var errorDescription: String? {
            switch self {
            case .decompressInit, .decompressFailed: return "Failed to decompress runtime archive."
            case .badArchive(let why): return "Corrupt runtime archive: \(why)"
            }
        }
    }

    static func extract(archive: URL, into destination: URL) throws {
        let tarData = try decompressXZ(try Data(contentsOf: archive))
        try untar(tarData, into: destination)
    }

    // MARK: XZ (LZMA)

    private static func decompressXZ(_ input: Data) throws -> Data {
        // compression_stream has no zero-arg initializer; allocate raw and
        // let compression_stream_init fill it in.
        let stream = UnsafeMutablePointer<compression_stream>.allocate(capacity: 1)
        defer { stream.deallocate() }
        guard compression_stream_init(stream, COMPRESSION_STREAM_DECODE, COMPRESSION_LZMA) == COMPRESSION_STATUS_OK else {
            throw ExtractError.decompressInit
        }
        defer { compression_stream_destroy(stream) }

        let bufferSize = 1 << 20
        let outBuffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
        defer { outBuffer.deallocate() }

        var output = Data()
        try input.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
            stream.pointee.src_ptr = raw.bindMemory(to: UInt8.self).baseAddress!
            stream.pointee.src_size = input.count
            while true {
                stream.pointee.dst_ptr = outBuffer
                stream.pointee.dst_size = bufferSize
                let status = compression_stream_process(stream, Int32(COMPRESSION_STREAM_FINALIZE.rawValue))
                switch status {
                case COMPRESSION_STATUS_OK, COMPRESSION_STATUS_END:
                    output.append(outBuffer, count: bufferSize - stream.pointee.dst_size)
                    if status == COMPRESSION_STATUS_END { return }
                default:
                    throw ExtractError.decompressFailed
                }
            }
        }
        return output
    }

    // MARK: ustar

    private static func untar(_ data: Data, into destination: URL) throws {
        let fm = FileManager.default
        try fm.createDirectory(at: destination, withIntermediateDirectories: true)

        var offset = 0
        var pendingLongName: String?

        while offset + 512 <= data.count {
            let header = data.subdata(in: offset..<offset + 512)
            offset += 512
            if header.allSatisfy({ $0 == 0 }) { break }   // end-of-archive marker

            func field(_ range: Range<Int>) -> String {
                let raw = header.subdata(in: range)
                let end = raw.firstIndex(of: 0) ?? raw.count
                return String(data: raw.prefix(end), encoding: .utf8) ?? ""
            }

            var name = pendingLongName ?? field(0..<100)
            pendingLongName = nil
            let mode = Int(field(100..<108).trimmingCharacters(in: .whitespaces), radix: 8) ?? 0o644
            let size = Int(field(124..<136).trimmingCharacters(in: .whitespaces), radix: 8) ?? 0
            let typeFlag = Character(UnicodeScalar(header[156]))
            let linkName = field(157..<257)
            if !field(345..<500).isEmpty { name = field(345..<500) + "/" + name }  // ustar prefix

            let contentEnd = offset + size
            guard contentEnd <= data.count else { throw ExtractError.badArchive("truncated entry \(name)") }
            let content = data.subdata(in: offset..<contentEnd)
            offset = contentEnd + (512 - size % 512) % 512   // advance past padding

            guard !name.isEmpty, !name.contains("..") else { continue }  // path traversal guard
            let target = destination.appendingPathComponent(name)

            switch typeFlag {
            case "0", "\0":   // regular file
                try fm.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
                try content.write(to: target)
                if mode & 0o111 != 0 {
                    try? fm.setAttributes([.posixPermissions: mode], ofItemAtPath: target.path)
                }
            case "5":         // directory
                try fm.createDirectory(at: target, withIntermediateDirectories: true)
            case "2":         // symlink
                try? fm.removeItem(at: target)
                try fm.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
                try? fm.createSymbolicLink(atPath: target.path, withDestinationPath: linkName)
            case "L":         // GNU long name: content is the real name of the next entry
                pendingLongName = String(data: content, encoding: .utf8)?
                    .trimmingCharacters(in: CharacterSet(charactersIn: "\0"))
            case "x", "g":    // pax headers: ignored (names < 100 chars in our artifacts)
                break
            default:
                break
            }
        }
    }
}
