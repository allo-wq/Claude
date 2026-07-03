#include "input_bridge.h"

#include <stdatomic.h>
#include <string.h>

// Single-producer (UI thread) / single-consumer (game render thread) ring.
// Power-of-two capacity; on overflow the event is dropped — at 4096 slots
// that only happens if the game stalls for seconds, and dropping stale input
// is the right behavior then anyway.
#define RING_CAPACITY 4096
#define RING_MASK (RING_CAPACITY - 1)

static mojo_input_event g_ring[RING_CAPACITY];
static _Atomic uint32_t g_head = 0;   // consumer position
static _Atomic uint32_t g_tail = 0;   // producer position
static _Atomic int32_t g_grabbed = 0;

static void push(mojo_input_event ev) {
    uint32_t tail = atomic_load_explicit(&g_tail, memory_order_relaxed);
    uint32_t head = atomic_load_explicit(&g_head, memory_order_acquire);
    if (tail - head >= RING_CAPACITY) return;   // full: drop
    g_ring[tail & RING_MASK] = ev;
    atomic_store_explicit(&g_tail, tail + 1, memory_order_release);
}

int mojo_input_poll(mojo_input_event *out) {
    uint32_t head = atomic_load_explicit(&g_head, memory_order_relaxed);
    uint32_t tail = atomic_load_explicit(&g_tail, memory_order_acquire);
    if (head == tail) return 0;
    *out = g_ring[head & RING_MASK];
    atomic_store_explicit(&g_head, head + 1, memory_order_release);
    return 1;
}

void mojo_input_push_key(int32_t keycode, int32_t action, int32_t mods) {
    push((mojo_input_event){ .type = MOJO_EVENT_KEY, .i0 = keycode, .i1 = action, .i2 = mods });
}

void mojo_input_push_mouse_button(int32_t button, int32_t action, int32_t mods) {
    push((mojo_input_event){ .type = MOJO_EVENT_MOUSE_BUTTON, .i0 = button, .i1 = action, .i2 = mods });
}

void mojo_input_push_cursor(float x, float y) {
    push((mojo_input_event){ .type = MOJO_EVENT_CURSOR_POS, .f0 = x, .f1 = y });
}

void mojo_input_push_scroll(float dx, float dy) {
    push((mojo_input_event){ .type = MOJO_EVENT_SCROLL, .f0 = dx, .f1 = dy });
}

void mojo_input_push_char(int32_t codepoint) {
    push((mojo_input_event){ .type = MOJO_EVENT_CHAR, .i0 = codepoint });
}

void mojo_input_push_window_size(int32_t width, int32_t height) {
    push((mojo_input_event){ .type = MOJO_EVENT_WINDOW_SIZE, .i0 = width, .i1 = height });
}

void mojo_input_set_grabbed(int32_t grabbed) {
    atomic_store_explicit(&g_grabbed, grabbed, memory_order_release);
}

int32_t mojo_input_get_grabbed(void) {
    return atomic_load_explicit(&g_grabbed, memory_order_acquire);
}
