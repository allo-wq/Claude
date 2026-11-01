#!/usr/bin/env node
/*
 * Inlines styles, scripts, fonts and images from src/ into a single
 * self-contained file: dist/zadbox-animation.html
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../src');
const OUT = path.join(__dirname, '../dist/zadbox-animation.html');
const MIME = { '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' };

const cache = new Map();
function dataUri(rel, base) {
  const file = path.resolve(base, rel);
  if (!cache.has(file)) {
    const mime = MIME[path.extname(file).toLowerCase()];
    if (!mime) throw new Error('Unknown asset type: ' + file);
    cache.set(file, `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`);
  }
  return cache.get(file);
}
const safeScript = (js) => js.replace(/<\/script/gi, '<\\/script');

let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => {
  const cssPath = path.join(SRC, href);
  const css = fs.readFileSync(cssPath, 'utf8')
    .replace(/url\("([^"]+)"\)/g, (m, u) => (u.startsWith('data:') ? m : `url("${dataUri(u, path.dirname(cssPath))}")`));
  return `<style>\n${css}</style>`;
});
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) =>
  `<script>\n${safeScript(fs.readFileSync(path.join(SRC, src), 'utf8'))}\n</script>`);
html = html.replace(/(<img[^>]*?\ssrc=")([^"]+)(")/g, (m, a, src, b) =>
  src.startsWith('data:') ? m : a + dataUri(src, SRC) + b);

const leftovers = html.match(/(src|href)="(?!data:|#)[^"]+"/g);
if (leftovers) throw new Error('Unresolved references: ' + leftovers.join(', '));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`Wrote ${path.relative(process.cwd(), OUT)} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB, ${cache.size} assets inlined)`);
