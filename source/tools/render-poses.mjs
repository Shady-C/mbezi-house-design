import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const poses = JSON.parse(process.argv[2]);
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto('http://localhost:4173/#model');
await p.waitForFunction(() => window.app && window.app.viewer, null, { timeout: 30000 });
let i = 0;
for (const pose of poses) {
  const url = await p.evaluate((ph) => window.app.viewer.renderView(ph, { width: 640, height: 400 }), pose);
  writeFileSync(`/tmp/p_${i++}.png`, Buffer.from(url.split(',')[1], 'base64'));
}
await b.close();
