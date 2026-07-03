import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var appState: AppState
    @AppStorage("defaultMemoryMB") private var defaultMemoryMB = 2048
    @AppStorage("defaultRenderer") private var defaultRenderer = Renderer.gl4es.rawValue
    @AppStorage("resolutionScale") private var resolutionScale = 0.75
    @AppStorage("showFPSOverlay") private var showFPSOverlay = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Stepper("Default memory: \(defaultMemoryMB) MB",
                            value: $defaultMemoryMB, in: 512...ScreenInfo.safeMaxHeapMB, step: 256)
                    Text("Device limit ≈ \(ScreenInfo.safeMaxHeapMB) MB (jetsam headroom already subtracted).")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                } header: {
                    Text("Java")
                } footer: {
                    Text("This build runs the JVM interpreter-only (no JIT); heavy modpacks and 1.17+ will be slow. See docs/JIT_AND_ENTITLEMENTS.md.")
                }

                Section("Graphics") {
                    Picker("Default renderer", selection: $defaultRenderer) {
                        Text("GL4ES (GLES 3)").tag(Renderer.gl4es.rawValue)
                        Text("ANGLE (Metal)").tag(Renderer.angle.rawValue)
                    }
                    VStack(alignment: .leading) {
                        Text("Render resolution: \(Int(resolutionScale * 100))%")
                        Slider(value: $resolutionScale, in: 0.25...1.0, step: 0.05)
                    }
                    Toggle("FPS overlay", isOn: $showFPSOverlay)
                }

                Section("Diagnostics") {
                    LabeledContent("JIT available", value: mojo_jit_available() == 1 ? "Yes (ignored — interpreter build)" : "No")
                    LabeledContent("Physical memory", value: "\(Int(ProcessInfo.processInfo.physicalMemory / 1_048_576)) MB")
                    NavigationLink("Latest game log") { LogView() }
                }

                Section("Storage") {
                    Button("Reveal launcher files in Files app") {
                        // Documents/ is exposed via UIFileSharingEnabled; deep-link to it.
                        if let url = URL(string: "shareddocuments://\(appState.paths.root.path)") {
                            UIApplication.shared.open(url)
                        }
                    }
                    Button("Clear download cache", role: .destructive) {
                        try? FileManager.default.removeItem(at: appState.paths.cache)
                        try? appState.paths.createDirectories()
                    }
                }
            }
            .navigationTitle("Settings")
        }
    }
}

/// Live tail of JVM stdout/stderr captured by mojo_capture_output.
struct LogView: View {
    @StateObject private var log = GameLog.shared

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 1) {
                    ForEach(Array(log.lines.enumerated()), id: \.offset) { index, line in
                        Text(line)
                            .font(.system(size: 11, design: .monospaced))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .id(index)
                    }
                }
                .padding(8)
            }
            .onChange(of: log.lines.count) { count in
                proxy.scrollTo(count - 1, anchor: .bottom)
            }
        }
        .navigationTitle("Game log")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Collects lines from the native stdout/stderr pump. Installed once.
final class GameLog: ObservableObject {
    static let shared = GameLog()
    @Published private(set) var lines: [String] = []

    private init() {
        mojo_capture_output { cLine in
            guard let cLine else { return }
            let line = String(cString: cLine)
            DispatchQueue.main.async {
                let log = GameLog.shared
                log.lines.append(line)
                if log.lines.count > 5000 { log.lines.removeFirst(1000) }
            }
        }
    }
}
