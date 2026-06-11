import SpriteKit

// Tile-based level format, stored as JSON in Resources/Levels/.
// Grid coordinates: x = column, y = row above the ground line. One tile = 64pt.
enum TileType: String, Codable {
    case block          // solid, lands on top, dies on side/front hit
    case spike          // kills on contact (upward spike)
    case spikeDown      // ceiling spike
    case pad            // yellow pad: auto-launch on touch
    case orb            // yellow orb: tap while overlapping to boost
    case portalCube
    case portalShip
    case portalBall
    case portalUfo
    case portalWave
    case portalRobot
    case gravityFlip    // blue gravity portal: invert gravity
    case gravityNormal  // yellow gravity portal: restore gravity
    case checkpoint     // practice-mode respawn marker baked into level
    case finish         // end wall: level complete
}

struct Tile: Codable {
    let t: TileType
    let x: Int
    let y: Int
}

struct LevelTheme: Codable {
    let top: String      // hex background gradient top
    let bottom: String   // hex background gradient bottom
    let ground: String   // hex ground color
    let accent: String   // hex player / pulse accent
}

struct Level: Codable {
    let id: Int
    let name: String
    let difficulty: String
    let bpm: Double
    let speed: Double            // horizontal px/sec
    let startMode: String        // "cube", "ship", ...
    let theme: LevelTheme
    let beats: [Double]?         // explicit beat timestamps (sec); derived from bpm if nil
    let tiles: [Tile]

    var lengthInTiles: Int {
        (tiles.map { $0.x }.max() ?? 0) + 2
    }

    // Beat timestamps used for music + pulse FX. Levels are authored on a
    // beat grid so geometry stays synced to these times.
    var beatTimestamps: [Double] {
        if let beats = beats, !beats.isEmpty { return beats }
        let secondsPerBeat = 60.0 / bpm
        let duration = Double(lengthInTiles) * GameConstants.tileSize / speed
        return stride(from: 0.0, to: duration + 2, by: secondsPerBeat).map { $0 }
    }
}

enum GameConstants {
    static let tileSize: Double = 64
    static let groundY: Double = 128       // screen-space ground line
    static let playerSize: Double = 56
}

enum LevelLoader {
    static func loadAll() -> [Level] {
        var levels: [Level] = []
        for i in 1...10 {
            if let level = load(named: "level\(i)") { levels.append(level) }
        }
        return levels.sorted { $0.id < $1.id }
    }

    static func load(named name: String) -> Level? {
        guard let url = Bundle.main.url(forResource: name, withExtension: "json", subdirectory: "Levels")
            ?? Bundle.main.url(forResource: name, withExtension: "json") else { return nil }
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Level.self, from: data)
    }
}

extension SKColor {
    convenience init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        var rgb: UInt64 = 0
        Scanner(string: s).scanHexInt64(&rgb)
        self.init(red: CGFloat((rgb >> 16) & 0xFF) / 255,
                  green: CGFloat((rgb >> 8) & 0xFF) / 255,
                  blue: CGFloat(rgb & 0xFF) / 255,
                  alpha: 1)
    }
}
