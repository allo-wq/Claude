// Boots the downloaded OpenJDK mobile-port runtime inside this process.
//
// Strategy: we do NOT hand-roll JNI_CreateJavaVM + JNI invocation of main().
// Instead we dlopen libjli.dylib from the runtime and call JLI_Launch(),
// the same entrypoint the `java` binary uses — it creates the VM, parses the
// full command line (-Xmx, -cp, system properties, main class, program args),
// runs main(), and handles exceptions/exit. This sidesteps needing jni.h in
// the app target entirely and matches the PojavLauncher approach.
#ifndef MOJO_JVM_BRIDGE_H
#define MOJO_JVM_BRIDGE_H

#ifdef __cplusplus
extern "C" {
#endif

// Starts the JVM on a detached thread with a 16 MB stack (Minecraft's class
// loading blows through the iOS default). argv[0] is conventionally "java".
// Returns 0 if the launch thread was created; the VM's own exit code is
// reported via the callback registered with mojo_set_exit_callback.
int mojo_start_jvm(const char *libjli_path, int argc, char **argv);

// Same, but blocks the calling thread until the VM exits and returns its
// exit code. Used for headless tool runs (e.g. the Forge installer).
int mojo_run_jvm_and_wait(const char *libjli_path, int argc, char **argv);

// Called with the VM exit code when the game quits.
typedef void (*mojo_exit_callback)(int code);
void mojo_set_exit_callback(mojo_exit_callback cb);

// Probes whether this process can flip a page to PROT_EXEC (i.e. a debugger
// armed JIT, TrollStore, or jailbreak). The interpreter-only build ignores
// the answer; the UI may surface it, and a future JIT runtime keys off it.
int mojo_jit_available(void);

// Redirects stdout/stderr into a pipe and invokes the callback per line —
// feeds the in-app log console.
typedef void (*mojo_log_callback)(const char *line);
void mojo_capture_output(mojo_log_callback cb);

#ifdef __cplusplus
}
#endif

#endif
