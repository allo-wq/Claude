import SwiftUI
import UIKit

/// Hosts the layer Minecraft renders onto and translates touches into
/// input_bridge events. Two interpretation modes, switched by the game's own
/// cursor-grab state (mojo_input_get_grabbed):
///
///  * grabbed (gameplay): one-finger drag = camera look (relative cursor
///    deltas), tap = attack (left click), long-press = use (right click),
///    two-finger vertical drag = scroll.
///  * ungrabbed (menus/inventory): finger position maps 1:1 to the virtual
///    cursor; tap = left click at that position.
struct GameSurfaceView: UIViewRepresentable {
    func makeUIView(context: Context) -> GameSurfaceUIView {
        GameSurfaceUIView()
    }

    func updateUIView(_ uiView: GameSurfaceUIView, context: Context) {}
}

final class GameSurfaceUIView: UIView {
    // ANGLE renders via Metal; GL4ES's EGL implementation also accepts a
    // CAMetalLayer-backed view on modern iOS.
    override class var layerClass: AnyClass { CAMetalLayer.self }

    private var virtualCursor = CGPoint.zero
    private var lastPanPoint: CGPoint?
    private var keyboardProxy: KeyboardProxyTextField?

    override init(frame: CGRect) {
        super.init(frame: frame)
        isMultipleTouchEnabled = true
        backgroundColor = .black

        let pan = UIPanGestureRecognizer(target: self, action: #selector(onPan(_:)))
        pan.maximumNumberOfTouches = 1
        addGestureRecognizer(pan)

        let tap = UITapGestureRecognizer(target: self, action: #selector(onTap(_:)))
        addGestureRecognizer(tap)

        let longPress = UILongPressGestureRecognizer(target: self, action: #selector(onLongPress(_:)))
        longPress.minimumPressDuration = 0.4
        addGestureRecognizer(longPress)

        let twoFingerPan = UIPanGestureRecognizer(target: self, action: #selector(onScroll(_:)))
        twoFingerPan.minimumNumberOfTouches = 2
        addGestureRecognizer(twoFingerPan)

        NotificationCenter.default.addObserver(self, selector: #selector(toggleKeyboard),
                                               name: .mojoToggleKeyboard, object: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil else { return }
        let scale = window?.screen.scale ?? 2
        layer.contentsScale = scale
        mojo_surface_set_layer(layer, Float(scale))
        publishSize()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        publishSize()
    }

    private func publishSize() {
        let scale = layer.contentsScale
        let width = bounds.width * scale
        let height = bounds.height * scale
        guard width > 0, height > 0 else { return }
        ScreenInfo.gameWidth = width
        ScreenInfo.gameHeight = height
        mojo_input_push_window_size(Int32(width), Int32(height))
        virtualCursor = CGPoint(x: width / 2, y: height / 2)
    }

    // MARK: Gestures

    @objc private func onPan(_ gesture: UIPanGestureRecognizer) {
        let point = gesture.location(in: self)
        let scale = layer.contentsScale
        switch gesture.state {
        case .began:
            lastPanPoint = point
        case .changed:
            guard let last = lastPanPoint else { return }
            let dx = (point.x - last.x) * scale
            let dy = (point.y - last.y) * scale
            lastPanPoint = point
            if mojo_input_get_grabbed() == 1 {
                // Camera look: accumulate relative motion into the virtual cursor.
                let sensitivity: CGFloat = 1.4
                virtualCursor.x += dx * sensitivity
                virtualCursor.y += dy * sensitivity
            } else {
                virtualCursor = CGPoint(x: point.x * scale, y: point.y * scale)
            }
            mojo_input_push_cursor(Float(virtualCursor.x), Float(virtualCursor.y))
        default:
            lastPanPoint = nil
        }
    }

    @objc private func onTap(_ gesture: UITapGestureRecognizer) {
        if mojo_input_get_grabbed() == 0 {
            let point = gesture.location(in: self)
            let scale = layer.contentsScale
            virtualCursor = CGPoint(x: point.x * scale, y: point.y * scale)
            mojo_input_push_cursor(Float(virtualCursor.x), Float(virtualCursor.y))
        }
        mojo_input_push_mouse_button(GLFWInput.mouseLeft, GLFWInput.press, 0)
        mojo_input_push_mouse_button(GLFWInput.mouseLeft, GLFWInput.release, 0)
    }

    @objc private func onLongPress(_ gesture: UILongPressGestureRecognizer) {
        switch gesture.state {
        case .began:
            mojo_input_push_mouse_button(GLFWInput.mouseRight, GLFWInput.press, 0)
        case .ended, .cancelled, .failed:
            mojo_input_push_mouse_button(GLFWInput.mouseRight, GLFWInput.release, 0)
        default:
            break
        }
    }

    @objc private func onScroll(_ gesture: UIPanGestureRecognizer) {
        guard gesture.state == .changed else { return }
        let velocity = gesture.velocity(in: self)
        mojo_input_push_scroll(0, Float(velocity.y > 0 ? 1 : -1))
        gesture.setTranslation(.zero, in: self)
    }

    // MARK: Keyboard (chat/commands)

    @objc private func toggleKeyboard() {
        if keyboardProxy == nil {
            let proxy = KeyboardProxyTextField()
            addSubview(proxy)
            keyboardProxy = proxy
        }
        if keyboardProxy?.isFirstResponder == true {
            keyboardProxy?.resignFirstResponder()
        } else {
            keyboardProxy?.becomeFirstResponder()
        }
    }
}

/// Invisible text field that forwards typed characters (and backspace/return)
/// into the input bridge — enough for chat, commands, and sign editing.
private final class KeyboardProxyTextField: UITextField, UITextFieldDelegate {
    override init(frame: CGRect) {
        super.init(frame: .zero)
        isHidden = false
        alpha = 0.01
        autocorrectionType = .no
        autocapitalizationType = .none
        delegate = self
    }

    required init?(coder: NSCoder) { fatalError() }

    func textField(_ textField: UITextField,
                   shouldChangeCharactersIn range: NSRange,
                   replacementString string: String) -> Bool {
        if string.isEmpty {
            // Backspace
            mojo_input_push_key(259, GLFWInput.press, 0)   // GLFW_KEY_BACKSPACE
            mojo_input_push_key(259, GLFWInput.release, 0)
        } else {
            for scalar in string.unicodeScalars {
                mojo_input_push_char(Int32(bitPattern: scalar.value))
            }
        }
        return false   // never mutate the field; it's a pure event tap
    }

    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        mojo_input_push_key(GLFWKey.enter.rawValue, GLFWInput.press, 0)
        mojo_input_push_key(GLFWKey.enter.rawValue, GLFWInput.release, 0)
        return false
    }
}
