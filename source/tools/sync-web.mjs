// Copies tested modules, data and three.js into web/ so the page runs exactly the tested code.
import { fileURLToPath } from 'node:url';
import { cpSync, mkdirSync } from 'node:fs';
const r = (p) => fileURLToPath(new URL('../' + p, import.meta.url));
mkdirSync(r('web/vendor'), { recursive: true });
mkdirSync(r('web/data'), { recursive: true });
cpSync(r('src'), r('web/src'), { recursive: true });
cpSync(r('data/house.json'), r('web/data/house.json'));
for (const f of ['three.module.js', 'three.core.js']) cpSync(r('node_modules/three/build/' + f), r('web/vendor/' + f));
for (const f of ['controls/OrbitControls.js', 'exporters/GLTFExporter.js']) {
  mkdirSync(r('web/vendor/addons/' + f.split('/')[0]), { recursive: true });
  cpSync(r('node_modules/three/examples/jsm/' + f), r('web/vendor/addons/' + f));
}
console.log('synced web/');
