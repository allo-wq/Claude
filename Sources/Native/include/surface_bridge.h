#ifndef MOJO_SURFACE_BRIDGE_H
#define MOJO_SURFACE_BRIDGE_H

#import <QuartzCore/QuartzCore.h>

#ifdef __cplusplus
extern "C" {
#endif

void mojo_surface_set_layer(CALayer *layer, float contentScale);
CALayer *mojo_surface_get_layer(void);
float mojo_surface_get_scale(void);

#ifdef __cplusplus
}
#endif

#endif
