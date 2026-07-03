// Touch → LWJGL input path ("CallbackBridge" pattern).
//
// Swift touch handlers PUSH events into a fixed-size lock-free ring; the
// GLFW stub inside the LWJGL 3 iOS fork POLLS the ring once per frame from
// glfwPollEvents() (same process, so it binds these symbols directly via
// JNI RegisterNatives/JNA) and fires the corresponding GLFW callbacks into
// Minecraft. Constants are raw GLFW values so nothing needs translating on
// the Java side.
#ifndef MOJO_INPUT_BRIDGE_H
#define MOJO_INPUT_BRIDGE_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    MOJO_EVENT_KEY = 0,          // i0=keycode i1=action(1/0) i2=mods
    MOJO_EVENT_MOUSE_BUTTON = 1, // i0=button  i1=action     i2=mods
    MOJO_EVENT_CURSOR_POS = 2,   // f0=x f1=y (game-surface pixels)
    MOJO_EVENT_SCROLL = 3,       // f0=dx f1=dy
    MOJO_EVENT_CHAR = 4,         // i0=unicode codepoint (chat/keyboard input)
    MOJO_EVENT_WINDOW_SIZE = 5,  // i0=width i1=height
} mojo_event_type;

typedef struct {
    int32_t type;
    int32_t i0, i1, i2;
    float f0, f1;
} mojo_input_event;

// --- Producer side (Swift) -------------------------------------------------
void mojo_input_push_key(int32_t keycode, int32_t action, int32_t mods);
void mojo_input_push_mouse_button(int32_t button, int32_t action, int32_t mods);
void mojo_input_push_cursor(float x, float y);
void mojo_input_push_scroll(float dx, float dy);
void mojo_input_push_char(int32_t codepoint);
void mojo_input_push_window_size(int32_t width, int32_t height);

// --- Consumer side (GLFW stub, via JNI) ------------------------------------
// Returns 1 and fills *out if an event was dequeued, 0 if the queue is empty.
int mojo_input_poll(mojo_input_event *out);

// Cursor-grab state, set by Minecraft through glfwSetInputMode: 1 while the
// game wants a captured mouse (gameplay), 0 in menus. Swift reads it to
// switch between camera-drag and tap-as-pointer touch interpretation.
void mojo_input_set_grabbed(int32_t grabbed);
int32_t mojo_input_get_grabbed(void);

#ifdef __cplusplus
}
#endif

#endif
