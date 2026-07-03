// Hands the rendering CALayer to the LWJGL iOS fork.
//
// The GLFW stub's glfwCreateWindow() calls mojo_surface_get_layer() and
// creates its GL context on it: GL4ES binds a CAEAGLLayer (GLES3), the
// ANGLE path binds a CAMetalLayer. GameSurfaceView registers its layer here
// before the JVM boots.
#import <QuartzCore/QuartzCore.h>

static CALayer *g_render_layer = nil;
static float g_scale = 1.0f;

void mojo_surface_set_layer(CALayer *layer, float contentScale) {
    g_render_layer = layer;
    g_scale = contentScale;
}

CALayer *mojo_surface_get_layer(void) {
    return g_render_layer;
}

float mojo_surface_get_scale(void) {
    return g_scale;
}
