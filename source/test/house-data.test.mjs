import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateHouse } from '../src/model/schema.js';
import { roomArea, bbox, distToPolygon, v } from '../src/model/geometry.js';

const h = JSON.parse(readFileSync(new URL('../data/house.json', import.meta.url)));
const room = (id) => h.rooms.find((r) => r.id === id);

const ROOM_IDS = ['living', 'kitchen', 'porch', 'hall', 'bd1', 'wc1', 'ensuite', 'bd2', 'owc', 'walk-w', 'walk-e', 'walk-n', 'parking'];
const OPENING_IDS = ['door-front', 'arch-kitchen', 'open-hall', 'win-living-w', 'win-living-e', 'win-kitchen-w', 'win-kitchen-e',
  'win-hall-e1', 'win-hall-e2', 'door-bd1', 'win-bd1-w', 'door-wc1', 'door-bd2', 'door-ensuite', 'win-ensuite-w',
  'win-bd2-w', 'win-bd2-s', 'win-bd2-e', 'door-owc', 'win-owc-e', 'gate'];

test('house.json validates', () => {
  assert.deepEqual(validateHouse(h).errors, []);
});

test('has exactly the expected rooms and openings', () => {
  assert.deepEqual(h.rooms.map((r) => r.id).sort(), [...ROOM_IDS].sort());
  assert.deepEqual(h.openings.map((o) => o.id).sort(), [...OPENING_IDS].sort());
  assert.equal(h.openings.filter((o) => o.type === 'window').length, 12);
});

test('BD 2 is the bigger bedroom', () => {
  assert.ok(roomArea(room('bd2')) > roomArea(room('bd1')));
});

test('hall and walkway widths are plausible', () => {
  const hall = bbox(room('hall').polygon);
  const hw = hall.maxX - hall.minX;
  assert.ok(hw >= 0.9 && hw <= 1.5, `hall ${hw}`);
  const e = bbox(room('walk-e').polygon), w = bbox(room('walk-w').polygon);
  const ew = e.maxX - e.minX, ww = w.maxX - w.minX;
  assert.ok(ew >= 0.8 && ew <= 1.3, `east ${ew}`);
  assert.ok(ww > ew);
});

test('outside W/C is on the compound wall and has no door to the kitchen', () => {
  const p = room('owc').polygon;
  const plot = bbox(h.plot.polygon);
  assert.ok(p.some(([x, y]) => x === plot.minX || x === plot.maxX || y === plot.minY || y === plot.maxY));
  assert.ok(!h.openings.some((o) => o.room === 'owc' && o.type !== 'window' && o.id !== 'door-owc'));
  assert.ok(!h.openings.some((o) => o.room === 'kitchen' && o.type === 'door'));
});

test('north comes from EXIF', () => {
  assert.equal(h.northDeg.source, 'exif');
  assert.ok(h.northDeg.value >= 0 && h.northDeg.value < 360);
});

test('every dimension has a source and confidence', () => {
  const bad = [];
  const walk = (x, path) => {
    if (x && typeof x === 'object' && !Array.isArray(x)) {
      if ('value' in x && !(x.source && x.confidence)) bad.push(path);
      for (const [k, val] of Object.entries(x)) walk(val, `${path}.${k}`);
    } else if (Array.isArray(x)) x.forEach((val, i) => walk(val, `${path}[${i}]`));
  };
  walk(h, 'h');
  assert.deepEqual(bad, []);
  for (const o of h.openings) for (const k of ['offset', 'width', 'height', 'sill']) assert.equal(typeof o[k], 'object', `${o.id}.${k}`);
  for (const r of h.rooms) assert.ok(r.estimate && r.estimate.source && r.estimate.confidence, `${r.id}.estimate`);
});

test('all 68 photos are placed inside their room', () => {
  assert.equal(h.photos.length, 68);
  for (const p of h.photos) {
    const r = room(p.room);
    assert.ok(r, `${p.file} room ${p.room}`);
    assert.ok(distToPolygon([p.x, p.y], r.polygon) <= 0.3, `${p.file} at ${p.x},${p.y} not in ${p.room}`);
    assert.ok(p.heading === null || (p.heading >= 0 && p.heading < 360));
  }
});

test('BD 2 big 3-panel window faces west, regular one east (photos 3474, 3475)', () => {
  const w = (id) => v(h.openings.find((o) => o.id === id).width);
  assert.ok(w('win-bd2-w') > w('win-bd2-e'));
  const ac = h.fixtures.find((f) => f.id === 'ac-bd2');
  assert.ok(ac.x < 3.0, 'BD 2 AC on the west wall');
});

test('indoor heading overrides are listed in estimates.md', () => {
  const md = readFileSync(new URL('../data/estimates.md', import.meta.url), 'utf8');
  for (const f of ['IMG_3455', 'IMG_3474', 'IMG_3476']) assert.ok(md.includes(f.slice(4)), f);
  assert.equal(h.photos.find((p) => p.file === 'IMG_3455').heading, 100);
});
