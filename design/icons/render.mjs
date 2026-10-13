/**
 * Renders a page or SVG to PNG with headless Chrome (needs Chrome started with
 * --remote-debugging-port=9333). Used to produce icon PNGs from the SVG sources.
 *
 *   node render.mjs <file-or-url> <width> <height> <out.png> [transparent]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const [src, w, h, out, transparent] = process.argv.slice(2);
const targets = await (await fetch('http://localhost:9333/json')).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) pending.get(d.id)(d.result), pending.delete(d.id);
};
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: false });
if (transparent) await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
await send('Page.enable');
let url = src;
if (!/^https?:|^file:/.test(src)) {
  if (src.endsWith('.svg')) {
    // Fill the viewport exactly, no margins.
    const svg = readFileSync(src, 'utf8').replace('<svg ', `<svg width="${w}" height="${h}" `);
    url = `data:text/html;base64,${Buffer.from(`<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`).toString('base64')}`;
  } else url = pathToFileURL(resolve(src)).href;
}
await send('Page.navigate', { url });
await new Promise((r) => setTimeout(r, 500));
const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: +w, height: +h, scale: 1 } });
writeFileSync(out, Buffer.from(shot.data, 'base64'));
ws.close();
