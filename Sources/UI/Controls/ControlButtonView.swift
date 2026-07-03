import SwiftUI

/// One on-screen control button. In game mode it pushes key events into the
/// native input bridge on press/release (or toggles). In edit mode presses
/// are ignored — ControlEditorView layers drag/selection gestures on top.
struct ControlButtonView: View {
    let button: ControlButton
    var editMode = false

    @State private var pressed = false
    @State private var toggled = false

    var body: some View {
        Text(button.label)
            .font(.system(size: button.size * 0.32, weight: .semibold, design: .rounded))
            .frame(width: button.size, height: button.size)
            .background(
                Circle().fill(active ? Color.accentColor.opacity(0.75)
                                     : Color.black.opacity(button.opacity))
            )
            .overlay(Circle().strokeBorder(.white.opacity(editMode ? 0.9 : 0.35),
                                           style: StrokeStyle(lineWidth: 1.5, dash: editMode ? [5, 4] : [])))
            .foregroundStyle(.white)
            .gesture(editMode ? nil : pressGesture)
    }

    private var active: Bool { pressed || toggled }

    private var pressGesture: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { _ in
                guard !pressed else { return }
                pressed = true
                if button.isToggle {
                    toggled.toggle()
                    fire(action: toggled ? GLFWInput.press : GLFWInput.release)
                } else {
                    fire(action: GLFWInput.press)
                }
            }
            .onEnded { _ in
                pressed = false
                if !button.isToggle {
                    fire(action: GLFWInput.release)
                }
            }
    }

    private func fire(action: Int32) {
        if let special = button.special {
            guard action == GLFWInput.press else { return }
            handleSpecial(special)
            return
        }
        for keycode in button.keycodes {
            mojo_input_push_key(keycode, action, 0)
        }
    }

    private func handleSpecial(_ special: ControlButton.SpecialAction) {
        switch special {
        case .toggleKeyboard:
            NotificationCenter.default.post(name: .mojoToggleKeyboard, object: nil)
        case .toggleMouse:
            mojo_input_set_grabbed(mojo_input_get_grabbed() == 1 ? 0 : 1)
        case .scrollUp:
            mojo_input_push_scroll(0, 1)
        case .scrollDown:
            mojo_input_push_scroll(0, -1)
        }
    }
}

extension Notification.Name {
    static let mojoToggleKeyboard = Notification.Name("mojoToggleKeyboard")
}
