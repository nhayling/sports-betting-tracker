#!/usr/bin/env node
/**
 * Builds the extension to hand out: the same files and layout as the source,
 * with every script bundled and minified and every comment stripped, then
 * zipped. Load the folder with Chrome's "Load unpacked", or upload the zip to
 * a store.
 *
 *   npm run package:extension
 *
 * writes apps/extension/dist/slip-club-sync-<version>/ and its .zip
 * (dist/ is git-ignored). This only makes the code harder to read: anything
 * that runs in a browser can be read by whoever runs it, so the extension
 * stays a thin relay and all the parsing and tracking stays on the server.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, transform } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const name = `slip-club-sync-${manifest.version}`;
const dist = join(root, 'dist');
const out = join(dist, name);

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(out, 'src'), { recursive: true });

// Chrome loads these four as-is, so each keeps its path; imports (lib.js) are bundled in.
const common = { bundle: true, minify: true, legalComments: 'none', target: 'chrome110', logLevel: 'warning' };
await build({ ...common, entryPoints: [join(root, 'src/background.js'), join(root, 'src/popup.js')], outdir: join(out, 'src'), format: 'esm' });
// Content scripts are classic scripts in the page, not modules.
await build({ ...common, entryPoints: [join(root, 'src/capture-main.js'), join(root, 'src/relay.js')], outdir: join(out, 'src'), format: 'iife' });

// Transformed rather than bundled, so the font url()s stay pointing at ../fonts.
const css = await transform(readFileSync(join(root, 'src/popup.css'), 'utf8'), { loader: 'css', minify: true, legalComments: 'none' });
writeFileSync(join(out, 'src/popup.css'), css.code);
const html = readFileSync(join(root, 'src/popup.html'), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\n\s*\n/g, '\n');
writeFileSync(join(out, 'src/popup.html'), html);

cpSync(join(root, 'icons'), join(out, 'icons'), { recursive: true });
cpSync(join(root, 'fonts'), join(out, 'fonts'), { recursive: true });
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest));

// Everything the manifest and popup point at must be in the build.
const files = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
const shipped = new Set(files(out).map((f) => relative(out, f)));
const wanted = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  ...manifest.content_scripts.flatMap((c) => c.js),
  ...Object.values(manifest.icons),
  'src/popup.css',
];
const missing = wanted.filter((f) => !shipped.has(f));
if (missing.length) throw new Error(`build is missing ${missing.join(', ')}`);
// Nothing but what the extension needs: no tests, scripts or source maps.
const extra = [...shipped].filter((f) => !/^(manifest\.json|src\/(background|popup|capture-main|relay)\.(js|html|css)|icons\/.+\.png|fonts\/.+\.woff2)$/.test(f));
if (extra.length) throw new Error(`build has unexpected files: ${extra.join(', ')}`);
// A comment that survived minifying would mean the source's explanations shipped too.
for (const f of [...shipped].filter((f) => f.endsWith('.js'))) {
  if (/\/\*[\s\S]*?\*\/|^\s*\/\//m.test(readFileSync(join(out, f), 'utf8'))) throw new Error(`${f} still has comments`);
}

execFileSync('zip', ['-r', '-X', '-q', `${name}.zip`, name], { cwd: dist });
const kb = (f) => `${Math.round(statSync(f).size / 1024)} kB`;
console.log(`${relative(process.cwd(), out)}/  (${shipped.size} files)`);
console.log(`${relative(process.cwd(), join(dist, `${name}.zip`))}  ${kb(join(dist, `${name}.zip`))}`);
