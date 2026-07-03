import SwiftUI

struct RootView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        TabView {
            InstanceListView()
                .tabItem { Label("Play", systemImage: "cube.fill") }
            ControlEditorView()
                .tabItem { Label("Controls", systemImage: "hand.draw") }
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
            AccountView()
                .tabItem { Label("Account", systemImage: "person.crop.circle") }
        }
        .overlay { launchOverlay }
        .fullScreenCover(isPresented: isRunning) {
            GameContainerView()
        }
        .alert("Launcher error", isPresented: bootstrapErrorShown) {
            Button("OK") { appState.bootstrapError = nil }
        } message: {
            Text(appState.bootstrapError ?? "")
        }
    }

    @ViewBuilder
    private var launchOverlay: some View {
        if case .preparing(let step, let progress) = appState.launchState {
            VStack(spacing: 16) {
                ProgressView(value: progress)
                    .frame(maxWidth: 280)
                Text(step)
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            .padding(28)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 20))
        }
    }

    private var isRunning: Binding<Bool> {
        Binding(
            get: {
                if case .running = appState.launchState { return true }
                return false
            },
            set: { if !$0 { appState.launchState = .idle } }
        )
    }

    private var bootstrapErrorShown: Binding<Bool> {
        Binding(get: { appState.bootstrapError != nil },
                set: { if !$0 { appState.bootstrapError = nil } })
    }
}
