#include "jvm_bridge.h"

#include <dlfcn.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/mman.h>

// JLI_Launch signature (stable across OpenJDK 8..21; jboolean=uint8, jint=int32).
typedef int (*JLI_Launch_t)(int argc, char **argv,
                            int jargc, const char **jargv,
                            int appclassc, const char **appclassv,
                            const char *fullversion, const char *dotversion,
                            const char *pname, const char *lname,
                            unsigned char javaargs, unsigned char cpwildcard,
                            unsigned char javaw, int ergo);

static mojo_exit_callback g_exit_cb = NULL;

void mojo_set_exit_callback(mojo_exit_callback cb) { g_exit_cb = cb; }

typedef struct {
    char *libjli_path;
    int argc;
    char **argv;      // deep copy, owned by the thread
    int exit_code;
} launch_ctx;

static launch_ctx *ctx_create(const char *libjli_path, int argc, char **argv) {
    launch_ctx *ctx = calloc(1, sizeof(launch_ctx));
    ctx->libjli_path = strdup(libjli_path);
    ctx->argc = argc;
    ctx->argv = calloc((size_t)argc + 1, sizeof(char *));
    for (int i = 0; i < argc; i++) ctx->argv[i] = strdup(argv[i]);
    return ctx;
}

static void ctx_free(launch_ctx *ctx) {
    for (int i = 0; i < ctx->argc; i++) free(ctx->argv[i]);
    free(ctx->argv);
    free(ctx->libjli_path);
    free(ctx);
}

static int run_jli(launch_ctx *ctx) {
    void *libjli = dlopen(ctx->libjli_path, RTLD_GLOBAL | RTLD_NOW);
    if (!libjli) {
        fprintf(stderr, "[mojo] dlopen(%s) failed: %s\n", ctx->libjli_path, dlerror());
        return 100;
    }
    JLI_Launch_t JLI_Launch = (JLI_Launch_t)dlsym(libjli, "JLI_Launch");
    if (!JLI_Launch) {
        fprintf(stderr, "[mojo] JLI_Launch not found: %s\n", dlerror());
        return 101;
    }
    // JLI forks its own "main" thread internally on Darwin unless told not
    // to; the mobile port is built with that disabled, so this call runs the
    // VM to completion on the current (big-stack) thread.
    return JLI_Launch(ctx->argc, ctx->argv,
                      0, NULL, 0, NULL,
                      "", "", "java", "java",
                      0 /*javaargs*/, 1 /*cpwildcard*/, 0 /*javaw*/, 0 /*ergo*/);
}

static void *launch_thread_main(void *arg) {
    launch_ctx *ctx = (launch_ctx *)arg;
    int code = run_jli(ctx);
    if (g_exit_cb) g_exit_cb(code);
    ctx_free(ctx);
    return NULL;
}

static int spawn_launch_thread(launch_ctx *ctx, pthread_t *out_thread) {
    pthread_attr_t attr;
    pthread_attr_init(&attr);
    pthread_attr_setstacksize(&attr, 16 * 1024 * 1024);
    int rc = pthread_create(out_thread, &attr, launch_thread_main, ctx);
    pthread_attr_destroy(&attr);
    return rc;
}

int mojo_start_jvm(const char *libjli_path, int argc, char **argv) {
    launch_ctx *ctx = ctx_create(libjli_path, argc, argv);
    pthread_t thread;
    int rc = spawn_launch_thread(ctx, &thread);
    if (rc != 0) {
        ctx_free(ctx);
        return rc;
    }
    pthread_detach(thread);
    return 0;
}

typedef struct {
    launch_ctx *ctx;
    int code;
} wait_box;

static void *wait_thread_main(void *arg) {
    wait_box *box = (wait_box *)arg;
    box->code = run_jli(box->ctx);
    return NULL;
}

int mojo_run_jvm_and_wait(const char *libjli_path, int argc, char **argv) {
    // NOTE: one JVM per process — HotSpot cannot be created twice. Tool runs
    // (Forge installer) must happen before the game VM starts.
    launch_ctx *ctx = ctx_create(libjli_path, argc, argv);
    wait_box box = { .ctx = ctx, .code = -1 };
    pthread_t thread;
    pthread_attr_t attr;
    pthread_attr_init(&attr);
    pthread_attr_setstacksize(&attr, 16 * 1024 * 1024);
    int rc = pthread_create(&thread, &attr, wait_thread_main, &box);
    pthread_attr_destroy(&attr);
    if (rc != 0) {
        ctx_free(ctx);
        return rc;
    }
    pthread_join(thread, NULL);
    int code = box.code;
    ctx_free(ctx);
    return code;
}

int mojo_jit_available(void) {
    // Try to make an anonymous page executable; only succeeds when a
    // debugger armed the process, or under TrollStore/jailbreak signing.
    size_t size = (size_t)getpagesize();
    void *page = mmap(NULL, size, PROT_READ | PROT_WRITE,
                      MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (page == MAP_FAILED) return 0;
    int ok = mprotect(page, size, PROT_READ | PROT_EXEC) == 0;
    munmap(page, size);
    return ok;
}

// MARK: stdout/stderr capture for the in-app log console

static mojo_log_callback g_log_cb = NULL;

static void *log_pump_main(void *arg) {
    int fd = (int)(intptr_t)arg;
    FILE *stream = fdopen(fd, "r");
    if (!stream) return NULL;
    char *line = NULL;
    size_t cap = 0;
    ssize_t len;
    while ((len = getline(&line, &cap, stream)) > 0) {
        if (line[len - 1] == '\n') line[len - 1] = '\0';
        if (g_log_cb) g_log_cb(line);
    }
    free(line);
    fclose(stream);
    return NULL;
}

void mojo_capture_output(mojo_log_callback cb) {
    static int installed = 0;
    g_log_cb = cb;
    if (installed) return;
    installed = 1;

    int fds[2];
    if (pipe(fds) != 0) return;
    dup2(fds[1], STDOUT_FILENO);
    dup2(fds[1], STDERR_FILENO);
    close(fds[1]);
    setvbuf(stdout, NULL, _IOLBF, 0);
    setvbuf(stderr, NULL, _IONBF, 0);

    pthread_t pump;
    pthread_create(&pump, NULL, log_pump_main, (void *)(intptr_t)fds[0]);
    pthread_detach(pump);
}
