// Globals Minecraft's script engine provides that the ES2022 library does not declare.
declare const console: {
  log(...data: unknown[]): void;
  warn(...data: unknown[]): void;
  error(...data: unknown[]): void;
};
