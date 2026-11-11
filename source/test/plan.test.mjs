import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderPlan } from '../src/plan/plan-svg.js';

const h = JSON.parse(readFileSync(new URL('../data/house.json', import.meta.url)));
const ids = (svg, attr) => [...svg.matchAll(new RegExp(`${attr}="([^"]+)"`, 'g'))].map((m) => m[1]);
const HOUSE = ['living', 'kitchen', 'hall', 'bd1', 'wc1', 'ensuite', 'bd2', 'porch'];

test('floor plan shows the house rooms only', () => {
  const svg = renderPlan(h, { mode: 'floor', dims: true, pins: false, selected: null });
  assert.ok(svg.startsWith('<svg'));
  assert.deepEqual([...new Set(ids(svg, 'data-room'))].sort(), [...HOUSE].sort());
  assert.equal(new Set(ids(svg, 'data-opening')).size, 18);
});

test('site plan adds walkways, parking, outside W/C and the gate', () => {
  const svg = renderPlan(h, { mode: 'site', dims: true, pins: false, selected: null });
  const rooms = new Set(ids(svg, 'data-room'));
  for (const r of ['walk-w', 'walk-e', 'walk-n', 'parking', 'owc', ...HOUSE]) assert.ok(rooms.has(r), r);
  const ops = new Set(ids(svg, 'data-opening'));
  assert.equal(ops.size, 21);
  assert.ok(ops.has('gate'));
});

test('every door has a swing arc', () => {
  const svg = renderPlan(h, { mode: 'site', dims: false, pins: false, selected: null });
  const doors = h.openings.filter((o) => o.type === 'door').length;
  assert.equal((svg.match(/class="swing"/g) || []).length, doors);
});

test('pins draw all 68 photos', () => {
  const svg = renderPlan(h, { mode: 'site', dims: false, pins: true, selected: null });
  assert.equal(new Set(ids(svg, 'data-photo')).size, 68);
});

test('north arrow and 2 m scale bar are present', () => {
  const svg = renderPlan(h, { mode: 'floor', dims: true, pins: false, selected: null });
  assert.match(svg, /id="north-arrow"[^>]*rotate\(-82/);
  assert.match(svg, /id="scale-bar"/);
  assert.match(svg, />2 m</);
});

test('labels show clear size and area, styled as estimates', () => {
  const svg = renderPlan(h, { mode: 'floor', dims: true, pins: false, selected: null });
  const bd2 = svg.slice(svg.indexOf('data-room="bd2" class="room label"'));
  assert.match(bd2.slice(0, 1500), /\d+\.\d × \d+\.\d m/);
  assert.match(bd2.slice(0, 1500), /\d+\.\d m²/);
  assert.match(bd2.slice(0, 1500), /class="est"/);
});

test('selected room is highlighted', () => {
  const svg = renderPlan(h, { mode: 'floor', dims: true, pins: false, selected: 'bd1' });
  assert.match(svg, /data-room="bd1"[^>]*class="[^"]*selected/);
});

test('pins with missing or junk headings draw without a cone', () => {
  const hh = structuredClone(h);
  hh.photos = [{ ...h.photos[0], heading: null }, { ...h.photos[1], heading: 'abc' }];
  const svg = renderPlan(hh, { mode: 'site', dims: false, pins: true, selected: null });
  assert.equal(new Set(ids(svg, 'data-photo')).size, 2);
  assert.equal((svg.match(/<g data-photo="[^"]+" class="pin">(?:<title>[^<]*<\/title>)?<path/g) || []).length, 0);
});

test('a negative north angle draws a valid arrow rotation', () => {
  const h2 = structuredClone(h);
  h2.northDeg = { value: -30, source: 'user', confidence: 'high' };
  const svg = renderPlan(h2, { mode: 'floor', dims: false, pins: false, selected: null });
  assert.match(svg, /id="north-arrow"[^>]*rotate\(30\)/);
  assert.doesNotMatch(svg, /rotate\(--/);
});

test('floor plan finds the porch and leaves out outbuildings by layout, not by room id', async () => {
  const { freshHouse, renameRooms, RENAMED } = await import('./helpers.mjs');
  const svg = renderPlan(renameRooms(freshHouse(), RENAMED), { mode: 'floor', dims: true, pins: false, selected: null });
  const rooms = new Set(ids(svg, 'data-room'));
  assert.ok(rooms.has('veranda'), 'porch shown');
  assert.ok(!rooms.has('shed'), 'outside W/C left out');
});
