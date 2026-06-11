import SpriteKit

final class LevelSelectScene: SKScene {

    private var levels: [Level] = []

    override func didMove(to view: SKView) {
        backgroundColor = SKColor(hex: "#0a0f2e")
        levels = LevelLoader.loadAll()

        let title = SKLabelNode(text: "SELECT LEVEL")
        title.fontName = "AvenirNext-Heavy"
        title.fontSize = 44
        title.fontColor = .white
        title.position = CGPoint(x: size.width / 2, y: size.height - 80)
        addChild(title)

        let back = SKLabelNode(text: "← BACK")
        back.fontName = "AvenirNext-Bold"
        back.fontSize = 26
        back.name = "btn_back"
        back.position = CGPoint(x: 90, y: size.height - 76)
        addChild(back)

        // practice mode toggle
        let practice = SKLabelNode(text: practiceText())
        practice.fontName = "AvenirNext-Bold"
        practice.fontSize = 22
        practice.fontColor = GameProgress.practiceMode ? .green : .white
        practice.name = "btn_practice"
        practice.position = CGPoint(x: size.width - 170, y: size.height - 76)
        addChild(practice)

        layoutCards()
    }

    private func practiceText() -> String {
        "PRACTICE: \(GameProgress.practiceMode ? "ON" : "OFF")"
    }

    private func layoutCards() {
        let cardW: CGFloat = 220, cardH: CGFloat = 300
        let totalW = CGFloat(levels.count) * (cardW + 24) - 24
        var x = size.width / 2 - totalW / 2 + cardW / 2

        for level in levels {
            let card = SKShapeNode(rectOf: CGSize(width: cardW, height: cardH), cornerRadius: 16)
            card.fillColor = SKColor(hex: level.theme.ground).withAlphaComponent(0.6)
            card.strokeColor = SKColor(hex: level.theme.accent)
            card.lineWidth = 3
            card.position = CGPoint(x: x, y: size.height * 0.45)
            card.name = "level_\(level.id)"
            addChild(card)

            let name = SKLabelNode(text: level.name)
            name.fontName = "AvenirNext-Bold"
            name.fontSize = 21
            name.position = CGPoint(x: 0, y: cardH / 2 - 50)
            name.name = card.name
            card.addChild(name)

            let diff = SKLabelNode(text: level.difficulty.uppercased())
            diff.fontName = "AvenirNext-Heavy"
            diff.fontSize = 17
            diff.fontColor = difficultyColor(level.difficulty)
            diff.position = CGPoint(x: 0, y: cardH / 2 - 80)
            diff.name = card.name
            card.addChild(diff)

            let best = GameProgress.bestPercent(levelId: level.id)
            let bestLabel = SKLabelNode(text: best >= 100 ? "✓ COMPLETE" : "Best: \(best)%")
            bestLabel.fontName = "AvenirNext-Medium"
            bestLabel.fontSize = 17
            bestLabel.fontColor = best >= 100 ? .green : .white
            bestLabel.position = CGPoint(x: 0, y: -20)
            bestLabel.name = card.name
            card.addChild(bestLabel)

            let barBG = SKSpriteNode(color: .white.withAlphaComponent(0.2), size: CGSize(width: cardW - 50, height: 8))
            barBG.position = CGPoint(x: 0, y: -50)
            card.addChild(barBG)
            let bar = SKSpriteNode(color: SKColor(hex: level.theme.accent),
                                   size: CGSize(width: (cardW - 50) * CGFloat(best) / 100, height: 8))
            bar.anchorPoint = CGPoint(x: 0, y: 0.5)
            bar.position = CGPoint(x: -(cardW - 50) / 2, y: -50)
            card.addChild(bar)

            let attempts = SKLabelNode(text: "Attempts: \(GameProgress.attempts(levelId: level.id))")
            attempts.fontName = "AvenirNext-Medium"
            attempts.fontSize = 14
            attempts.alpha = 0.65
            attempts.position = CGPoint(x: 0, y: -85)
            attempts.name = card.name
            card.addChild(attempts)

            let play = SKLabelNode(text: "▶")
            play.fontSize = 36
            play.position = CGPoint(x: 0, y: -cardH / 2 + 28)
            play.name = card.name
            card.addChild(play)

            x += cardW + 24
        }
    }

    private func difficultyColor(_ d: String) -> SKColor {
        switch d.lowercased() {
        case "easy": return .green
        case "normal": return .cyan
        case "hard": return .yellow
        case "harder": return .orange
        case "insane": return .magenta
        default: return .red
        }
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let touch = touches.first else { return }
        let touched = nodes(at: touch.location(in: self))
        for node in touched {
            guard let name = node.name else { continue }
            if name == "btn_back" {
                view?.presentScene(MenuScene(size: size), transition: .push(with: .right, duration: 0.4))
                return
            }
            if name == "btn_practice" {
                GameProgress.practiceMode.toggle()
                view?.presentScene(LevelSelectScene(size: size))
                return
            }
            if name.hasPrefix("level_"), let id = Int(name.dropFirst(6)),
               let level = levels.first(where: { $0.id == id }) {
                let scene = GameScene(level: level, size: size)
                view?.presentScene(scene, transition: .doorsOpenHorizontal(withDuration: 0.5))
                return
            }
        }
    }
}
