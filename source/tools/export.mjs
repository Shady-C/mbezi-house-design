// Exports plans (SVG + PDF), the 3D model (GLB) and renders (PNG) into --out (default dist/).
// Usage: node tools/export.mjs --out dist
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { launchOptions } from './chrome.mjs';
import { renderPlan, clearSize } from '../src/plan/plan-svg.js';
import { deriveWalls } from '../src/model/geometry.js';

const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'dist';
const root = fileURLToPath(new URL('../', import.meta.url));
const o = (p) => `${root}${out}/${p}`;
mkdirSync(o('renders'), { recursive: true });

const house = JSON.parse(readFileSync(root + 'data/house.json', 'utf8'));
const floor = renderPlan(house, { mode: 'floor', dims: true, pins: false, selected: null });
const site = renderPlan(house, { mode: 'site', dims: true, pins: false, selected: null });
writeFileSync(o('floor-plan.svg'), floor);
writeFileSync(o('site-plan.svg'), site);
copyFileSync(root + 'data/house.json', o('house.json'));
copyFileSync(root + 'data/estimates.md', o('estimates.md'));

const walls = deriveWalls(house);
const rows = house.rooms.filter((r) => r.kind === 'indoor').map((r) => {
  const c = clearSize(r, walls);
  return `<tr><td>${r.name}</td><td>${c.w.toFixed(1)} × ${c.d.toFixed(1)} m</td><td>${(c.w * c.d).toFixed(1)} m²</td><td>${r.estimate.confidence}</td><td>${r.estimate.note}</td></tr>`;
}).join('');
const printHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page { size: A4 landscape; margin: 10mm; }
body { font: 10pt system-ui, sans-serif; color: #24221f; margin: 0; }
h1 { font-size: 15pt; margin: 0 0 2mm; } p { margin: 0 0 3mm; color: #6b6760; }
.plans { display: flex; gap: 8mm; height: 165mm; } .plans div { flex: 1; display: flex; flex-direction: column; }
.plans h2 { font-size: 11pt; margin: 0 0 2mm; } .plans svg { flex: 1; width: 100%; height: 100%; }
.page2 { page-break-before: always; } table { border-collapse: collapse; width: 100%; font-size: 9pt; }
th, td { text-align: left; padding: 2mm; border-bottom: 0.3mm solid #ddd; vertical-align: top; }
</style></head><body>
<h1>Mbezi house: floor plan and site plan</h1>
<p>Estimated from 68 photos and a hand sketch, 11 Nov 2026. Sizes ±10–15 %; italic values are estimates. North from the photos' compass data.</p>
<div class="plans"><div><h2>Floor plan</h2>${floor.replace('<svg ', '<svg preserveAspectRatio="xMidYMid meet" ')}</div><div><h2>Site plan</h2>${site.replace('<svg ', '<svg preserveAspectRatio="xMidYMid meet" ')}</div></div>
<div class="page2"><h1>Room sizes and how they were estimated</h1>
<p>Clear size = wall face to wall face. Correct any of these in the web page's Edit sizes tab.</p>
<table><thead><tr><th>Room</th><th>Clear size</th><th>Area</th><th>Confidence</th><th>Basis</th></tr></thead><tbody>${rows}</tbody></table></div>
</body></html>`;

// Serve web/ on any free port; the server prints the port it got.
const server = spawn(process.execPath, [root + 'tools/serve.mjs', '0'], { stdio: ['ignore', 'pipe', 'inherit'] });
let browser;
try {
  const port = await new Promise((resolve, reject) => {
    server.stdout.on('data', (d) => { const m = /on (\d+)/.exec(String(d)); if (m) resolve(m[1]); });
    server.on('exit', (code) => reject(new Error(`server exited (${code})`)));
    setTimeout(() => reject(new Error('server did not start')), 10000);
  });
  browser = await chromium.launch(launchOptions);
  const pdfPage = await browser.newPage();
  await pdfPage.setContent(printHtml, { waitUntil: 'load' });
  await pdfPage.pdf({ path: o('floor-plan.pdf'), format: 'A4', landscape: true, printBackground: true });

  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await page.goto(`http://localhost:${port}/#model`);
  await page.waitForFunction(() => window.app && window.app.viewer, null, { timeout: 60000 });
  for (const v of ['aerial', 'dollhouse', 'living', 'kitchen', 'bd2', 'front-yard']) {
    const url = await page.evaluate((v) => window.app.viewer.renderView(v, { width: 1920, height: 1080 }), v);
    writeFileSync(o(`renders/${v}.png`), Buffer.from(url.split(',')[1], 'base64'));
  }
  const glb = await page.evaluate(async () => {
    const buf = new Uint8Array(await window.app.viewer.exportGLB());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  });
  writeFileSync(o('house.glb'), Buffer.from(glb, 'base64'));
} finally {
  await browser?.close();
  server.kill();
}
console.log(`exported to ${out}/`);
