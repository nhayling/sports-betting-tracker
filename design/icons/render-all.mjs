/**
 * Renders every shipped icon from icon.svg and icon-square.svg with headless
 * Chrome, each drawn at its own pixel size (not scaled down from a big one).
 * macOS only (uses sips to crop), and Chrome in /Applications.
 *
 *   node design/icons/render-all.mjs
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// Headless Chrome won't lay out narrower than about 500px, so each icon is drawn in the middle of a bigger page and cropped.
const PAGE = 600;

const jobs = [
  // [source, size, output, transparent corners]
  ['icon.svg', 32, 'apps/web/public/favicon-32.png', true],
  ['icon-square.svg', 180, 'apps/web/public/apple-touch-icon.png', false],
  ...[16, 32, 48, 128].map((s) => ['icon.svg', s, `apps/extension/icons/icon-${s}.png`, true]),
];

const work = mkdtempSync(join(tmpdir(), 'icons-'));
try {
  for (const [src, size, out, transparent] of jobs) {
    const svg = readFileSync(join(here, src), 'utf8').replace('<svg ', `<svg width="${size}" height="${size}" `);
    const page = join(work, 'page.html');
    writeFileSync(
      page,
      `<!doctype html><html><body style="margin:0;background:transparent;width:${PAGE}px;height:${PAGE}px;display:grid;place-items:center">${svg}</body></html>`,
    );
    const shot = join(work, 'shot.png');
    execFileSync(CHROME, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      `--user-data-dir=${join(work, 'profile')}`,
      ...(transparent ? ['--default-background-color=00000000'] : []),
      `--window-size=${PAGE},${PAGE}`,
      `--screenshot=${shot}`,
      `file://${page}`,
    ], { stdio: 'ignore' });
    execFileSync('sips', ['-c', String(size), String(size), shot, '--out', join(repo, out)], { stdio: 'ignore' });
    console.log(`${out}  ${size}×${size}`);
  }
  copyFileSync(join(here, 'icon.svg'), join(repo, 'apps/web/public/favicon.svg'));
  console.log('apps/web/public/favicon.svg');
} finally {
  rmSync(work, { recursive: true, force: true });
}
