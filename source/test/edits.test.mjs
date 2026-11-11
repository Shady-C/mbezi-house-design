import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyEdit, importHouse, wallBetween, sideWall } from '../src/editor/edits.js';
import { roomArea, openingRect, v, distToPolygon, bbox } from '../src/model/geometry.js';

const text = readFileSync(new URL('../data/house.json', import.meta.url), 'utf8');
const fresh = () => JSON.parse(text);
const area = (h, id) => roomArea(h.rooms.find((r) => r.id === id));

test('moving a shared wall trades area between the two rooms and leaves the original alone', () => {
  const h = fresh();
  const before = structuredClone(h);
  const { house, errors } = applyEdit(h, { kind: 'moveWall', wallId: wallBetween(h, 'ensuite', 'wc1'), delta: 0.2 });
  assert.deepEqual(errors, []);
  const gain = area(house, 'ensuite') - area(h, 'ensuite');
  const loss = area(h, 'wc1') - area(house, 'wc1');
  assert.ok(gain > 0.4);
  assert.ok(Math.abs(gain - loss) < 1e-9);
  assert.deepEqual(h, before);
});

test('a move that would crush a room is rejected and nothing changes', () => {
  const h = fresh();
  const { house, errors } = applyEdit(h, { kind: 'moveWall', wallId: wallBetween(h, 'ensuite', 'wc1'), delta: 1.5 });
  assert.ok(errors.length > 0);
  assert.ok(errors.some((e) => /W\/C 1/.test(e)), errors.join('; '));
  assert.equal(house, h);
});

test('a window wider than its wall is rejected', () => {
  const h = fresh();
  const { house, errors } = applyEdit(h, { kind: 'opening', id: 'win-bd1-w', width: 99 });
  assert.ok(errors.some((e) => e.includes('wider than wall')), errors.join('; '));
  assert.equal(house, h);
});

test('edited values are marked as user measurements', () => {
  const { house, errors } = applyEdit(fresh(), { kind: 'opening', id: 'win-bd1-w', width: 1.2 });
  assert.deepEqual(errors, []);
  const o = house.openings.find((x) => x.id === 'win-bd1-w');
  assert.deepEqual(o.width, { value: 1.2, source: 'user', confidence: 'high' });
  const c = applyEdit(fresh(), { kind: 'ceiling', roomId: 'bd1', height: 2.8 });
  assert.equal(c.house.rooms.find((r) => r.id === 'bd1').ceiling.height.source, 'user');
});

test('archways shrink to fit when the wall they sit in gets shorter', () => {
  const h = fresh();
  const wall = sideWall(h, 'bd1', 'east');
  const { house, errors } = applyEdit(h, { kind: 'moveWall', wallId: wall, delta: 0.3 });
  assert.deepEqual(errors, []);
  const r = openingRect(house, 'open-hall');
  assert.ok(r.a[0] >= 6.35 - 1e-6 && r.b[0] <= 7.5 + 1e-6, `${r.a} ${r.b}`);
});

test('door that follows its wall stays on the wall after a move', () => {
  const h = fresh();
  const { house, errors } = applyEdit(h, { kind: 'moveWall', wallId: sideWall(h, 'bd1', 'north'), delta: 0.3 });
  assert.deepEqual(errors, []);
  assert.ok(openingRect(house, 'door-bd1').wallId);
  assert.ok(area(house, 'bd1') > area(h, 'bd1'));
  assert.ok(area(house, 'living') < area(h, 'living'));
});

test('importHouse reports bad JSON', () => {
  const r = importHouse('{bad');
  assert.equal(r.house, null);
  assert.ok(r.errors.some((e) => e.includes('JSON')));
});

test('importHouse reports a house with no rooms', () => {
  const h = fresh();
  delete h.rooms;
  const r = importHouse(JSON.stringify(h));
  assert.equal(r.house, null);
  assert.ok(r.errors.some((e) => e.includes('rooms')));
});

test('importHouse accepts the real file', () => {
  const r = importHouse(text);
  assert.deepEqual(r.errors, []);
  assert.equal(v(r.house.northDeg), 82);
});

const room = (h, id) => h.rooms.find((r) => r.id === id);

test('openings must have a real size', () => {
  for (const k of ['width', 'height']) {
    const { errors } = applyEdit(fresh(), { kind: 'opening', id: 'win-bd1-w', [k]: 0 });
    assert.ok(errors.length, k);
  }
});

test('a door cannot straddle two walls', () => {
  const { errors } = applyEdit(fresh(), { kind: 'opening', id: 'door-bd1', offset: 3.5 });
  assert.ok(errors.some((e) => e.includes('door-bd1')), errors.join('; '));
});

test('a door cannot be widened across a partition', () => {
  const { errors } = applyEdit(fresh(), { kind: 'opening', id: 'door-bd1', width: 5.0 });
  assert.ok(errors.length);
});

test('openings on the same wall cannot overlap', () => {
  const { errors } = applyEdit(fresh(), { kind: 'opening', id: 'win-living-w', offset: 0.4 });
  assert.ok(errors.some((e) => e.includes('overlap')), errors.join('; '));
});

test('shrinking the kitchen from the back is allowed', () => {
  const h = fresh();
  const { errors } = applyEdit(h, { kind: 'moveWall', wallId: sideWall(h, 'kitchen', 'north'), delta: -0.2 });
  assert.deepEqual(errors, []);
});

test('widening a west-side room by 0.5 m is allowed', () => {
  const h = fresh();
  const { errors } = applyEdit(h, { kind: 'moveWall', wallId: sideWall(h, 'bd1', 'west'), delta: -0.5 });
  assert.deepEqual(errors, []);
});

test('narrowing from the west keeps the en-suite door on an en-suite wall', () => {
  const h = fresh();
  const { house, errors } = applyEdit(h, { kind: 'moveWall', wallId: sideWall(h, 'ensuite', 'west'), delta: 0.6 });
  assert.deepEqual(errors, []);
  const r = openingRect(house, 'door-ensuite');
  const e = bbox(room(house, 'ensuite').polygon);
  assert.ok(r.a[0] >= e.minX - 1e-6 && r.b[0] <= e.maxX + 1e-6, `${r.a} ${r.b}`);
});

test('fittings and photo pins move with the wall', () => {
  const h = fresh();
  const { house, errors } = applyEdit(h, { kind: 'moveWall', wallId: sideWall(h, 'bd1', 'west'), delta: 0.5 });
  assert.deepEqual(errors, []);
  for (const f of house.fixtures.filter((f) => room(house, f.room).kind === 'indoor'))
    assert.equal(distToPolygon([f.x, f.y], room(house, f.room).polygon), 0, f.id);
  for (const p of house.photos) assert.ok(distToPolygon([p.x, p.y], room(house, p.room).polygon) <= 0.3, p.file);
  const k = applyEdit(h, { kind: 'moveWall', wallId: sideWall(h, 'kitchen', 'north'), delta: 0.5 }).house;
  const c = k.fixtures.find((f) => f.id === 'counter-n');
  assert.ok(bbox(room(k, 'kitchen').polygon).maxY - c.y < 0.45);
});

test('the house can be moved within the plot (parking depth, west walkway)', () => {
  const h = fresh();
  const { house, errors } = applyEdit(h, { kind: 'moveHouse', dx: -0.3, dy: 0.5 });
  assert.deepEqual(errors, []);
  assert.ok(Math.abs(bbox(room(house, 'bd2').polygon).minY - 7.6) < 1e-6);
  assert.ok(Math.abs(bbox(room(house, 'parking').polygon).maxY - 7.6) < 1e-6);
  assert.ok(Math.abs(bbox(room(house, 'bd2').polygon).minX - 2.0) < 1e-6);
  const f = house.fixtures.find((x) => x.id === 'fan-bd2');
  assert.ok(Math.abs(f.y - 9.7) < 1e-6 && Math.abs(f.x - 4.6) < 1e-6);
  assert.ok(Math.abs(roomArea(room(house, 'bd2')) - roomArea(room(h, 'bd2'))) < 1e-9);
});

test('changing the plot depth moves the outside W/C instead of stretching it', () => {
  for (const d of [1, -1]) {
    const h = fresh();
    const { house, errors } = applyEdit(h, { kind: 'moveWall', wallId: 'plot:2', delta: d });
    assert.deepEqual(errors, [], `delta ${d}`);
    const o = bbox(room(house, 'owc').polygon);
    assert.ok(Math.abs(o.maxY - o.minY - 1.6) < 1e-6, `owc depth ${o.maxY - o.minY}`);
    assert.ok(Math.abs(o.maxY - bbox(house.plot.polygon).maxY) < 1e-6);
  }
});

test('the room you resize becomes your measurement; rooms resized as a side effect keep their confidence', () => {
  const h = fresh();
  const { house, errors } = applyEdit(h, { kind: 'moveWall', wallId: sideWall(h, 'bd1', 'north'), delta: 0.3, roomId: 'bd1' });
  assert.deepEqual(errors, []);
  assert.equal(room(house, 'bd1').estimate.confidence, 'high');
  assert.equal(room(house, 'bd1').estimate.source, 'user');
  const others = house.rooms.filter((r) => r.id !== 'bd1' && r.estimate?.edited);
  assert.ok(others.length > 0, 'a neighbour was resized');
  for (const r of others) assert.equal(r.estimate.confidence, room(h, r.id).estimate.confidence, r.id);
});

test('openings moved or shrunk automatically are marked adjusted, not as your measurement', () => {
  const h = fresh();
  const { house, errors } = applyEdit(h, { kind: 'moveWall', wallId: sideWall(h, 'bd1', 'east'), delta: 0.3 });
  assert.deepEqual(errors, []);
  const arch = house.openings.find((o) => o.id === 'open-hall');
  assert.ok(v(arch.width) < v(h.openings.find((o) => o.id === 'open-hall').width), 'archway shrank');
  assert.equal(arch.width.source, 'adjusted');
  assert.equal(arch.width.confidence, 'low');

  const h2 = fresh();
  const r2 = applyEdit(h2, { kind: 'moveWall', wallId: sideWall(h2, 'ensuite', 'west'), delta: 0.6 });
  assert.deepEqual(r2.errors, []);
  const before = h2.openings.find((o) => o.id === 'door-ensuite'), after = r2.house.openings.find((o) => o.id === 'door-ensuite');
  assert.notEqual(v(after.offset), v(before.offset), 'door slid');
  assert.equal(after.offset.source, 'adjusted');
  assert.equal(after.offset.confidence, before.offset.confidence);
});

test('walkways and parking follow the house even when the rooms have other ids', async () => {
  const { renameRooms, RENAMED } = await import('./helpers.mjs');
  const h = renameRooms(fresh(), RENAMED);
  const { house, errors } = applyEdit(h, { kind: 'moveHouse', dx: 0, dy: 0.5 });
  assert.deepEqual(errors, []);
  assert.ok(Math.abs(bbox(room(house, 'yard').polygon).maxY - 7.6) < 1e-6);
  const tooFar = applyEdit(h, { kind: 'moveHouse', dx: -5, dy: 0 });
  assert.ok(tooFar.errors.some((e) => /West walkway would be narrower than/.test(e)), tooFar.errors.join('; '));
});
