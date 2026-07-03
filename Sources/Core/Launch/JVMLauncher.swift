import Foundation

/// Builds the final `java …` argument vector and boots the VM through the
/// native bridge (jvm_bridge.c → libjli.dylib → JLI_Launch), which runs the
/// whole thing on a dedicated big-stack thread inside this process.
struct JVMLauncher {
    let paths: LauncherPaths
    var rules = RuleEvaluator()

    func launch(instance: Instance,
                version: VersionMetadata,
                classpath: [URL],
                runtime: JREManager.Runtime,
                account: MinecraftAccount) throws {
        guard let mainClass = version.mainClass else {
            throw LauncherError.missingMainClass(version.id)
        }

        let gameDir = instance.gameDirectory(paths: paths)
        try FileManager.default.createDirectory(at: gameDir, withIntermediateDirectories: true)

        let nativesDir = paths.lwjglDir.appendingPathComponent("natives").path
        let substitutions: [String: String] = [
            "auth_player_name": account.username,
            "version_name": version.id,
            "game_directory": gameDir.path,
            "assets_root": paths.assets.path,
            "assets_index_name": version.assetIndex?.id ?? version.assets ?? "legacy",
            "game_assets": paths.assets.appendingPathComponent("virtual/\(version.assetIndex?.id ?? "legacy")").path,
            "auth_uuid": account.uuid.replacingOccurrences(of: "-", with: ""),
            "auth_access_token": account.minecraftToken,
            "auth_session": account.minecraftToken,
            "auth_xuid": account.xuid ?? "0",
            "clientid": "MojoLauncher",
            "user_type": "msa",
            "user_properties": "{}",
            "version_type": version.type ?? "release",
            "resolution_width": "\(Int(ScreenInfo.gameWidth))",
            "resolution_height": "\(Int(ScreenInfo.gameHeight))",
            "natives_directory": nativesDir,
            "launcher_name": "MojoLauncher",
            "launcher_version": "0.1.0",
            "classpath": classpath.map(\.path).joined(separator: ":"),
        ]

        var argv: [String] = []

        // --- Memory. Cap at what jetsam will actually allow.
        let requestedMB = min(instance.memoryMB, ScreenInfo.safeMaxHeapMB)
        argv.append("-Xms\(min(512, requestedMB))m")
        argv.append("-Xmx\(requestedMB)m")

        // --- iOS-specific system properties consumed by the LWJGL iOS fork.
        argv.append(contentsOf: [
            "-Djava.home=\(runtime.home.path)",
            "-Djava.io.tmpdir=\(NSTemporaryDirectory())",
            "-Duser.home=\(gameDir.path)",
            "-Duser.timezone=\(TimeZone.current.identifier)",
            "-Dos.name=iOS",
            "-Djava.library.path=\(nativesDir)",
            "-Djna.boot.library.path=\(nativesDir)",
            "-Dorg.lwjgl.system.allocator=system",
            "-Dorg.lwjgl.opengl.libname=\(instance.renderer.libraryName)",
            "-Dorg.lwjgl.glfw.checkThread0=false",
            // Headless-adjacent flags: no AWT on iOS.
            "-Djava.awt.headless=true",
            "-Dfml.earlyprogresswindow=false",
        ])

        // --- Version-declared JVM args (modern versions declare -cp here).
        var declaredCP = false
        for arg in expand(version.arguments?.jvm, substitutions) {
            if arg.hasPrefix("-cp") || arg == "${classpath}" { declaredCP = true }
            argv.append(arg)
        }
        if !declaredCP {
            argv.append(contentsOf: ["-cp", substitutions["classpath"]!])
        }

        // --- User extras (whitespace-split; quoting not supported by design).
        argv.append(contentsOf: instance.extraJVMArgs.split(separator: " ").map(String.init))

        // --- Main class + game args.
        argv.append(mainClass)
        if let template = version.minecraftArguments {
            // Legacy single-string template.
            argv.append(contentsOf: template.split(separator: " ").map { substitute(String($0), substitutions) })
        } else {
            argv.append(contentsOf: expand(version.arguments?.game, substitutions))
        }

        try bootJVM(argv: argv, runtime: runtime, gameDir: gameDir)
    }

    private func expand(_ args: [VersionMetadata.Argument]?, _ subs: [String: String]) -> [String] {
        var out: [String] = []
        for arg in args ?? [] {
            switch arg {
            case .plain(let s):
                out.append(substitute(s, subs))
            case .conditional(let ruleList, let values):
                guard rules.allows(ruleList) else { continue }
                out.append(contentsOf: values.map { substitute($0, subs) })
            }
        }
        return out
    }

    private func substitute(_ template: String, _ subs: [String: String]) -> String {
        var result = template
        for (key, value) in subs {
            result = result.replacingOccurrences(of: "${\(key)}", with: value)
        }
        return result
    }

    private func bootJVM(argv: [String], runtime: JREManager.Runtime, gameDir: URL) throws {
        setenv("HOME", gameDir.path, 1)
        setenv("JAVA_HOME", runtime.home.path, 1)
        setenv("LC_ALL", "en_US.UTF-8", 1)

        // ["java"] + argv → C string array for JLI_Launch.
        let full = ["java"] + argv
        var cArgs: [UnsafeMutablePointer<CChar>?] = full.map { strdup($0) }
        defer { cArgs.forEach { free($0) } }

        let rc = cArgs.withUnsafeMutableBufferPointer { buffer in
            mojo_start_jvm(runtime.libjliPath.path, Int32(full.count), buffer.baseAddress)
        }
        guard rc == 0 else { throw LauncherError.jvmStartFailed(rc) }
    }
}

/// Device-derived launch parameters.
enum ScreenInfo {
    // Populated by GameSurfaceView when the surface attaches; defaults are
    // only used if launch happens before layout (shouldn't in practice).
    static var gameWidth: Double = 1280
    static var gameHeight: Double = 720

    /// Leave ~1.5 GB headroom under the (entitlement-raised) jetsam limit for
    /// GL translation, netty buffers, and the interpreter itself.
    static var safeMaxHeapMB: Int {
        let physicalMB = Int(ProcessInfo.processInfo.physicalMemory / 1_048_576)
        return max(1024, physicalMB - 1536 - physicalMB / 4)
    }
}
