import UIKit
import SpriteKit

class GameViewController: UIViewController {

    override func loadView() {
        view = SKView()
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        guard let skView = view as? SKView else { return }
        skView.ignoresSiblingOrder = true
        skView.preferredFramesPerSecond = 60
        #if DEBUG
        skView.showsFPS = true
        skView.showsNodeCount = true
        #endif

        let scene = MenuScene(size: CGSize(width: 1334, height: 750))
        scene.scaleMode = .aspectFill
        skView.presentScene(scene)
    }

    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var prefersStatusBarHidden: Bool { true }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }
}
