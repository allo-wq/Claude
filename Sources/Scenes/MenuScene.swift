import SpriteKit

final class MenuScene: SKScene {

    override func didMove(to view: SKView) {
        backgroundColor = SKColor(hex: "#0a0f2e")

        let theme = LevelTheme(top: "#1a2b6d", bottom: "#0a0f2e", ground: "#2233aa", accent: "#00e5ff")
        let bg = ParallaxBackground(theme: theme, size: size)
        addChild(bg)

        let title = SKLabelNode(text: "GEOMETRY RUSH")
        title.fontName = "AvenirNext-Heavy"
        title.fontSize = 72
        title.fontColor = SKColor(hex: "#00e5ff")
        title.position = CGPoint(x: size.width / 2, y: size.height * 0.68)
        addChild(title)
        title.run(.repeatForever(.sequence([.scale(to: 1.04, duration: 0.5), .scale(to: 1.0, duration: 0.5)])))

        let subtitle = SKLabelNode(text: "tap to jump · hold to fly · don't die")
        subtitle.fontName = "AvenirNext-Medium"
        subtitle.fontSize = 22
        subtitle.alpha = 0.7
        subtitle.position = CGPoint(x: size.width / 2, y: size.height * 0.58)
        addChild(subtitle)

        addButton(text: "PLAY", name: "btn_play", y: size.height * 0.42)
        addButton(text: "SETTINGS", name: "btn_settings", y: size.height * 0.27)

        // decorative bouncing cube
        let cube = SKShapeNode(rectOf: CGSize(width: 50, height: 50), cornerRadius: 8)
        cube.fillColor = SKColor(hex: "#00e5ff")
        cube.strokeColor = .white
        cube.lineWidth = 3
        cube.position = CGPoint(x: size.width * 0.15, y: size.height * 0.2)
        addChild(cube)
        cube.run(.repeatForever(.sequence([
            .group([.moveBy(x: 0, y: 90, duration: 0.35), .rotate(byAngle: -.pi / 2, duration: 0.35)]),
            .moveBy(x: 0, y: -90, duration: 0.3),
        ])))
    }

    private func addButton(text: String, name: String, y: CGFloat) {
        let button = SKShapeNode(rectOf: CGSize(width: 320, height: 70), cornerRadius: 14)
        button.fillColor = SKColor(hex: "#2233aa").withAlphaComponent(0.8)
        button.strokeColor = SKColor(hex: "#00e5ff")
        button.lineWidth = 3
        button.position = CGPoint(x: size.width / 2, y: y)
        button.name = name
        let label = SKLabelNode(text: text)
        label.fontName = "AvenirNext-Bold"
        label.fontSize = 30
        label.verticalAlignmentMode = .center
        label.name = name
        button.addChild(label)
        addChild(button)
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let touch = touches.first else { return }
        let node = atPoint(touch.location(in: self))
        switch node.name {
        case "btn_play":
            view?.presentScene(LevelSelectScene(size: size), transition: .push(with: .left, duration: 0.4))
        case "btn_settings":
            view?.presentScene(SettingsScene(size: size), transition: .push(with: .up, duration: 0.4))
        default:
            break
        }
    }
}
