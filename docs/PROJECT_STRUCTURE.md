# Xcode Project Structure

The `.xcodeproj` is generated, not committed. From the repo root:

```sh
brew install xcodegen
xcodegen generate        # → MojoLauncher.xcodeproj
open MojoLauncher.xcodeproj
```

## File tree

```
.
├── project.yml                        # XcodeGen spec (single app target)
├── docs/
│   ├── ARCHITECTURE.md                # deliverable 1
│   ├── JIT_AND_ENTITLEMENTS.md
│   ├── PROJECT_STRUCTURE.md           # this file (deliverable 2)
│   └── BUILD_AND_SIDELOAD.md          # deliverable 5
├── Sources/
│   ├── App/
│   │   ├── MojoLauncherApp.swift      # @main, environment wiring
│   │   ├── AppState.swift             # top-level observable state
│   │   ├── Info.plist
│   │   └── MojoLauncher.entitlements
│   ├── Core/                          # deliverable 3 (pure Swift, no UI)
│   │   ├── Models/
│   │   │   ├── VersionManifest.swift  # piston-meta manifest v2
│   │   │   ├── VersionMetadata.swift  # per-version JSON incl. rules/args
│   │   │   ├── Instance.swift
│   │   │   └── ControlLayout.swift
│   │   ├── Net/
│   │   │   ├── DownloadEngine.swift   # parallel + SHA-1 verify + retry
│   │   │   └── ManifestService.swift  # fetch/merge version JSONs
│   │   ├── Launch/
│   │   │   ├── RuleEvaluator.swift
│   │   │   ├── LibraryResolver.swift  # classpath + LWJGL iOS substitution
│   │   │   ├── AssetDownloader.swift
│   │   │   ├── JREManager.swift       # runtime download/unpack/select
│   │   │   └── JVMLauncher.swift      # argv builder → native bridge
│   │   ├── ModLoader/
│   │   │   ├── FabricInstaller.swift
│   │   │   └── ForgeInstaller.swift
│   │   ├── Auth/
│   │   │   ├── MicrosoftAuthService.swift  # MSA→XBL→XSTS→MC chain
│   │   │   └── KeychainStore.swift
│   │   ├── InstanceStore.swift
│   │   └── LauncherPaths.swift        # Documents/… layout, single source of truth
│   ├── UI/                            # deliverable 4 (SwiftUI)
│   │   ├── RootView.swift             # tabbed shell
│   │   ├── Instances/
│   │   │   ├── InstanceListView.swift
│   │   │   └── InstanceEditView.swift # create/edit, version + loader pickers
│   │   ├── Settings/
│   │   │   └── SettingsView.swift     # memory, renderer, JVM args
│   │   ├── Controls/
│   │   │   ├── ControlEditorView.swift # drag-to-place on-screen controls
│   │   │   └── ControlButtonView.swift
│   │   ├── Account/
│   │   │   └── AccountView.swift
│   │   └── Game/
│   │       ├── GameSurfaceView.swift  # UIViewRepresentable CAMetalLayer host
│   │       └── GameOverlayView.swift  # in-game controls overlay
│   └── Native/                        # C/ObjC, compiled into the app target
│       ├── include/
│       │   ├── MojoBridging.h         # bridging header (includes the two below)
│       │   ├── jvm_bridge.h
│       │   └── input_bridge.h
│       ├── jvm_bridge.c               # dlopen(libjvm) + JNI_CreateJavaVM
│       ├── input_bridge.c             # touch → GLFW-stub event queue
│       └── surface_bridge.m           # CALayer handoff to LWJGL port
├── Resources/                         # (icons, default control layouts)
│   └── default_controls.json
└── README.md
```

## Third-party runtime artifacts (downloaded, never committed)

`JREManager` fetches these at first launch from the artifact server declared
in `LauncherPaths.runtimeManifestURL`:

| Artifact | Contents |
|---|---|
| `jre8-ios-arm64-zero.tar.xz` | OpenJDK 8 mobile port, Zero VM (MC ≤ 1.16) |
| `jre17-ios-arm64-zero.tar.xz` | OpenJDK 17, Zero VM (MC 1.17–1.20.4) |
| `jre21-ios-arm64-zero.tar.xz` | OpenJDK 21, Zero VM (MC 1.20.5+) |
| `lwjgl3-ios.tar.xz` | LWJGL 3 iOS fork jars + libs (GLFW stub, GL4ES/ANGLE) |

These are the same class of artifacts PojavLauncher's iOS fork builds; the
repo's `docs/` explain how to produce them (out of scope for the scaffold).

## Why no Swift Package / multiple targets?

Keeping Core, UI, and Native in one target avoids module-boundary friction
with the C bridging header. When the codebase grows, `Sources/Core` can be
lifted into a local SwiftPM package with the C bridge as a `cTarget` — the
directory layout above is already shaped for that split.
