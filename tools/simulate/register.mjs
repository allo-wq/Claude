// Lets Node run the behavior pack's scripts outside Minecraft by swapping the
// game's script modules for the stand-ins in this folder.
import { register } from "node:module";

register("./hooks.mjs", import.meta.url);
