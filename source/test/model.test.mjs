import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateHouse } from '../src/model/schema.js';
import { v, roomArea, deriveWalls, openingRect, collide, nearestPhotos } from '../src/model/geometry.js';

export function fixture() {
  return {
    version: 1,
    northDeg: { value: 85, source: 'exif', confidence: 'medium' },
    rooms: [
      { id: 'a', name: 'A', kind: 'indoor', polygon: [[0, 0], [4, 0], [4, 3], [0, 3]], floor: 'wood-look', ceiling: { type: 'flat', height: 3 } },
      { id: 'b', name: 'B', kind: 'indoor', polygon: [[4, 0], [8, 0], [8, 3], [4, 3]], floor: 'white-diagonal', ceiling: { type: 'flat', height: 3 } },
    ],
    openings: [
      { id: 'door-ab', room: 'a', edge: 1, offset: 1.0, width: 0.9, height: 2.1, sill: 0, type: 'door', swing: 'in-left' },
      { id: 'win-a-w', room: 'a', edge: 3, offset: 0.9, width: 1.2, height: 1.2, sill: 0.9, type: 'window', swing: null },
    ],
    plot: { polygon: [[-2, -2], [10, -2], [10, 5], [-2, 5]], wallHeight: 2.4 },
    roof: { type: 'hip-front-gable', overhang: 0.6, pitchDeg: 22 },
    fixtures: [],
    photos: [
      { file: 'IMG_1', x: 1, y: 1, heading: 10, room: 'a' },
      { file: 'IMG_2', x: 7, y: 2, heading: null, room: 'b' },
    ],
  };
}

test('fixture validates', () => {
  const r = validateHouse(fixture());
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

test('missing polygon is reported with its path', () => {
  const h = fixture();
  delete h.rooms[0].polygon;
  const r = validateHouse(h);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('rooms[0].polygon')), r.errors.join('; '));
});

test('dimension objects need a known source and confidence', () => {
  const h = fixture();
  h.northDeg = { value: 85, source: 'guess', confidence: 'medium' };
  assert.ok(validateHouse(h).errors.some((e) => e.includes('northDeg')));
});

test('v unwraps dimension objects', () => {
  assert.equal(v({ value: 2.5, source: 'assumption', confidence: 'low' }), 2.5);
  assert.equal(v(3), 3);
});

test('roomArea uses the shoelace formula', () => {
  assert.equal(roomArea(fixture().rooms[0]), 12);
});

test('deriveWalls merges the shared edge into one interior wall', () => {
  const walls = deriveWalls(fixture()).filter((w) => !w.plot);
  assert.equal(walls.length, 7);
  const interior = walls.filter((w) => !w.exterior);
  assert.equal(interior.length, 1);
  assert.deepEqual([...interior[0].rooms].sort(), ['a', 'b']);
  assert.equal(interior[0].thickness, 0.15);
});

test('openingRect places the door on the shared wall', () => {
  const h = fixture();
  const r = openingRect(h, 'door-ab');
  const wall = deriveWalls(h).find((w) => w.id === r.wallId);
  assert.equal(wall.exterior, false);
  assert.deepEqual(r.a, [4, 1]);
  assert.deepEqual(r.b, [4, 1.9]);
  assert.equal(r.type, 'door');
});

function walk(h, from, to, steps = 40) {
  const walls = deriveWalls(h);
  const openings = h.openings.map((o) => openingRect(h, o.id));
  let p = from;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const want = [p[0] + (to[0] - from[0]) / steps, p[1] + (to[1] - from[1]) / steps];
    p = collide(want, 0.25, walls, openings);
  }
  return p;
}

test('collide lets you walk through a door', () => {
  const p = walk(fixture(), [3, 1.45], [5, 1.45]);
  assert.ok(p[0] > 4.9, `ended at ${p}`);
});

test('collide stops you at a solid wall', () => {
  const p = walk(fixture(), [3, 0.5], [5, 0.5]);
  assert.ok(p[0] <= 4 - 0.25 + 1e-9 && p[0] > 3.5, `ended at ${p}`);
});

test('collide does not let you climb through a window', () => {
  const p = walk(fixture(), [1, 1.5], [-1, 1.5]);
  assert.ok(p[0] >= 0.25 - 1e-9, `ended at ${p}`);
});

test('nearestPhotos sorts by distance', () => {
  assert.deepEqual(nearestPhotos(fixture(), [6.5, 2], 1).map((p) => p.file), ['IMG_2']);
});

test('collide treats the gate as the property edge (not walkable)', () => {
  const h = fixture();
  h.openings.push({ id: 'gate', room: 'a', edge: 3, offset: 0.5, width: 2.0, height: 2.4, sill: 0, type: 'gate', swing: null });
  h.openings = h.openings.filter((o) => o.id !== 'win-a-w');
  const p = walk(h, [1, 1.5], [-1, 1.5]);
  assert.ok(p[0] >= 0.25 - 1e-9, `ended at ${p}`);
});

test('plot and roof are required, and zero-length edges are refused', () => {
  for (const k of ['plot', 'roof']) {
    const h = fixture();
    delete h[k];
    assert.ok(validateHouse(h).errors.some((e) => e.startsWith(k)), k);
  }
  const h = fixture();
  h.rooms[0].polygon.splice(1, 0, [4, 0]);
  assert.ok(validateHouse(h).errors.some((e) => e.includes('rooms[0].polygon') && e.includes('repeated')));
});
