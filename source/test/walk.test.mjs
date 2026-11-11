import { test } from 'node:test';
import assert from 'node:assert/strict';
import { walkStep, MAX_DT } from '../src/model/walk.js';
import { deriveWalls, openingRect } from '../src/model/geometry.js';
import { freshHouse } from './helpers.mjs';

const h = freshHouse();
const walls = deriveWalls(h);
const gaps = h.openings.map((o) => openingRect(h, o.id, walls));
const open = { p: [4.3, 3.0], bearing: 0, pitch: 0 }; // parking, plenty of room
const dist = (a, b) => Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]);

test('a slow frame moves you as far as several fast ones', () => {
  let fast = structuredClone(open);
  for (let i = 0; i < 12; i++) fast = walkStep(fast, { forward: 1, strafe: 0, turn: 0 }, 1 / 60, walls, gaps);
  const slow = walkStep(structuredClone(open), { forward: 1, strafe: 0, turn: 0 }, 12 / 60, walls, gaps);
  assert.ok(dist(fast, open) > 0.25, `moved ${dist(fast, open)}`);
  assert.ok(Math.abs(dist(slow, open) - dist(fast, open)) < 1e-6, `${dist(slow, open)} vs ${dist(fast, open)}`);
});

test('a very long pause (tab switched away) is capped', () => {
  const p = walkStep(structuredClone(open), { forward: 1, strafe: 0, turn: 0 }, 5, walls, gaps);
  assert.ok(dist(p, open) <= 1.4 * MAX_DT + 1e-9);
});

test('a big step still cannot pass through a wall', () => {
  const start = { p: [1.0, 3.0], bearing: 270, pitch: 0 }; // facing the west compound wall
  const p = walkStep(start, { forward: 1, strafe: 0, turn: 0 }, MAX_DT, walls, gaps);
  assert.ok(p.p[0] > 0.2, `x ${p.p[0]}`);
});

test('walkStep does not change the pose it was given', () => {
  const start = structuredClone(open);
  walkStep(start, { forward: 1, strafe: 1, turn: 1 }, 0.1, walls, gaps);
  assert.deepEqual(start, open);
});
