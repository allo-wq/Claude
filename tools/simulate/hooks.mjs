import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const MOCKS = {
  "@minecraft/server": new URL("./mock-server.mjs", import.meta.url).href,
  "@minecraft/server-ui": new URL("./mock-server-ui.mjs", import.meta.url).href,
};

export async function resolve(specifier, context, nextResolve) {
  if (MOCKS[specifier]) return { url: MOCKS[specifier], shortCircuit: true };
  return nextResolve(specifier, context);
}

// The pack's .js files are ES modules (as Minecraft loads them) but sit
// outside any package.json, so tell Node explicitly.
export async function load(url, context, nextLoad) {
  if (url.startsWith("file:") && url.includes("/behavior_pack/scripts/")) {
    return { format: "module", source: await readFile(fileURLToPath(url)), shortCircuit: true };
  }
  return nextLoad(url, context);
}
