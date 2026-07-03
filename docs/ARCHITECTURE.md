# MojoLauncher iOS — Architecture Overview

A PojavLauncher-style launcher for **Minecraft: Java Edition** on iPhone/iPad.
SwiftUI front end, C/JNI native core, downloaded OpenJDK mobile-port runtime,
**interpreter-only JVM (HotSpot Zero variant)** so the app runs under a plain
sideload signature with no JIT entitlement tricks.

> The user must own Minecraft: Java Edition. The launcher never ships game
> code or assets — everything is fetched from Mojang's official CDN using the
> user's own Microsoft account, exactly like the desktop launcher does.

---

## 1. Component map

```
┌─────────────────────────────────────────────────────────────────────┐
│                            SwiftUI App                              │
│  InstanceListView   SettingsView   ControlEditorView   AccountView  │
│         │                 │               │                │        │
│  ┌──────┴─────────────────┴───────────────┴────────────────┴─────┐  │
│  │                     Swift Launcher Core                       │  │
│  │  ManifestService   DownloadEngine   AssetDownloader           │  │
│  │  LibraryResolver   JREManager      MicrosoftAuthService       │  │
│  │  InstanceStore     FabricInstaller / ForgeInstaller           │  │
│  │  JVMLauncher (argument builder)                               │  │
│  └───────────────────────────┬───────────────────────────────────┘  │
│                              │ C interop (SPM/clang bridging)       │
│  ┌───────────────────────────┴───────────────────────────────────┐  │
│  │                       Native Bridge (C/ObjC)                   │  │
│  │  jvm_bridge.c    — dlopen(libjvm) + JNI_CreateJavaVM + main    │  │
│  │  input_bridge.c  — touch → key/mouse event queue (GLFW stub)   │  │
│  │  surface_bridge.m— hands CAMetalLayer/CAEAGLLayer to LWJGL     │  │
│  └───────────────────────────┬───────────────────────────────────┘  │
│                              │ JNI                                  │
│  ┌───────────────────────────┴───────────────────────────────────┐  │
│  │            Java world (inside the same process)                │  │
│  │  OpenJDK 8/17/21 mobile port (Zero VM, interpreter-only)       │  │
│  │  LWJGL 3 iOS fork (GLFW stub reads input_bridge event queue)   │  │
│  │  GL4ES or ANGLE (desktop GL → GLES/Metal translation)          │  │
│  │  Minecraft + Fabric/Forge                                      │  │
│  └────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Swift Launcher Core (all in `Sources/Core/`)

| Component | Responsibility |
|---|---|
| `ManifestService` | Fetches `piston-meta.mojang.com` version manifest v2 and per-version JSON; merges `inheritsFrom` chains (needed for Fabric/Forge profiles). |
| `DownloadEngine` | Concurrent, resumable downloads with SHA-1 verification and retry/backoff. Everything else funnels through it. |
| `AssetDownloader` | Resolves the asset index, downloads objects from `resources.download.minecraft.net` into the hashed `assets/objects/xx/` layout. |
| `LibraryResolver` | Evaluates library `rules`, builds the classpath, and **substitutes desktop LWJGL/natives with the iOS-port jars** (the single biggest difference from a desktop launcher). |
| `JREManager` | Downloads and unpacks the OpenJDK mobile-port runtimes (8 / 17 / 21) on first use; picks the right one from the version JSON's `javaVersion.majorVersion`. |
| `MicrosoftAuthService` | Full MSA chain: OAuth (ASWebAuthenticationSession) → Xbox Live → XSTS → Minecraft services token → entitlement check → profile. Tokens live in the Keychain. |
| `InstanceStore` | Instances (name, version, mod loader, JVM args, control layout, game dir) persisted as JSON under `Documents/instances/`. |
| `FabricInstaller` / `ForgeInstaller` | Produce a version JSON with `inheritsFrom` (Fabric: one meta call; Forge: run the official installer headless inside our JVM). |
| `JVMLauncher` | Assembles the final `-Xmx… -Djava.library.path=… -cp … mainClass --username …` argument vector and hands it to `jvm_bridge`. |

### Native bridge (`Sources/Native/`)

* **`jvm_bridge.c`** — `dlopen()`s `libjvm.dylib` from the downloaded runtime,
  calls `JNI_CreateJavaVM` **on a dedicated thread with a large stack**
  (the iOS main thread's 1 MB stack is not enough), locates the main class,
  invokes `main(String[])`. Exit is trapped so a game quit doesn't kill the app
  uncleanly.
* **`input_bridge.c`** — a lock-free event queue shared with the Java GLFW
  stub. Swift touch handlers push `{type, keycode, x, y, scancode, mods}`
  events; the Java side drains them each frame and fires GLFW callbacks.
  This is the same "CallbackBridge" pattern PojavLauncher uses.
* **`surface_bridge.m`** — exposes the rendering `CALayer` pointer to the
  LWJGL iOS fork so GL4ES (GLES2/3 backend) or ANGLE (Metal backend) can
  create its context on it.

---

## 2. Data flow: pressing "Play"

```
Play tapped
  → MicrosoftAuthService.refreshIfNeeded()          (Keychain tokens)
  → ManifestService.resolve(versionId)              (merge inheritsFrom)
  → JREManager.ensureRuntime(majorVersion)          (download jre17 if absent)
  → LibraryResolver.plan(version)                   (classpath + LWJGL swap)
  → AssetDownloader.ensureAssets(version.assetIndex)
  → DownloadEngine runs the whole plan (SHA-1 verified, parallel)
  → JVMLauncher.buildArgs(instance, account, paths)
  → SurfaceView installs CAMetalLayer, input_bridge armed
  → jvm_bridge: dlopen(libjvm) → JNI_CreateJavaVM → mainClass.main(args)
  → Minecraft renders through GL4ES/ANGLE onto our layer;
    touches flow SwiftUI → input_bridge → GLFW stub → Minecraft
```

Filesystem layout (all under the app sandbox):

```
Documents/
├── instances/<uuid>/instance.json     # per-instance config + game dir
│   └── gamedir/ (saves, mods, options.txt, …)
├── runtimes/jre8|jre17|jre21/         # downloaded OpenJDK ports
├── versions/<id>/<id>.json            # Mojang + modloader version JSONs
├── libraries/…                        # maven-layout jars (shared)
├── assets/indexes/ + assets/objects/  # shared asset store
└── controls/*.json                    # on-screen control layouts
```

## 3. JIT vs interpreter — why this build is interpreter-only

iOS forbids a process from creating writable-then-executable memory unless it
has the `dynamic-codesigning` entitlement (undistributable) or is being
debugged (`get-task-allow` + an attached debugger makes `MAP_JIT`-style
`mprotect(RX)` succeed). The three realistic tiers:

| Mode | Requirement | Relative speed |
|---|---|---|
| HotSpot C1/C2 JIT | Jailbreak, TrollStore (`cs-allow-jit`), or debugger attach at every launch (AltStore/SideStore "Enable JIT", StikDebug) | 1× |
| Zero VM, interpreter-only | **Nothing — any valid sideload signature** | ~5–10× slower |

**This project targets the second row by design decision.** The runtime we
download is built with the *Zero* HotSpot variant (pure C++ interpreter, no
codegen), so no executable pages are ever mapped and the app runs identically
under a free developer certificate, AltStore, SideStore, or TrollStore. The
full entitlement story — including what you would add to re-enable JIT later —
is documented in [`JIT_AND_ENTITLEMENTS.md`](JIT_AND_ENTITLEMENTS.md).

Entitlements we *do* use (all legal for sideloading):

* `com.apple.developer.kernel.increased-memory-limit` — Minecraft + JVM heap
  will not fit in the default ~2–3 GB jetsam limit on many devices.
* `com.apple.developer.kernel.extended-virtual-addressing` — the JVM reserves
  large virtual ranges (heap, metaspace, mapped jars).

## 4. Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Interpreter performance: modern versions (1.17+) may run < 15 fps on older devices | High | Ship performance presets (Sodium-equivalents via Fabric, reduced render distance defaults); document expectation clearly; architecture keeps a JIT path open behind `JREManager` (a Zero→server-VM runtime swap plus entitlement is the only change). |
| Memory (jetsam) kills: JVM heap + GL translation can exceed the per-app limit | High | Increased-memory-limit entitlement, default `-Xmx` derived from `os_proc_available_memory()`, aggressive `-Xmn` tuning, warn below 6 GB devices. |
| OpenJDK mobile port maintenance: we depend on a community arm64-ios Zero build | Medium | `JREManager` treats runtimes as versioned downloadable artifacts with a manifest — swapping the upstream build is a server-side change. |
| Forge installer complexity (processors, at-runtime patching) | Medium | Run the official installer headless inside our own JVM (the Pojav approach) instead of re-implementing processor logic. |
| GL translation gaps: core-profile GL 3.2 features missing in GL4ES | Medium | Renderer is pluggable per instance: GL4ES (GLES3) or ANGLE (Metal); default chosen by MC version. |
| Apple review / distribution: this can never ship in the App Store (downloads executable code) | Accepted | Sideload-only distribution (AltStore/SideStore source), documented in BUILD_AND_SIDELOAD.md. |
| Account safety: MSA tokens on device | Medium | Keychain (`kSecAttrAccessibleAfterFirstUnlock`), no token ever written to game dir or logs. |
| Legal: launcher must not distribute Mojang property | Low (by design) | Only official CDNs + user's own account; mirrors PojavLauncher's accepted model. |

## 5. Deliverable map

| # | Deliverable | Where |
|---|---|---|
| 1 | Architecture (this file) | `docs/ARCHITECTURE.md`, `docs/JIT_AND_ENTITLEMENTS.md` |
| 2 | Xcode project structure | `project.yml` (XcodeGen), `Sources/` tree, `docs/PROJECT_STRUCTURE.md` |
| 3 | Launcher core | `Sources/Core/**` + `Sources/Native/**` |
| 4 | UI | `Sources/UI/**` |
| 5 | Build & sideload | `docs/BUILD_AND_SIDELOAD.md` |
