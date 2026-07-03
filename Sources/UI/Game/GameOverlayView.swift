import SwiftUI

/// Full-screen container shown while the game runs: render surface at the
/// bottom, the instance's control layout floated on top.
struct GameContainerView: View {
    @EnvironmentObject private var appState: AppState
    @State private var layout: ControlLayout = .defaultLayout()

    var body: some View {
        GeometryReader { geo in
            ZStack {
                GameSurfaceView()
                    .ignoresSafeArea()
                ForEach(layout.buttons) { button in
                    ControlButtonView(button: button)
                        .position(x: button.x * geo.size.width,
                                  y: button.y * geo.size.height)
                }
            }
        }
        .statusBarHidden(true)
        .persistentSystemOverlays(.hidden)   // minimize the home indicator
        .onAppear(perform: loadLayout)
    }

    private func loadLayout() {
        guard case .running(let instanceID) = appState.launchState,
              let instance = appState.instanceStore.instances.first(where: { $0.id == instanceID }) else { return }
        let file = appState.paths.controls.appendingPathComponent("\(instance.controlLayoutName).json")
        if let data = try? Data(contentsOf: file),
           let saved = try? JSONDecoder().decode(ControlLayout.self, from: data) {
            layout = saved
        }
    }
}
