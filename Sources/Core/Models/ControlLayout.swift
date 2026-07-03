import Foundation
import CoreGraphics

/// On-screen control layout, PojavLauncher-style: buttons positioned in
/// normalized coordinates, each mapped to one or more GLFW key codes.
struct ControlLayout: Codable, Identifiable {
    var id = UUID()
    var name: String
    var buttons: [ControlButton]

    static func defaultLayout() -> ControlLayout {
        ControlLayout(name: "default", buttons: [
            ControlButton(label: "W", x: 0.12, y: 0.60, keycodes: [GLFWKey.w.rawValue]),
            ControlButton(label: "A", x: 0.05, y: 0.72, keycodes: [GLFWKey.a.rawValue]),
            ControlButton(label: "S", x: 0.12, y: 0.84, keycodes: [GLFWKey.s.rawValue]),
            ControlButton(label: "D", x: 0.19, y: 0.72, keycodes: [GLFWKey.d.rawValue]),
            ControlButton(label: "Jump", x: 0.88, y: 0.78, keycodes: [GLFWKey.space.rawValue]),
            ControlButton(label: "Sneak", x: 0.88, y: 0.62, keycodes: [GLFWKey.leftShift.rawValue], isToggle: true),
            ControlButton(label: "Inv", x: 0.94, y: 0.10, keycodes: [GLFWKey.e.rawValue]),
            ControlButton(label: "Esc", x: 0.04, y: 0.08, keycodes: [GLFWKey.escape.rawValue]),
            ControlButton(label: "F3", x: 0.12, y: 0.08, keycodes: [GLFWKey.f3.rawValue]),
            ControlButton(label: "⌨", x: 0.20, y: 0.08, keycodes: [], special: .toggleKeyboard),
        ])
    }
}

struct ControlButton: Codable, Identifiable, Hashable {
    var id = UUID()
    var label: String
    /// Normalized [0,1] center position; resolution-independent.
    var x: Double
    var y: Double
    /// Diameter in points.
    var size: Double = 56
    var opacity: Double = 0.55
    /// GLFW key codes fired while pressed (all at once — enables combos).
    var keycodes: [Int32]
    /// Toggle buttons latch on/off instead of press/release (e.g. sneak).
    var isToggle: Bool = false
    var special: SpecialAction?

    enum SpecialAction: String, Codable {
        case toggleKeyboard      // raise the iOS keyboard for chat/commands
        case toggleMouse         // switch between camera-drag and pointer mode
        case scrollUp, scrollDown
    }
}

/// GLFW 3 key codes (stable ABI constants; the LWJGL GLFW stub consumes
/// these unchanged). Only the keys the default layouts need are listed —
/// extend freely, values are the standard GLFW ones.
enum GLFWKey: Int32 {
    case space = 32
    case a = 65, b = 66, c = 67, d = 68, e = 69, f = 70, g = 71, h = 72
    case i = 73, j = 74, k = 75, l = 76, m = 77, n = 78, o = 79, p = 80
    case q = 81, r = 82, s = 83, t = 84, u = 85, v = 86, w = 87, x = 88
    case y = 89, z = 90
    case escape = 256, enter = 257, tab = 258
    case f1 = 290, f2 = 291, f3 = 292, f4 = 293, f5 = 294
    case leftShift = 340, leftControl = 341, leftAlt = 342
    case num1 = 49, num2 = 50, num3 = 51, num4 = 52, num5 = 53
    case num6 = 54, num7 = 55, num8 = 56, num9 = 57
}

/// GLFW action / mouse button constants shared with input_bridge.
enum GLFWInput {
    static let release: Int32 = 0
    static let press: Int32 = 1
    static let mouseLeft: Int32 = 0
    static let mouseRight: Int32 = 1
    static let mouseMiddle: Int32 = 2
}
