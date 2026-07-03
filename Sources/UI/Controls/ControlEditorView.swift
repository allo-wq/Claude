import SwiftUI

/// PojavLauncher-style on-screen control editor: drag buttons anywhere on a
/// mock game surface, tap to edit key mapping/size/opacity, add/remove
/// buttons. Layouts are saved as JSON under Documents/controls/ and picked
/// per-instance via controlLayoutName.
struct ControlEditorView: View {
    @EnvironmentObject private var appState: AppState
    @State private var layout = ControlLayout.defaultLayout()
    @State private var selected: ControlButton?
    @State private var dragOffsets: [UUID: CGSize] = [:]

    var body: some View {
        NavigationStack {
            GeometryReader { geo in
                ZStack {
                    // Mock game backdrop so placement is done in context.
                    LinearGradient(colors: [.green.opacity(0.35), .brown.opacity(0.4)],
                                   startPoint: .top, endPoint: .bottom)
                        .ignoresSafeArea()
                    Text("Drag buttons to reposition.\nTap a button to edit it.")
                        .multilineTextAlignment(.center)
                        .font(.callout)
                        .foregroundStyle(.secondary)

                    ForEach(layout.buttons) { button in
                        ControlButtonView(button: button, editMode: true)
                            .position(position(of: button, in: geo.size))
                            .offset(dragOffsets[button.id] ?? .zero)
                            .gesture(dragGesture(for: button, in: geo.size))
                            .onTapGesture { selected = button }
                    }
                }
            }
            .navigationTitle("Controls · \(layout.name)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .primaryAction) {
                    Button { addButton() } label: { Image(systemName: "plus.circle") }
                    Button("Save") { save() }
                }
            }
            .sheet(item: $selected) { button in
                ControlButtonInspector(layout: $layout, buttonID: button.id)
                    .presentationDetents([.medium])
            }
            .task { loadSaved() }
        }
    }

    private func position(of button: ControlButton, in size: CGSize) -> CGPoint {
        CGPoint(x: button.x * size.width, y: button.y * size.height)
    }

    private func dragGesture(for button: ControlButton, in size: CGSize) -> some Gesture {
        DragGesture()
            .onChanged { value in
                dragOffsets[button.id] = value.translation
            }
            .onEnded { value in
                dragOffsets[button.id] = nil
                guard let index = layout.buttons.firstIndex(where: { $0.id == button.id }) else { return }
                layout.buttons[index].x = min(1, max(0, button.x + value.translation.width / size.width))
                layout.buttons[index].y = min(1, max(0, button.y + value.translation.height / size.height))
            }
    }

    private func addButton() {
        layout.buttons.append(ControlButton(label: "New", x: 0.5, y: 0.4, keycodes: []))
    }

    private var layoutFile: URL {
        appState.paths.controls.appendingPathComponent("\(layout.name).json")
    }

    private func loadSaved() {
        if let data = try? Data(contentsOf: layoutFile),
           let saved = try? JSONDecoder().decode(ControlLayout.self, from: data) {
            layout = saved
        }
    }

    private func save() {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try? (try? encoder.encode(layout))?.write(to: layoutFile)
    }
}

/// Bottom-sheet inspector for a single button: label, key mapping, size,
/// opacity, toggle behavior, delete.
private struct ControlButtonInspector: View {
    @Binding var layout: ControlLayout
    let buttonID: UUID
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            if let index = layout.buttons.firstIndex(where: { $0.id == buttonID }) {
                Form {
                    Section("Button") {
                        TextField("Label", text: $layout.buttons[index].label)
                        Toggle("Toggle (latch on/off)", isOn: $layout.buttons[index].isToggle)
                    }
                    Section("Mapping") {
                        KeycodePicker(keycodes: $layout.buttons[index].keycodes)
                    }
                    Section("Appearance") {
                        VStack(alignment: .leading) {
                            Text("Size: \(Int(layout.buttons[index].size)) pt")
                            Slider(value: $layout.buttons[index].size, in: 36...96, step: 2)
                        }
                        VStack(alignment: .leading) {
                            Text("Opacity: \(Int(layout.buttons[index].opacity * 100))%")
                            Slider(value: $layout.buttons[index].opacity, in: 0.15...1)
                        }
                    }
                    Section {
                        Button("Delete button", role: .destructive) {
                            layout.buttons.remove(at: index)
                            dismiss()
                        }
                    }
                }
                .navigationTitle("Edit button")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { dismiss() }
                    }
                }
            }
        }
    }
}

/// Multi-select over the common GLFW keys defined in ControlLayout.swift.
private struct KeycodePicker: View {
    @Binding var keycodes: [Int32]

    private static let choices: [(String, GLFWKey)] = [
        ("W", .w), ("A", .a), ("S", .s), ("D", .d), ("E", .e), ("Q", .q), ("F", .f),
        ("Space", .space), ("Shift", .leftShift), ("Ctrl", .leftControl),
        ("Esc", .escape), ("Enter", .enter), ("Tab", .tab),
        ("F1", .f1), ("F3", .f3), ("F5", .f5),
        ("1", .num1), ("2", .num2), ("3", .num3), ("4", .num4), ("5", .num5),
    ]

    var body: some View {
        ForEach(Self.choices, id: \.1.rawValue) { label, key in
            Button {
                if let index = keycodes.firstIndex(of: key.rawValue) {
                    keycodes.remove(at: index)
                } else {
                    keycodes.append(key.rawValue)
                }
            } label: {
                HStack {
                    Text(label).foregroundStyle(.primary)
                    Spacer()
                    if keycodes.contains(key.rawValue) {
                        Image(systemName: "checkmark").foregroundStyle(Color.accentColor)
                    }
                }
            }
        }
    }
}
