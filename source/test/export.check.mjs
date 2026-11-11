// Run after `npm run export`: node --test test/export.check.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const d = (p) => new URL('../dist/' + p, import.meta.url);
const VIEWS = ['aerial', 'dollhouse', 'living', 'kitchen', 'bd2', 'front-yard'];
const FILES = ['floor-plan.svg', 'site-plan.svg', 'floor-plan.pdf', 'house.glb', 'house.json', 'estimates.md', ...VIEWS.map((v) => `renders/${v}.png`)];

test('every export exists and is not trivially small', () => {
  for (const f of FILES) assert.ok(statSync(d(f)).size > 1024, f);
});

test('PDF, GLB and PNG files have the right signatures', () => {
  assert.equal(readFileSync(d('floor-plan.pdf')).subarray(0, 4).toString(), '%PDF');
  assert.equal(readFileSync(d('house.glb')).subarray(0, 4).toString(), 'glTF');
  for (const v of VIEWS) {
    const b = readFileSync(d(`renders/${v}.png`));
    assert.equal(b.subarray(1, 4).toString(), 'PNG', v);
    assert.equal(b.readUInt32BE(16), 1920, `${v} width`);
    assert.equal(b.readUInt32BE(20), 1080, `${v} height`);
  }
});

test('SVG plans are standalone and carry a scale bar', () => {
  for (const f of ['floor-plan.svg', 'site-plan.svg']) {
    const s = readFileSync(d(f), 'utf8');
    assert.match(s, /^<\?xml|^<svg/);
    assert.match(s, /xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    assert.match(s, /id="scale-bar"/);
  }
});
