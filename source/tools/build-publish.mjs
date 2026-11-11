// Copies web/ to publish/ for the artifact: three.js comes from the jsDelivr CDN (allowed for artifact pages)
// instead of the local vendor copy, so only files written for this project are published.
import { fileURLToPath } from 'node:url';
import { cpSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
const r = (p) => fileURLToPath(new URL('../' + p, import.meta.url));
const ver = JSON.parse(readFileSync(r('node_modules/three/package.json'), 'utf8')).version;
rmSync(r('publish'), { recursive: true, force: true });
cpSync(r('web'), r('publish'), { recursive: true, filter: (src) => !src.includes('/web/vendor') });
const cdn = `https://cdn.jsdelivr.net/npm/three@${ver}`;
const html = readFileSync(r('publish/index.html'), 'utf8').replace(
  /<script type="importmap">[^<]*<\/script>/,
  `<script type="importmap">{ "imports": { "three": "${cdn}/build/three.module.js", "three/addons/": "${cdn}/examples/jsm/" } }</script>`);
writeFileSync(r('publish/index.html'), html);
console.log(`publish/ ready (three ${ver} from CDN)`);
