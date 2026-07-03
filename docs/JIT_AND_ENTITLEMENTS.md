# JIT vs Interpreter on iOS, and the entitlements that matter

## Why JIT is hard on iOS

A JIT compiler writes machine code into memory and then executes it. iOS's
code-signing enforcement requires every executable page to be backed by a
signed binary, so `mprotect(addr, len, PROT_READ|PROT_EXEC)` on anonymous
memory fails with `EACCES`/`KERN_PROTECTION_FAILURE` for a normal app. There
is no public `MAP_JIT` path for third-party iOS apps (unlike macOS, where
`com.apple.security.cs.allow-jit` is a normal notarizable entitlement).

The known ways around it:

| Path | How it works | Who can use it |
|---|---|---|
| `dynamic-codesigning` entitlement | The real JIT entitlement (Safari's JavaScriptCore has it) | Apple only; not signable with any developer profile |
| Debugger attach | A process with `get-task-allow` that has (or had) a debugger attached is allowed RWX-style page flips. AltStore/SideStore "Enable JIT", StikDebug, and Xcode's Run all exploit this | Any sideloaded dev-signed app, **but** must be re-attached every cold launch, and needs a companion device/app or a VPN-loopback trick on iOS 17+/18 |
| TrollStore (`cs-allow-jit` etc. via CoreTrust bug) | Installs with fake root cert; grants JIT persistently | Only iOS versions vulnerable to the CoreTrust bugs (≤ 17.0) |
| Jailbreak | Kernel patching removes W^X enforcement | Jailbroken devices |

## The decision taken here: interpreter-only (HotSpot Zero)

This launcher deliberately runs the JVM with **no JIT at all**:

* The downloaded runtimes are OpenJDK mobile-port builds using the **Zero**
  VM variant — a portable, pure-interpreter HotSpot backend that performs no
  code generation and therefore never asks for executable memory.
* Result: the app behaves identically under every install method (free
  Apple ID 7-day certs, paid developer certs, AltStore, SideStore,
  TrollStore, enterprise). No launch-time debugger dance, no companion app,
  no failure mode where the game silently runs 10× slower because JIT
  didn't arm.
* Cost: roughly **5–10× slower** than JIT'd HotSpot. Pre-1.13 versions are
  comfortably playable on recent A-series/M-series iPads; 1.17+ needs
  realistic expectations and performance mods.

### Keeping the door open

`JREManager` downloads runtimes described by a small JSON manifest
(`runtime_manifest.json` on the artifact server). Re-enabling JIT later means:

1. Publish a `server`-VM (C1/C2) build of the same OpenJDK port as an
   alternative runtime flavor.
2. Ship the app with `get-task-allow` (Debug-style signing) and let users
   arm JIT via SideStore/StikDebug.
3. `jvm_bridge.c` already probes at boot whether a test `mprotect(PROT_EXEC)`
   succeeds and exports `mojo_jit_available()`; the UI can then offer the
   faster runtime. Nothing else in the architecture changes.

## Entitlements used by this app

Declared in `Sources/App/MojoLauncher.entitlements`:

| Entitlement | Why |
|---|---|
| `com.apple.developer.kernel.increased-memory-limit` | Raises the jetsam memory ceiling; a JVM heap of 2–4 GB plus GL translation buffers exceeds the default limit on most devices. Honored for sideloaded/dev-signed apps on iOS 15+. |
| `com.apple.developer.kernel.extended-virtual-addressing` | Lets the process reserve the large virtual address ranges HotSpot expects (heap reservation, mapped jars, metaspace). |
| `get-task-allow` (Debug signing only) | Not required for the interpreter, but harmless and keeps the future JIT path testable from Xcode. Stripped in Release archives automatically. |
| `keychain-access-groups` (implicit via signing) | Microsoft/Xbox/Minecraft tokens are stored in the Keychain. |

Deliberately **not** used: `dynamic-codesigning` (unobtainable),
App Groups (single-app), push (none).

## Sideloading interplay

* **Free Apple ID via AltStore/SideStore**: 7-day resign cycle, 3-app limit,
  10 sideloaded-app total limit. Increased-memory-limit works. Interpreter
  runs out of the box. This is the primary supported path.
* **Paid Apple Developer account**: 1-year certs, no 3-app limit; otherwise identical.
* **TrollStore** (if the device supports it): permanent install; you may
  additionally grant JIT-ish entitlements, which this build simply ignores.

See [`BUILD_AND_SIDELOAD.md`](BUILD_AND_SIDELOAD.md) for step-by-step
instructions.
