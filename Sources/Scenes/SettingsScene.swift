import SpriteKit

final class SettingsScene: SKScene {

    override func didMove(to view: SKView) {
        backgroundColor = SKColor(hex: "#0a0f2e")

        let title = SKLabelNode(text: "SETTINGS")
        title.fontName = "AvenirNext-Heavy"
        title.fontSize = 48
        title.position = CGPoint(x: size.width / 2, y: size.height - 100)
        addChild(title)

        addRow(text: "MUSIC: \(MusicEngine.shared.muted ? "OFF" : "ON")",
               name: "btn_music", y: size.height * 0.6,
               color: MusicEngine.shared.muted ? .red : .green)
        addRow(text: "PRACTICE MODE: \(GameProgress.practiceMode ? "ON" : "OFF")",
               name: "btn_practice", y: size.height * 0.46,
               color: GameProgress.practiceMode ? .green : .white)
        addRow(text: "RESET PROGRESS", name: "btn_reset", y: size.height * 0.32, color: .red)
        addRow(text: "← BACK", name: "btn_back", y: size.height * 0.16, color: .white)

        let credit = SKLabelNode(text: "Geometry Rush v1.0 — a rhythm platformer")
        credit.fontName = "AvenirNext-Medium"
        credit.fontSize = 15
        credit.alpha = 0.5
        credit.position = CGPoint(x: size.width / 2, y: 30)
        addChild(credit)
    }

    private func addRow(text: String, name: String, y: CGFloat, color: SKColor) {
        let label = SKLabelNode(text: text)
        label.fontName = "AvenirNext-Bold"
        label.fontSize = 30
        label.fontColor = color
        label.position = CGPoint(x: size.width / 2, y: y)
        label.name = name
        addChild(label)
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let touch = touches.first else { return }
        let node = atPoint(touch.location(in: self))
        switch node.name {
        case "btn_music":
            MusicEngine.shared.muted.toggle()
            view?.presentScene(SettingsScene(size: size))
        case "btn_practice":
            GameProgress.practiceMode.toggle()
            view?.presentScene(SettingsScene(size: size))
        case "btn_reset":
            let defaults = UserDefaults.standard
            for level in LevelLoader.loadAll() {
                defaults.removeObject(forKey: "best_\(level.id)")
                defaults.removeObject(forKey: "attempts_\(level.id)")
            }
            view?.presentScene(SettingsScene(size: size))
        case "btn_back":
            view?.presentScene(MenuScene(size: size), transition: .push(with: .down, duration: 0.4))
        default:
            break
        }
    }
}
