import Foundation
import SwiftUI

/// Top-level observable state shared across the app.
@MainActor
final class AppState: ObservableObject {
    let paths = LauncherPaths.default
    let instanceStore: InstanceStore
    let manifestService: ManifestService
    let authService: MicrosoftAuthService
    let jreManager: JREManager

    @Published var account: MinecraftAccount?
    @Published var manifest: VersionManifest?
    @Published var launchState: LaunchState = .idle
    @Published var bootstrapError: String?

    enum LaunchState: Equatable {
        case idle
        case preparing(step: String, progress: Double)
        case running(instanceID: UUID)
        case failed(String)
    }

    init() {
        instanceStore = InstanceStore(paths: paths)
        manifestService = ManifestService(paths: paths)
        authService = MicrosoftAuthService()
        jreManager = JREManager(paths: paths)
    }

    func bootstrap() async {
        do {
            try paths.createDirectories()
            try instanceStore.load()
            account = try? authService.restoreSession()
            manifest = try await manifestService.fetchManifest()
        } catch {
            bootstrapError = error.localizedDescription
        }
    }

    /// The full "Play" pipeline. See docs/ARCHITECTURE.md §2.
    func launch(_ instance: Instance) async {
        guard let account else {
            launchState = .failed("Sign in with a Microsoft account that owns Minecraft first.")
            return
        }
        do {
            let refreshed = try await authService.refreshIfNeeded(account)
            self.account = refreshed

            launchState = .preparing(step: "Resolving version…", progress: 0.05)
            let version = try await manifestService.resolveVersion(id: instance.effectiveVersionID)

            launchState = .preparing(step: "Preparing Java runtime…", progress: 0.15)
            let runtime = try await jreManager.ensureRuntime(major: version.javaVersion?.majorVersion ?? 17) { p in
                Task { @MainActor in self.launchState = .preparing(step: "Downloading Java runtime…", progress: 0.15 + 0.25 * p) }
            }

            launchState = .preparing(step: "Resolving libraries…", progress: 0.45)
            let resolver = LibraryResolver(paths: paths)
            let plan = try resolver.plan(for: version)

            let engine = DownloadEngine()
            try await engine.run(plan.downloads) { p in
                Task { @MainActor in self.launchState = .preparing(step: "Downloading libraries…", progress: 0.45 + 0.2 * p) }
            }

            launchState = .preparing(step: "Checking assets…", progress: 0.68)
            let assets = AssetDownloader(paths: paths, engine: engine)
            try await assets.ensureAssets(for: version) { p in
                Task { @MainActor in self.launchState = .preparing(step: "Downloading assets…", progress: 0.68 + 0.27 * p) }
            }

            launchState = .preparing(step: "Starting JVM…", progress: 0.98)
            let launcher = JVMLauncher(paths: paths)
            try launcher.launch(instance: instance,
                                version: version,
                                classpath: plan.classpath,
                                runtime: runtime,
                                account: refreshed)
            launchState = .running(instanceID: instance.id)
        } catch {
            launchState = .failed(error.localizedDescription)
        }
    }
}
