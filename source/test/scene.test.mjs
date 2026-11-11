import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { buildHouse } from '../src/scene/build-scene.js';
import { openingRect, v } from '../src/model/geometry.js';

const h = JSON.parse(readFileSync(new URL('../data/house.json', import.meta.url)));
const names = (g) => g.children.map((c) => c.name);
const full = () => buildHouse(THREE, h, { roof: true, ceilings: true, cutHeight: null });

test('all 12 windows are in the model', () => {
  assert.equal(names(full()).filter((n) => n.startsWith('opening:win-')).length, 12);
});

test('model stays inside the plot plus roof overhang', () => {
  const box = new THREE.Box3().setFromObject(full());
  const m = v(h.roof.overhang) + 0.3;
  assert.ok(box.min.x >= -m && box.max.x <= 8.6 + m, `x ${box.min.x}..${box.max.x}`);
  assert.ok(box.min.z >= -26.6 - m && box.max.z <= m, `z ${box.min.z}..${box.max.z}`);
  assert.ok(box.min.y >= -0.01);
});

test('roof and ceilings can be switched off', () => {
  const g = buildHouse(THREE, h, { roof: false, ceilings: false, cutHeight: null });
  assert.ok(!names(g).includes('roof'));
  assert.ok(!names(g).some((n) => n.startsWith('ceiling:')));
  assert.ok(names(full()).includes('roof'));
  assert.ok(names(full()).some((n) => n.startsWith('ceiling:')));
});

test('cut height trims every wall', () => {
  const g = buildHouse(THREE, h, { roof: false, ceilings: false, cutHeight: 1.2 });
  for (const c of g.children.filter((c) => c.name.startsWith('wall:'))) {
    const b = new THREE.Box3().setFromObject(c);
    assert.ok(b.max.y <= 1.2 + 1e-6, `${c.name} ${b.max.y}`);
  }
});

test('door openings are real holes in the wall', () => {
  const g = full();
  g.updateMatrixWorld(true);
  const walls = g.children.filter((c) => c.name.startsWith('wall:'));
  const r = openingRect(h, 'door-bd1');
  const midY = (r.a[1] + r.b[1]) / 2;
  const cast = (planY) => {
    const ray = new THREE.Raycaster(new THREE.Vector3(5.5, 1.0, -planY), new THREE.Vector3(1, 0, 0), 0, 1.2);
    return ray.intersectObjects(walls, true).length;
  };
  assert.equal(cast(midY), 0);
  assert.ok(cast(Math.min(r.a[1], r.b[1]) - 0.5) > 0);
});

test('open gate panel is parked inside the compound', () => {
  const g = full().children.find((c) => c.name === 'opening:gate');
  const b = new THREE.Box3().setFromObject(g);
  assert.ok(b.min.x > 0, `gate min x ${b.min.x}`);
});

test('compound wall has a real gap at the gate', () => {
  const g = full();
  g.updateMatrixWorld(true);
  const pw = g.children.filter((c) => c.name === 'plot-wall');
  const r = openingRect(h, 'gate');
  const midY = (r.a[1] + r.b[1]) / 2;
  const ray = new THREE.Raycaster(new THREE.Vector3(-1, 1.0, -midY), new THREE.Vector3(1, 0, 0), 0, 1.5);
  assert.equal(ray.intersectObjects(pw, true).length, 0);
});

test('exterior walls show the interior colour on the inside face', () => {
  const g = full();
  g.updateMatrixWorld(true);
  const walls = g.children.filter((c) => c.name.startsWith('wall:'));
  // From the middle of BD 1 look west at its exterior wall (x = 2.3) at 2.6 m (above the window).
  const ray = new THREE.Raycaster(new THREE.Vector3(4.0, 2.6, -14.0), new THREE.Vector3(-1, 0, 0), 0, 3);
  const hit = ray.intersectObjects(walls, true)[0];
  assert.ok(hit, 'no wall hit');
  const m = Array.isArray(hit.object.material) ? hit.object.material[hit.face.materialIndex] : hit.object.material;
  assert.equal(m.color.getHex(), 0xf4f3ef);
});

test('compound wall stands outside the plot line (inner face on the line)', () => {
  const g = full();
  g.updateMatrixWorld(true);
  const pw = g.children.filter((c) => c.name === 'plot-wall');
  const ray = new THREE.Raycaster(new THREE.Vector3(1.0, 1.0, -1.5), new THREE.Vector3(-1, 0, 0), 0, 3);
  const hit = ray.intersectObjects(pw, true)[0];
  assert.ok(hit && hit.distance >= 0.94, `hit at ${hit && hit.distance}`);
});

test('porch floor, outside W/C slab and bathroom doors are found by layout, not by room id', async () => {
  const { freshHouse, renameRooms, RENAMED } = await import('./helpers.mjs');
  const g = buildHouse(THREE, renameRooms(freshHouse(), RENAMED), { roof: true, ceilings: true, cutHeight: null });
  const byName = (n) => g.children.find((c) => c.name === n);
  assert.equal(byName('floor:veranda').position.y, 0.015);
  assert.ok(byName('slab:shed'), 'outside W/C slab');
  const door = (id) => byName(`opening:${id}`);
  const colours = (id) => new Set(door(id).children.flatMap((m) => [m.material].flat()).map((m) => m.color.getHex()));
  const orig = full();
  const origColours = (id) => new Set(orig.children.find((c) => c.name === `opening:${id}`).children.flatMap((m) => [m.material].flat()).map((m) => m.color.getHex()));
  for (const o of h.openings.filter((o) => o.type === 'door')) assert.deepEqual(colours(o.id), origColours(o.id), o.id);
});
