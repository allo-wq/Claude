import SpriteKit

enum GameMode: String {
    case cube, ship, ball, ufo, wave, robot
}

// Custom AABB physics for the player. SpriteKit's dynamics are too floaty
// for GD-style precision, so all motion + collision is resolved by hand
// against the tile grid each frame.
final class PlayerController {

    var mode: GameMode = .cube
    var x: Double = 0                 // world-space position (center)
    var y: Double = 0
    var vy: Double = 0
    var gravityDir: Double = 1        // 1 = normal (down), -1 = flipped (up)
    var isHolding = false
    var grounded = false
    var dead = false

    private var robotJumpTime: Double = 0
    private var tapBufferTime: Double = 0   // taps stay usable for a short window

    let size = GameConstants.playerSize

    // MARK: input

    func touchDown() {
        isHolding = true
        tapBufferTime = 0.15
    }

    func touchUp() {
        isHolding = false
        robotJumpTime = 0
    }

    func consumeTap() -> Bool {
        let t = tapBufferTime > 0
        tapBufferTime = 0
        return t
    }

    // MARK: per-frame physics

    func step(dt: Double, speed: Double, solids: TileGrid) {
        guard !dead else { return }
        x += speed * dt
        tapBufferTime = max(0, tapBufferTime - dt)

        let g = 3800.0 * gravityDir
        switch mode {
        case .cube:
            vy -= g * dt
            if grounded && isHolding {
                vy = 1150 * gravityDir
                grounded = false
            }
        case .robot:
            vy -= g * dt
            if grounded && consumeTap() {
                vy = 800 * gravityDir
                grounded = false
                robotJumpTime = 0.001
            } else if robotJumpTime > 0 && isHolding && robotJumpTime < 0.28 {
                // sustained thrust while held — variable jump height
                vy += 2600 * gravityDir * dt
                robotJumpTime += dt
            } else {
                robotJumpTime = 0
            }
        case .ship:
            vy += (isHolding ? 2900.0 : -2900.0) * gravityDir * dt
            vy = max(-950, min(950, vy))
        case .ufo:
            vy -= 2900.0 * gravityDir * dt
            if consumeTap() {
                vy = 880 * gravityDir
            }
            vy = max(-1300, min(1300, vy))
        case .wave:
            // constant diagonal motion, no gravity
            vy = (isHolding ? speed : -speed) * gravityDir
        case .ball:
            vy -= g * dt
            if grounded && consumeTap() {
                // ball flips gravity instead of jumping
                gravityDir *= -1
                grounded = false
                vy = 300 * gravityDir
            }
        }
        vy = max(-1700, min(1700, vy))
        y += vy * dt

        resolveCollisions(solids: solids)
    }

    func boostFromPad() {
        vy = 1450 * gravityDir
        grounded = false
    }

    func boostFromOrb() {
        vy = 1150 * gravityDir
        grounded = false
        tapBufferTime = 0
    }

    // MARK: collision

    private func resolveCollisions(solids: TileGrid) {
        grounded = false
        let half = size / 2
        let ts = GameConstants.tileSize

        // ground / ceiling of the playfield
        if gravityDir > 0 {
            if y - half <= 0 {
                y = half
                if vy <= 0 { vy = 0; grounded = true }
            }
        } else {
            if y - half <= 0 { dead = true } // falling off bottom while flipped
        }
        let ceiling = 11.0 * ts
        if mode == .ship || mode == .wave || mode == .ufo {
            if y + half >= ceiling { y = ceiling - half; vy = min(vy, 0) }
        }
        if gravityDir < 0 && y + half >= ceiling {
            y = ceiling - half
            if vy >= 0 { vy = 0; grounded = true }
        }

        // solid blocks: land on the gravity-side face, die on frontal hit
        let minCol = Int((x - half) / ts) - 1
        let maxCol = Int((x + half) / ts) + 1
        for col in minCol...maxCol {
            for tile in solids.solidsIn(column: col) {
                let bx = (Double(tile.x) + 0.5) * ts
                let by = (Double(tile.y) + 0.5) * ts
                let dx = x - bx
                let dy = y - by
                let overlapX = half + ts / 2 - abs(dx)
                let overlapY = half + ts / 2 - abs(dy)
                guard overlapX > 0 && overlapY > 0 else { continue }

                if overlapY < overlapX || (overlapY < 18 && dy * gravityDir > 0) {
                    // vertical resolution
                    if dy * gravityDir > 0 {
                        // landing on the surface facing the player
                        y = by + (ts / 2 + half) * (dy > 0 ? 1 : -1)
                        if vy * gravityDir <= 0 { vy = 0; grounded = true }
                    } else {
                        // bonked the underside
                        y = by - (ts / 2 + half) * (dy > 0 ? -1 : 1)
                        vy = 0
                    }
                } else {
                    // frontal collision = death (wave dies on any solid touch)
                    dead = true
                    return
                }
            }
        }
    }
}

// Spatial index over solid tiles, bucketed by column for cheap AABB queries.
final class TileGrid {
    private var byColumn: [Int: [Tile]] = [:]

    init(tiles: [Tile]) {
        for t in tiles where t.t == .block {
            byColumn[t.x, default: []].append(t)
        }
    }

    func solidsIn(column: Int) -> [Tile] {
        byColumn[column] ?? []
    }
}
