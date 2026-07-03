# Building the IPA & Sideloading

## Prerequisites

* macOS with Xcode 15+
* [XcodeGen](https://github.com/yonaskolb/XcodeGen): `brew install xcodegen`
* An Apple ID (free is fine) or a paid Apple Developer account
* A published artifact set (runtimes + LWJGL) — see "Artifact server" below

## 1. Generate and open the project

```sh
git clone <this repo> && cd <repo>
xcodegen generate
open MojoLauncher.xcodeproj
```

## 2. Configure signing

In Xcode → target **MojoLauncher** → *Signing & Capabilities*:

1. Set **Team** to your Apple ID / developer team.
2. Change the **bundle identifier** to something unique
   (e.g. `com.yourname.mojolauncher`) — free accounts can't reuse ids.
3. Leave the two kernel entitlements in place
   (`increased-memory-limit`, `extended-virtual-addressing`).
   * Free/personal teams: if provisioning rejects them, delete them from
     `Sources/App/MojoLauncher.entitlements` and regenerate — the launcher
     still runs, but cap instance memory at ~1.5 GB on 4 GB devices.

Also set `MicrosoftAuthService.clientID` (Sources/Core/Auth) to your Azure AD
app id. Register the app at https://portal.azure.com (public client, personal
accounts, redirect URI `mojolauncher://auth`) and request Minecraft API
approval through Mojang's launcher form — sign-in returns 403 from
`api.minecraftservices.com` until Mojang approves the client id.

## 3. Build an IPA

### Directly to a connected device (simplest)

Select your device and press **Run**. Done — skip to "First launch".

### Archive → IPA (for AltStore/SideStore distribution)

```sh
xcodebuild -project MojoLauncher.xcodeproj \
  -scheme MojoLauncher \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath build/MojoLauncher.xcarchive \
  archive

xcodebuild -exportArchive \
  -archivePath build/MojoLauncher.xcarchive \
  -exportPath build/ipa \
  -exportOptionsPlist ExportOptions.plist   # method: development
```

Minimal `ExportOptions.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>development</string>
  <key>signingStyle</key><string>automatic</string>
  <key>compileBitcode</key><false/>
</dict></plist>
```

An **unsigned** IPA (for users to sign themselves with AltStore/SideStore) can
be produced by zipping the `.app`:

```sh
mkdir -p Payload && cp -r build/MojoLauncher.xcarchive/Products/Applications/MojoLauncher.app Payload/
zip -r MojoLauncher.ipa Payload
```

## 4. Sideloading

### AltStore

1. Install AltServer on a Mac/PC, then AltStore onto the device
   (Wi-Fi pairing + your Apple ID).
2. On the device: AltStore → *My Apps* → **+** → pick `MojoLauncher.ipa`.
3. AltStore signs with your free-account certificate. Free accounts:
   the app expires every **7 days** — AltStore auto-refreshes when it can
   reach AltServer on the same network.
4. Free-account limits: 3 sideloaded apps, 10 App IDs per week.

### SideStore

Same flow but no computer needed after initial setup (on-device signing via a
loopback VPN pairing file). Recommended for users who can't run AltServer
regularly. Import the IPA from Files → share sheet → SideStore.

### TrollStore (iOS versions with the CoreTrust bug, ≤ 17.0)

Open the IPA with TrollStore → permanent install, no resigning, entitlements
kept. The interpreter build gains nothing extra from TrollStore's JIT
allowance, but the install convenience is real.

### Why not the App Store / TestFlight

The launcher downloads and executes third-party code (the JVM runtime, game
jars, mods) — a hard App Review rejection (guideline 2.5.2). Distribution is
sideload-only; publish the IPA in an AltStore/SideStore *source* JSON so users
get update notifications.

## 5. First launch checklist

1. Launch → **Account** tab → *Sign in with Microsoft* (account must own
   Minecraft: Java Edition; ownership is verified).
2. **Play** tab → **+** → pick a version (start with 1.12.2 or 1.16.5 to
   gauge interpreter performance on your device) → Save.
3. Press ▶. First run downloads the JRE (~150 MB), libraries, and assets
   (~500 MB for modern versions) — Wi-Fi strongly recommended.
4. Expect minutes-long first boot on the interpreter; subsequent boots are
   faster (classes verified, assets cached).

## Artifact server

`LauncherPaths.runtimeManifestURL` must point at a `runtime_manifest.json`
you host (a GitHub Release works):

```json
{
  "runtimes": [
    { "major": 8,  "version": "8u422",     "url": "https://…/jre8-ios-arm64-zero.tar.xz",  "sha1": "…" },
    { "major": 17, "version": "17.0.11+1", "url": "https://…/jre17-ios-arm64-zero.tar.xz", "sha1": "…" },
    { "major": 21, "version": "21.0.3+1",  "url": "https://…/jre21-ios-arm64-zero.tar.xz", "sha1": "…" }
  ],
  "lwjgl": { "major": 0, "version": "3.3.3-ios1", "url": "https://…/lwjgl3-ios.tar.xz", "sha1": "…" }
}
```

Building the runtimes themselves (OpenJDK `--with-jvm-variants=zero`
cross-compiled for `aarch64-apple-ios`, plus the LWJGL 3 fork with the GLFW
stub bound to `input_bridge`/`surface_bridge`) is its own project — the
PojavLauncher-iOS ecosystem's `android-openjdk-build`-style pipelines are the
reference. Until you host artifacts, the launcher UI works end-to-end but
`ensureRuntime` will fail with a clear error at the download step.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| “Unable to install” from AltStore | App ID quota (10/week on free accounts) or expired AltServer pairing — retry after a week or re-pair. |
| Killed at ~2 GB RAM despite entitlement | Free-team profile stripped the entitlement; lower `-Xmx`, or use a paid team. |
| Sign-in HTTP 403 | Azure client id not yet approved by Mojang for the Minecraft API. |
| Black screen after "Starting JVM" | Renderer mismatch — switch the instance between GL4ES/ANGLE; check the log tab for `dlopen` errors (missing LWJGL artifact). |
| `jvmStartFailed(100)` | Runtime download incomplete/wrong arch — delete `Documents/runtimes` and retry. |
