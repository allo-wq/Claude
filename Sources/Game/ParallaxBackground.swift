import SpriteKit

// Three-layer parallax background tinted from the level theme: a vertical
// gradient sky, drifting glow shapes (far), and a silhouette skyline (near).
final class ParallaxBackground: SKNode {

    private var farLayer = SKNode()
    private var nearLayer = SKNode()
    private let theme: LevelTheme
    private let viewSize: CGSize

    init(theme: LevelTheme, size: CGSize) {
        self.theme = theme
        self.viewSize = size
        super.init()
        zPosition = -100
        buildGradient()
        buildFarLayer()
        buildNearLayer()
        addChild(farLayer)
        addChild(nearLayer)
    }

    required init?(coder aDecoder: NSCoder) { fatalError() }

    func update(cameraX: CGFloat) {
        farLayer.position.x = -cameraX * 0.1
        nearLayer.position.x = -cameraX * 0.3
        // recycle tiles so layers cover the camera forever
        recycle(layer: farLayer, parallax: 0.1, cameraX: cameraX, tileWidth: viewSize.width)
        recycle(layer: nearLayer, parallax: 0.3, cameraX: cameraX, tileWidth: viewSize.width)
    }

    private func recycle(layer: SKNode, parallax: CGFloat, cameraX: CGFloat, tileWidth: CGFloat) {
        let effectiveX = cameraX * parallax
        for child in layer.children {
            while child.position.x + tileWidth < effectiveX - tileWidth {
                child.position.x += tileWidth * CGFloat(layer.children.count)
            }
        }
    }

    private func buildGradient() {
        let top = SKColor(hex: theme.top)
        let bottom = SKColor(hex: theme.bottom)
        let steps = 12
        for i in 0..<steps {
            let f = CGFloat(i) / CGFloat(steps - 1)
            let band = SKSpriteNode(color: blend(bottom, top, f),
                                    size: CGSize(width: viewSize.width * 40, height: viewSize.height / CGFloat(steps) + 2))
            band.anchorPoint = CGPoint(x: 0, y: 0)
            band.position = CGPoint(x: -viewSize.width, y: viewSize.height * f * (1 - 1 / CGFloat(steps)))
            band.zPosition = -3
            addChild(band)
        }
    }

    private func buildFarLayer() {
        let accent = SKColor(hex: theme.accent)
        for i in 0..<8 {
            let r = CGFloat.random(in: 60...160)
            let glow = SKShapeNode(circleOfRadius: r)
            glow.fillColor = accent.withAlphaComponent(0.06)
            glow.strokeColor = .clear
            glow.position = CGPoint(x: CGFloat(i) * viewSize.width / 4 + .random(in: -80...80),
                                    y: .random(in: viewSize.height * 0.3...viewSize.height * 0.9))
            farLayer.addChild(glow)
        }
        farLayer.zPosition = -2
    }

    private func buildNearLayer() {
        let ground = SKColor(hex: theme.ground)
        var x: CGFloat = -viewSize.width
        while x < viewSize.width * 3 {
            let w = CGFloat.random(in: 60...140)
            let h = CGFloat.random(in: 60...260)
            let building = SKSpriteNode(color: ground.withAlphaComponent(0.35), size: CGSize(width: w, height: h))
            building.anchorPoint = CGPoint(x: 0, y: 0)
            building.position = CGPoint(x: x, y: CGFloat(GameConstants.groundY) - 20)
            nearLayer.addChild(building)
            x += w + .random(in: 10...60)
        }
        nearLayer.zPosition = -1
    }

    private func blend(_ a: SKColor, _ b: SKColor, _ f: CGFloat) -> SKColor {
        var ar: CGFloat = 0, ag: CGFloat = 0, ab: CGFloat = 0, aa: CGFloat = 0
        var br: CGFloat = 0, bg: CGFloat = 0, bb: CGFloat = 0, ba: CGFloat = 0
        a.getRed(&ar, green: &ag, blue: &ab, alpha: &aa)
        b.getRed(&br, green: &bg, blue: &bb, alpha: &ba)
        return SKColor(red: ar + (br - ar) * f, green: ag + (bg - ag) * f, blue: ab + (bb - ab) * f, alpha: 1)
    }
}
