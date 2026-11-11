// Renders the 3D model from each listed photo's pin (position + heading) into /tmp/vp_<file>.png.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const files = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto('http://localhost:4173/#model');
await p.waitForFunction(() => window.app && window.app.viewer, null, { timeout: 30000 });
for (const f of files) {
  const url = await p.evaluate((f) => window.app.viewer.renderView(window.app.house.photos.find((x) => x.file === f), { width: 480, height: 640 }), f);
  writeFileSync(`/tmp/vp_${f}.png`, Buffer.from(url.split(',')[1], 'base64'));
}
await b.close();
