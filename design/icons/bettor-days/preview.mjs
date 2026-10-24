/**
 * Builds preview.html: each Bettor Days icon draft at the sizes it ships at,
 * on dark and light, with a browser tab and a home-screen label.
 *
 *   node design/icons/bettor-days/preview.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const drafts = readdirSync(dir).filter((f) => f.endsWith('.svg')).sort();
const label = (svg) => /<!-- (.+?) -->/.exec(svg)?.[1] ?? '';
const at = (svg, px) => `<span class="ic" style="width:${px}px;height:${px}px">${svg.replace(/<!--.*?-->/, '')}</span>`;

const rows = drafts.map((f) => {
  const svg = readFileSync(join(dir, f), 'utf8');
  const sizes = (bg) => `<div class="sizes ${bg}">${[180, 128, 48, 32, 16].map((px) => at(svg, px)).join('')}
    <div class="home">${at(svg, 60)}<span>Bettor Days</span></div>
    <div class="tab">${at(svg, 16)}<span>Bettor Days</span><b>×</b></div></div>`;
  return `<section><h2>${label(svg)}</h2>${sizes('dark')}${sizes('light')}</section>`;
});

writeFileSync(
  join(dir, 'preview.html'),
  `<!doctype html><meta charset="utf-8"><title>Bettor Days icons</title><style>
body{margin:0;padding:20px 24px;background:#081528;font:14px/1.3 system-ui,sans-serif;color:#e6ebf2}
h2{font-size:14px;font-weight:600;margin:0 0 8px;color:#a9b9d0}
section{margin-bottom:18px}
.sizes{display:flex;align-items:center;gap:16px;padding:12px 16px;margin-bottom:6px;border-radius:8px}
.dark{background:#0f1115}.light{background:#f2f3f5;color:#111}
.ic{display:inline-block;flex:none}.ic svg{width:100%;height:100%;display:block}
.home{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11px;margin-left:12px}
.tab{display:flex;align-items:center;gap:8px;padding:7px 12px;border-radius:8px 8px 0 0;font-size:12px;width:170px;margin-left:12px}
.dark .tab{background:#35363a;color:#e8eaed}.light .tab{background:#fff;color:#202124;box-shadow:0 0 0 1px #dadce0}
.tab b{margin-left:auto;font-weight:400;opacity:.6}
</style>${rows.join('\n')}`,
);
console.log(`${join(dir, 'preview.html')}  (${drafts.length} drafts)`);
