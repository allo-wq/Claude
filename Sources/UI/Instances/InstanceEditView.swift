import SwiftUI

/// Create/edit an instance: version picker (from the live manifest), mod
/// loader + loader-version pickers, memory, renderer, extra JVM args.
struct InstanceEditView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var draft: Instance
    @State private var showSnapshots = false
    @State private var fabricLoaders: [String] = []
    @State private var forgeVersions: [String] = []
    @State private var installing = false
    @State private var installError: String?
    private let isNew: Bool

    init(instance: Instance?) {
        _draft = State(initialValue: instance ?? Instance(name: "New Instance", minecraftVersion: ""))
        isNew = (instance == nil)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Instance") {
                    TextField("Name", text: $draft.name)
                }

                Section("Minecraft version") {
                    Toggle("Show snapshots", isOn: $showSnapshots)
                    Picker("Version", selection: $draft.minecraftVersion) {
                        ForEach(availableVersions) { entry in
                            Text(entry.id).tag(entry.id)
                        }
                    }
                    .pickerStyle(.navigationLink)
                }

                Section("Mod loader") {
                    Picker("Loader", selection: $draft.modLoader) {
                        ForEach(ModLoader.allCases) { loader in
                            Text(loader.displayName).tag(loader)
                        }
                    }
                    .pickerStyle(.segmented)
                    if draft.modLoader != .vanilla {
                        Picker("Loader version", selection: loaderVersionBinding) {
                            ForEach(loaderVersions, id: \.self) { v in
                                Text(v).tag(Optional(v))
                            }
                        }
                        if loaderVersions.isEmpty {
                            Text("No \(draft.modLoader.displayName) builds found for \(draft.minecraftVersion.isEmpty ? "this version" : draft.minecraftVersion).")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Section("Java") {
                    Stepper("Memory: \(draft.memoryMB) MB", value: $draft.memoryMB, in: 512...ScreenInfo.safeMaxHeapMB, step: 256)
                    Picker("Renderer", selection: $draft.renderer) {
                        Text("GL4ES (GLES 3)").tag(Renderer.gl4es)
                        Text("ANGLE (Metal)").tag(Renderer.angle)
                    }
                    TextField("Extra JVM arguments", text: $draft.extraJVMArgs)
                        .font(.footnote.monospaced())
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                }

                if let installError {
                    Section {
                        Text(installError).foregroundStyle(.red).font(.footnote)
                    }
                }
            }
            .navigationTitle(isNew ? "New Instance" : "Edit Instance")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if installing {
                        ProgressView()
                    } else {
                        Button("Save") { Task { await save() } }
                            .disabled(draft.minecraftVersion.isEmpty || draft.name.isEmpty)
                    }
                }
            }
            .task { seedDefaults() }
            .onChange(of: draft.minecraftVersion) { _ in Task { await reloadLoaderVersions() } }
            .onChange(of: draft.modLoader) { _ in Task { await reloadLoaderVersions() } }
        }
    }

    private var availableVersions: [VersionManifest.Entry] {
        let all = appState.manifest?.versions ?? []
        return showSnapshots ? all : all.filter(\.isRelease)
    }

    private var loaderVersions: [String] {
        switch draft.modLoader {
        case .vanilla: return []
        case .fabric: return fabricLoaders
        case .forge: return forgeVersions
        }
    }

    private var loaderVersionBinding: Binding<String?> {
        Binding(get: { draft.modLoaderVersion },
                set: { draft.modLoaderVersion = $0 })
    }

    private func seedDefaults() {
        if draft.minecraftVersion.isEmpty {
            draft.minecraftVersion = appState.manifest?.latest.release ?? ""
        }
        // Newer versions default to ANGLE (core-profile GL); legacy to GL4ES.
        Task { await reloadLoaderVersions() }
    }

    private func reloadLoaderVersions() async {
        installError = nil
        guard !draft.minecraftVersion.isEmpty else { return }
        switch draft.modLoader {
        case .vanilla:
            break
        case .fabric:
            let installer = FabricInstaller(paths: appState.paths)
            fabricLoaders = (try? await installer.availableLoaders(minecraftVersion: draft.minecraftVersion))?
                .map(\.loader.version) ?? []
            if draft.modLoaderVersion == nil || !fabricLoaders.contains(draft.modLoaderVersion ?? "") {
                draft.modLoaderVersion = fabricLoaders.first
            }
        case .forge:
            let installer = ForgeInstaller(paths: appState.paths, jreManager: appState.jreManager)
            forgeVersions = (try? await installer.availableVersions(minecraftVersion: draft.minecraftVersion)) ?? []
            if draft.modLoaderVersion == nil || !forgeVersions.contains(draft.modLoaderVersion ?? "") {
                draft.modLoaderVersion = forgeVersions.first
            }
        }
    }

    private func save() async {
        installing = true
        defer { installing = false }
        do {
            // Install the loader profile so effectiveVersionID resolves at launch.
            switch draft.modLoader {
            case .vanilla:
                break
            case .fabric:
                guard let loader = draft.modLoaderVersion else { return }
                try await FabricInstaller(paths: appState.paths)
                    .install(minecraftVersion: draft.minecraftVersion, loaderVersion: loader)
            case .forge:
                guard let forge = draft.modLoaderVersion else { return }
                try await ForgeInstaller(paths: appState.paths, jreManager: appState.jreManager)
                    .install(minecraftVersion: draft.minecraftVersion, forgeVersion: forge) { _ in }
            }
            try appState.instanceStore.save(draft)
            dismiss()
        } catch {
            installError = error.localizedDescription
        }
    }
}
