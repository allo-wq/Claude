// Points the add-on's "@minecraft/*" imports at the stand-ins in this folder,
// so the scripts can run under plain Node.
import { register } from 'node:module';

register('./hooks.mjs', import.meta.url);
