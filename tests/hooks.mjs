const STAND_INS = {
  '@minecraft/server': './mock-server.mjs',
  '@minecraft/server-ui': './mock-server-ui.mjs',
};

export async function resolve(specifier, context, nextResolve) {
  if (specifier in STAND_INS) {
    return { url: new URL(STAND_INS[specifier], import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
