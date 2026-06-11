import SpriteKit

final class GameScene: SKScene {

    private let level: Level
    private let player = PlayerController()
    private var solids: TileGrid!
    private var triggers: [Tile] = []           // pads, orbs, portals, finish...
    private var consumedTriggers = Set<Int>()   // indices used this attempt
    private var spikes: [Tile] = []

    private var playerNode: SKNode!
    private var cameraNode = SKCameraNode()
    private var background: ParallaxBackground!
    private var hud = SKNode()
    private var progressLabel: SKLabelNode!
    private var progressBar: SKSpriteNode!
    private var attemptLabel: SKLabelNode!
    private var modeLabel: SKLabelNode!

    private var lastUpdate: TimeInterval = 0
    private var elapsed: Double = 0
    private var nextBeatIndex = 0
    private var finished = false

    // practice mode checkpoints: (x, y, mode, gravityDir)
    private struct Checkpoint { let x: Double; let y: Double; let mode: GameMode; let gravity: Double }
    private var lastCheckpoint: Checkpoint?
    private var timeSinceCheckpoint: Double = 0
    private let practice = GameProgress.practiceMode

    private var levelLength: Double { Double(level.lengthInTiles) * GameConstants.tileSize }

    init(level: Level, size: CGSize) {
        self.level = level
        super.init(size: size)
        scaleMode = .aspectFill
    }

    required init?(coder aDecoder: NSCoder) { fatalError() }

    override func didMove(to view: SKView) {
        solids = TileGrid(tiles: level.tiles)
        spikes = level.tiles.filter { $0.t == .spike || $0.t == .spikeDown }
        triggers = level.tiles.filter { ![TileType.block, .spike, .spikeDown].contains($0.t) }

        background = ParallaxBackground(theme: level.theme, size: size)
        addChild(background)
        buildWorld()
        buildPlayer()
        buildHUD()

        camera = cameraNode
        addChild(cameraNode)
        cameraNode.addChild(hud)

        resetAttempt(fromCheckpoint: false)
        MusicEngine.shared.start(bpm: level.bpm, patternSeed: level.id)
    }

    override func willMove(from view: SKView) {
        MusicEngine.shared.stop()
    }

    // MARK: world construction

    private func buildWorld() {
        let ts = GameConstants.tileSize
        let groundColor = SKColor(hex: level.theme.ground)
        let accent = SKColor(hex: level.theme.accent)

        let ground = SKSpriteNode(color: groundColor,
                                  size: CGSize(width: levelLength + 4000, height: GameConstants.groundY))
        ground.anchorPoint = CGPoint(x: 0, y: 1)
        ground.position = CGPoint(x: -2000, y: GameConstants.groundY)
        ground.zPosition = 5
        addChild(ground)

        let groundLine = SKSpriteNode(color: accent,
                                      size: CGSize(width: levelLength + 4000, height: 3))
        groundLine.anchorPoint = CGPoint(x: 0, y: 0)
        groundLine.position = CGPoint(x: -2000, y: GameConstants.groundY)
        groundLine.zPosition = 6
        addChild(groundLine)

        for tile in level.tiles {
            let node = makeNode(for: tile, accent: accent, groundColor: groundColor)
            node.position = CGPoint(x: (Double(tile.x) + 0.5) * ts,
                                    y: GameConstants.groundY + (Double(tile.y) + 0.5) * ts)
            node.zPosition = 10
            addChild(node)
        }
    }

    private func makeNode(for tile: Tile, accent: SKColor, groundColor: SKColor) -> SKNode {
        let ts = GameConstants.tileSize
        switch tile.t {
        case .block:
            let n = SKSpriteNode(color: groundColor, size: CGSize(width: ts, height: ts))
            let border = SKShapeNode(rectOf: CGSize(width: ts - 4, height: ts - 4))
            border.strokeColor = accent
            border.lineWidth = 2
            n.addChild(border)
            return n
        case .spike, .spikeDown:
            let path = CGMutablePath()
            path.move(to: CGPoint(x: -ts / 2 + 6, y: -ts / 2))
            path.addLine(to: CGPoint(x: 0, y: ts / 2 - 4))
            path.addLine(to: CGPoint(x: ts / 2 - 6, y: -ts / 2))
            path.closeSubpath()
            let n = SKShapeNode(path: path)
            n.fillColor = .white
            n.strokeColor = accent
            n.lineWidth = 2
            if tile.t == .spikeDown { n.zRotation = .pi }
            return n
        case .pad:
            let n = SKSpriteNode(color: .yellow, size: CGSize(width: ts * 0.9, height: 12))
            n.position.y -= ts / 2 - 6
            let wrapper = SKNode()
            wrapper.addChild(n)
            return wrapper
        case .orb:
            let n = SKShapeNode(circleOfRadius: 20)
            n.fillColor = .yellow.withAlphaComponent(0.85)
            n.strokeColor = .white
            n.lineWidth = 3
            n.run(.repeatForever(.sequence([.scale(to: 1.2, duration: 0.4), .scale(to: 1.0, duration: 0.4)])))
            return n
        case .portalCube, .portalShip, .portalBall, .portalUfo, .portalWave, .portalRobot:
            let colors: [TileType: SKColor] = [.portalCube: .green, .portalShip: .magenta, .portalBall: .red,
                                               .portalUfo: .orange, .portalWave: .cyan, .portalRobot: .white]
            let n = SKShapeNode(ellipseOf: CGSize(width: 44, height: ts * 2.6))
            n.fillColor = (colors[tile.t] ?? .green).withAlphaComponent(0.45)
            n.strokeColor = colors[tile.t] ?? .green
            n.lineWidth = 3
            let label = SKLabelNode(text: String(tile.t.rawValue.dropFirst(6)).uppercased())
            label.fontName = "AvenirNext-Bold"
            label.fontSize = 13
            label.zRotation = .pi / 2
            n.addChild(label)
            return n
        case .gravityFlip, .gravityNormal:
            let n = SKShapeNode(ellipseOf: CGSize(width: 44, height: ts * 2.6))
            let c: SKColor = tile.t == .gravityFlip ? .blue : .yellow
            n.fillColor = c.withAlphaComponent(0.45)
            n.strokeColor = c
            n.lineWidth = 3
            return n
        case .checkpoint:
            let n = SKShapeNode(rectOf: CGSize(width: 14, height: 40), cornerRadius: 6)
            n.fillColor = practice ? .green : .clear
            n.strokeColor = practice ? .white : .clear
            return n
        case .finish:
            let n = SKSpriteNode(color: .white.withAlphaComponent(0.5), size: CGSize(width: 20, height: 12 * ts))
            n.position.y += 5 * ts
            let wrapper = SKNode()
            wrapper.addChild(n)
            return wrapper
        }
    }

    private func buildPlayer() {
        playerNode = SKNode()
        playerNode.zPosition = 20
        addChild(playerNode)
        setPlayerVisual(mode: GameMode(rawValue: level.startMode) ?? .cube)
    }

    private func setPlayerVisual(mode: GameMode) {
        playerNode.removeAllChildren()
        let accent = SKColor(hex: level.theme.accent)
        let s = GameConstants.playerSize
        let shape: SKShapeNode
        switch mode {
        case .cube, .robot:
            shape = SKShapeNode(rectOf: CGSize(width: s, height: s), cornerRadius: 8)
            let eye = SKShapeNode(rectOf: CGSize(width: s * 0.5, height: s * 0.18), cornerRadius: 4)
            eye.fillColor = .white; eye.strokeColor = .clear
            eye.position = CGPoint(x: 4, y: s * 0.15)
            shape.addChild(eye)
            if mode == .robot {
                let leg = SKShapeNode(rectOf: CGSize(width: s * 0.7, height: 8))
                leg.fillColor = .white; leg.strokeColor = .clear
                leg.position = CGPoint(x: 0, y: -s / 2 + 2)
                shape.addChild(leg)
            }
        case .ship:
            let path = CGMutablePath()
            path.move(to: CGPoint(x: -s / 2, y: -s * 0.3))
            path.addLine(to: CGPoint(x: -s / 2, y: s * 0.25))
            path.addLine(to: CGPoint(x: s * 0.1, y: s * 0.25))
            path.addLine(to: CGPoint(x: s / 2, y: 0))
            path.addLine(to: CGPoint(x: s * 0.1, y: -s * 0.3))
            path.closeSubpath()
            shape = SKShapeNode(path: path)
        case .ball:
            shape = SKShapeNode(circleOfRadius: s / 2)
            let stripe = SKShapeNode(rectOf: CGSize(width: s * 0.9, height: 6))
            stripe.fillColor = .white; stripe.strokeColor = .clear
            shape.addChild(stripe)
        case .ufo:
            shape = SKShapeNode(ellipseOf: CGSize(width: s, height: s * 0.5))
            let dome = SKShapeNode(circleOfRadius: s * 0.28)
            dome.fillColor = .white.withAlphaComponent(0.7); dome.strokeColor = .clear
            dome.position = CGPoint(x: 0, y: s * 0.18)
            shape.addChild(dome)
        case .wave:
            let path = CGMutablePath()
            path.move(to: CGPoint(x: -s / 2, y: s * 0.3))
            path.addLine(to: CGPoint(x: s / 2, y: 0))
            path.addLine(to: CGPoint(x: -s / 2, y: -s * 0.3))
            path.closeSubpath()
            shape = SKShapeNode(path: path)
        }
        shape.fillColor = accent
        shape.strokeColor = .white
        shape.lineWidth = 3
        shape.name = "body"
        playerNode.addChild(shape)
    }

    private func buildHUD() {
        hud.zPosition = 100

        let barBG = SKSpriteNode(color: .white.withAlphaComponent(0.25), size: CGSize(width: 400, height: 10))
        barBG.position = CGPoint(x: 0, y: size.height / 2 - 30)
        hud.addChild(barBG)
        progressBar = SKSpriteNode(color: SKColor(hex: level.theme.accent), size: CGSize(width: 0, height: 10))
        progressBar.anchorPoint = CGPoint(x: 0, y: 0.5)
        progressBar.position = CGPoint(x: -200, y: size.height / 2 - 30)
        hud.addChild(progressBar)

        progressLabel = SKLabelNode(text: "0%")
        progressLabel.fontName = "AvenirNext-Bold"
        progressLabel.fontSize = 22
        progressLabel.position = CGPoint(x: 230, y: size.height / 2 - 38)
        hud.addChild(progressLabel)

        attemptLabel = SKLabelNode(text: "")
        attemptLabel.fontName = "AvenirNext-Bold"
        attemptLabel.fontSize = 20
        attemptLabel.alpha = 0.8
        attemptLabel.position = CGPoint(x: -size.width / 2 + 30, y: size.height / 2 - 40)
        attemptLabel.horizontalAlignmentMode = .left
        hud.addChild(attemptLabel)

        modeLabel = SKLabelNode(text: practice ? "PRACTICE" : "")
        modeLabel.fontName = "AvenirNext-Bold"
        modeLabel.fontSize = 16
        modeLabel.fontColor = .green
        modeLabel.position = CGPoint(x: -size.width / 2 + 30, y: size.height / 2 - 65)
        modeLabel.horizontalAlignmentMode = .left
        hud.addChild(modeLabel)

        let pause = SKLabelNode(text: "⏸")
        pause.name = "btn_pause"
        pause.fontSize = 34
        pause.position = CGPoint(x: size.width / 2 - 44, y: size.height / 2 - 48)
        hud.addChild(pause)
    }

    // MARK: attempt lifecycle

    private func resetAttempt(fromCheckpoint: Bool) {
        player.dead = false
        player.vy = 0
        consumedTriggers.removeAll()
        finished = false
        timeSinceCheckpoint = 0

        if fromCheckpoint, practice, let cp = lastCheckpoint {
            player.x = cp.x
            player.y = cp.y
            player.mode = cp.mode
            player.gravityDir = cp.gravity
        } else {
            player.x = -GameConstants.tileSize * 6
            player.y = GameConstants.playerSize / 2
            player.mode = GameMode(rawValue: level.startMode) ?? .cube
            player.gravityDir = 1
            lastCheckpoint = nil
        }
        setPlayerVisual(mode: player.mode)
        attemptLabel.text = "Attempt \(GameProgress.attempts(levelId: level.id) + 1)"
        elapsed = 0
        nextBeatIndex = 0
        playerNode.alpha = 1
    }

    private func die() {
        guard !player.dead || playerNode.alpha == 1 else { return }
        player.dead = true
        let percent = currentPercent()
        GameProgress.recordRun(levelId: level.id, percent: percent)

        // explosion burst
        let accent = SKColor(hex: level.theme.accent)
        for _ in 0..<14 {
            let p = SKShapeNode(rectOf: CGSize(width: 10, height: 10))
            p.fillColor = accent; p.strokeColor = .clear
            p.position = playerNode.position
            p.zPosition = 30
            addChild(p)
            let dx = CGFloat.random(in: -160...160), dy = CGFloat.random(in: -40...220)
            p.run(.sequence([.group([.moveBy(x: dx, y: dy, duration: 0.5), .fadeOut(withDuration: 0.5)]), .removeFromParent()]))
        }
        playerNode.alpha = 0
        run(.sequence([.wait(forDuration: 0.7), .run { [weak self] in
            self?.resetAttempt(fromCheckpoint: true)
        }]))
    }

    private func win() {
        guard !finished else { return }
        finished = true
        GameProgress.recordRun(levelId: level.id, percent: 100)
        let banner = SKLabelNode(text: "LEVEL COMPLETE!")
        banner.fontName = "AvenirNext-Heavy"
        banner.fontSize = 52
        banner.fontColor = SKColor(hex: level.theme.accent)
        banner.setScale(0.1)
        hud.addChild(banner)
        banner.run(.scale(to: 1, duration: 0.4))
        run(.sequence([.wait(forDuration: 2.2), .run { [weak self] in
            guard let self = self, let view = self.view else { return }
            let menu = LevelSelectScene(size: self.size)
            view.presentScene(menu, transition: .fade(withDuration: 0.5))
        }]))
    }

    private func currentPercent() -> Int {
        max(0, min(100, Int(player.x / levelLength * 100)))
    }

    // MARK: game loop

    override func update(_ currentTime: TimeInterval) {
        var dt = lastUpdate == 0 ? 1.0 / 60 : currentTime - lastUpdate
        lastUpdate = currentTime
        dt = min(dt, 1.0 / 30)
        guard !finished else { return }
        guard !player.dead else { updateCamera(); return }

        elapsed += dt
        timeSinceCheckpoint += dt

        player.step(dt: dt, speed: level.speed, solids: solids)
        if player.dead { die(); return }

        checkSpikes()
        if player.dead { die(); return }
        checkTriggers()

        // cube/ball spin while airborne
        if let body = playerNode.childNode(withName: "body") {
            if (player.mode == .cube || player.mode == .ball) && !player.grounded {
                body.zRotation -= CGFloat(dt) * 6 * CGFloat(player.gravityDir)
            } else if player.mode == .ship || player.mode == .wave || player.mode == .ufo {
                body.zRotation = CGFloat(max(-0.5, min(0.5, player.vy / 1400)))
            } else {
                let snapped = round(body.zRotation / (.pi / 2)) * .pi / 2
                body.zRotation = snapped
            }
            body.yScale = player.gravityDir > 0 ? abs(body.yScale) : -abs(body.yScale)
        }

        playerNode.position = CGPoint(x: player.x, y: GameConstants.groundY + player.y)
        updateCamera()
        updateHUD()
        updateBeatFX()
        updatePracticeCheckpoints()

        if player.x >= levelLength { win() }
    }

    private func updateCamera() {
        let camX = max(size.width / 2 - 200, CGFloat(player.x) + size.width / 4)
        var camY = size.height / 2
        let py = CGFloat(GameConstants.groundY + player.y)
        if py > size.height * 0.6 { camY = py - size.height * 0.1 }
        cameraNode.position = CGPoint(x: camX, y: camY)
        background.position.x = camX - size.width / 2
        background.update(cameraX: camX)
        background.position.y = camY - size.height / 2
    }

    private func updateHUD() {
        let pct = currentPercent()
        progressLabel.text = "\(pct)%"
        progressBar.size.width = CGFloat(pct) * 4
    }

    private func updateBeatFX() {
        let beats = level.beatTimestamps
        let t = MusicEngine.shared.muted ? elapsed : MusicEngine.shared.currentTime
        while nextBeatIndex < beats.count && beats[nextBeatIndex] <= t {
            nextBeatIndex += 1
            // pulse the player and ground line on every beat
            if let body = playerNode.childNode(withName: "body") {
                body.run(.sequence([.scale(to: 1.15, duration: 0.05), .scale(to: 1.0, duration: 0.12)]))
            }
            let flash = SKSpriteNode(color: SKColor(hex: level.theme.accent).withAlphaComponent(0.08),
                                     size: size)
            flash.zPosition = 90
            cameraNode.addChild(flash)
            flash.run(.sequence([.fadeOut(withDuration: 0.18), .removeFromParent()]))
        }
    }

    private func updatePracticeCheckpoints() {
        guard practice else { return }
        // drop an auto-checkpoint every 3s of grounded survival
        if timeSinceCheckpoint > 3, player.grounded || player.mode == .ship || player.mode == .wave {
            placeCheckpoint()
        }
    }

    private func placeCheckpoint() {
        lastCheckpoint = Checkpoint(x: player.x, y: player.y, mode: player.mode, gravity: player.gravityDir)
        timeSinceCheckpoint = 0
        let marker = SKShapeNode(rectOf: CGSize(width: 12, height: 36), cornerRadius: 5)
        marker.fillColor = .green
        marker.strokeColor = .white
        marker.position = playerNode.position
        marker.zPosition = 8
        addChild(marker)
    }

    // MARK: hazards & triggers

    private func checkSpikes() {
        let ts = GameConstants.tileSize
        // forgiving hitbox, like GD — tuned so an N-spike row is clearable
        // at each level's speed (see Tools/level_editor.py beat grid)
        let hb = GameConstants.playerSize * 0.35
        for s in spikes {
            let sx = (Double(s.x) + 0.5) * ts
            let sy = (Double(s.y) + 0.5) * ts
            if abs(player.x - sx) < hb + ts * 0.125 && abs(player.y - sy) < hb + ts * 0.2 {
                player.dead = true
                return
            }
        }
    }

    private func checkTriggers() {
        let ts = GameConstants.tileSize
        for (i, tr) in triggers.enumerated() {
            guard !consumedTriggers.contains(i) else { continue }
            let tx = (Double(tr.x) + 0.5) * ts
            let ty = (Double(tr.y) + 0.5) * ts
            let rangeX: Double = tr.t == .finish ? 20 : ts * 0.8
            let rangeY: Double = [TileType.portalCube, .portalShip, .portalBall, .portalUfo,
                                  .portalWave, .portalRobot, .gravityFlip, .gravityNormal].contains(tr.t)
                ? ts * 1.4 : ts * 0.8
            guard abs(player.x - tx) < rangeX && abs(player.y - ty) < rangeY else { continue }

            switch tr.t {
            case .pad:
                consumedTriggers.insert(i)
                player.boostFromPad()
            case .orb:
                if player.consumeTap() {
                    consumedTriggers.insert(i)
                    player.boostFromOrb()
                }
            case .portalCube: switchMode(.cube, at: i)
            case .portalShip: switchMode(.ship, at: i)
            case .portalBall: switchMode(.ball, at: i)
            case .portalUfo: switchMode(.ufo, at: i)
            case .portalWave: switchMode(.wave, at: i)
            case .portalRobot: switchMode(.robot, at: i)
            case .gravityFlip:
                consumedTriggers.insert(i)
                if player.gravityDir > 0 { player.gravityDir = -1; player.grounded = false }
            case .gravityNormal:
                consumedTriggers.insert(i)
                if player.gravityDir < 0 { player.gravityDir = 1; player.grounded = false }
            case .checkpoint:
                if practice {
                    consumedTriggers.insert(i)
                    placeCheckpoint()
                }
            case .finish:
                win()
                return
            default:
                break
            }
        }
    }

    private func switchMode(_ mode: GameMode, at index: Int) {
        guard player.mode != mode else { return }
        consumedTriggers.insert(index)
        player.mode = mode
        player.vy = min(max(player.vy, -500), 500)
        setPlayerVisual(mode: mode)
        if let body = playerNode.childNode(withName: "body") {
            body.run(.sequence([.scale(to: 1.3, duration: 0.08), .scale(to: 1.0, duration: 0.12)]))
        }
    }

    // MARK: input

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let touch = touches.first else { return }
        let loc = touch.location(in: cameraNode)
        if let node = hud.nodes(at: loc).first(where: { $0.name == "btn_pause" }), node.name == "btn_pause" {
            view?.presentScene(LevelSelectScene(size: size), transition: .fade(withDuration: 0.4))
            return
        }
        player.touchDown()
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        player.touchUp()
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        player.touchUp()
    }
}
