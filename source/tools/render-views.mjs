import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const views = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto('http://localhost:4173/#model');
await p.waitForFunction(() => window.app && window.app.viewer, null, { timeout: 30000 });
for (const v of views) {
  const url = await p.evaluate((v) => window.app.viewer.renderView(v.startsWith('IMG') ? window.app.house.photos.find(x=>x.file===v) : v, { width: 960, height: 600 }), v);
  writeFileSync(`/tmp/r_${v}.png`, Buffer.from(url.split(',')[1], 'base64'));
}
await b.close();
