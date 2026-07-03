# MojoLauncher iOS

A PojavLauncher-style launcher for **Minecraft: Java Edition** on iPhone and
iPad. SwiftUI front end, C/JNI native core, downloadable OpenJDK mobile-port
runtime running **interpreter-only** (HotSpot Zero) — no JIT entitlements, so
it works under any plain sideload signature (AltStore, SideStore, TrollStore,
free or paid developer certificate).

You must own Minecraft: Java Edition. The launcher signs in with your
Microsoft account, verifies ownership, and downloads the game from Mojang's
official CDN — it ships no game code or assets.

## Features

* Instances with independent versions, game dirs, memory, and renderers
* Microsoft account sign-in (full MSA → Xbox Live → XSTS → Minecraft chain)
* Fabric (one-tap) and Forge (on-device headless installer) mod loaders
* On-screen control editor: drag-to-place buttons mapped to GLFW keycodes,
  toggle buttons, per-instance layouts
* Touch → keyboard/mouse translation with grab-aware camera vs pointer modes
* Java runtimes (8 / 17 / 21) downloaded on demand; small IPA
* Live in-app game log console

## Documentation

| Doc | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, data flow, risk register |
| [docs/JIT_AND_ENTITLEMENTS.md](docs/JIT_AND_ENTITLEMENTS.md) | Why interpreter-only, what JIT would take |
| [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) | File tree, artifact pipeline |
| [docs/BUILD_AND_SIDELOAD.md](docs/BUILD_AND_SIDELOAD.md) | IPA build, AltStore/SideStore/TrollStore |

## Quick start

```sh
brew install xcodegen
xcodegen generate
open MojoLauncher.xcodeproj   # set your team + bundle id, press Run
```

Before shipping you must (1) host the runtime/LWJGL artifacts and point
`LauncherPaths.runtimeManifestURL` at them, and (2) register an Azure AD app
approved by Mojang for the Minecraft API and set
`MicrosoftAuthService.clientID`. Details in the docs above.

## Status

Scaffold with an implemented Swift launcher core. The OpenJDK-for-iOS runtime
and LWJGL 3 iOS fork are consumed as downloadable artifacts and are not built
by this repo. Expect interpreter-level performance (fine for ≤1.16 on recent
devices; temper expectations for 1.17+).
