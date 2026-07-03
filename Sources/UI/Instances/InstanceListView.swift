import SwiftUI

struct InstanceListView: View {
    @EnvironmentObject private var appState: AppState
    @State private var editingInstance: Instance?
    @State private var creating = false

    var body: some View {
        NavigationStack {
            Group {
                if appState.instanceStore.instances.isEmpty {
                    ContentUnavailableCompatView(
                        title: "No instances yet",
                        message: "Create one to pick a Minecraft version and mod loader.")
                } else {
                    List {
                        ForEach(appState.instanceStore.instances) { instance in
                            InstanceRow(instance: instance) {
                                Task { await appState.launch(instance) }
                            }
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) {
                                    try? appState.instanceStore.delete(instance)
                                } label: { Label("Delete", systemImage: "trash") }
                                Button {
                                    editingInstance = instance
                                } label: { Label("Edit", systemImage: "pencil") }
                            }
                        }
                    }
                }
            }
            .navigationTitle("MojoLauncher")
            .toolbar {
                Button { creating = true } label: { Image(systemName: "plus") }
            }
            .sheet(isPresented: $creating) {
                InstanceEditView(instance: nil)
            }
            .sheet(item: $editingInstance) { instance in
                InstanceEditView(instance: instance)
            }
            .alert("Launch failed", isPresented: launchFailedShown) {
                Button("OK") { appState.launchState = .idle }
            } message: {
                if case .failed(let message) = appState.launchState { Text(message) }
            }
        }
    }

    private var launchFailedShown: Binding<Bool> {
        Binding(
            get: {
                if case .failed = appState.launchState { return true }
                return false
            },
            set: { if !$0 { appState.launchState = .idle } }
        )
    }
}

private struct InstanceRow: View {
    let instance: Instance
    let onPlay: () -> Void

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: instance.modLoader == .vanilla ? "cube" : "wrench.and.screwdriver")
                .font(.title2)
                .frame(width: 40, height: 40)
                .background(Color.accentColor.opacity(0.15), in: RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 2) {
                Text(instance.name).font(.headline)
                Text("\(instance.minecraftVersion) · \(instance.modLoader.displayName)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button(action: onPlay) {
                Image(systemName: "play.fill")
                    .font(.title3)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.borderedProminent)
            .clipShape(Circle())
        }
        .padding(.vertical, 4)
    }
}

/// ContentUnavailableView shim (iOS 15 deployment target).
struct ContentUnavailableCompatView: View {
    let title: String
    let message: String

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "cube.transparent")
                .font(.system(size: 44))
                .foregroundStyle(.tertiary)
            Text(title).font(.title3.weight(.semibold))
            Text(message)
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(40)
    }
}
