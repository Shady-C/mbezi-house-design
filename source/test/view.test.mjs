import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { framePlot } from '../src/scene/framing.js';
import { createQualityGovernor, QUALITY_LEVELS } from '../src/scene/quality.js';

const plot = { minX: 0, maxX: 8.6, minY: 0, maxY: 26.6 };

function cornersOnScreen({ fov, aspect, bearing, elevation }) {
  const { position, target } = framePlot(plot, { fov, aspect, bearing, elevation, height: 3, margin: 0.97 });
  const cam = new THREE.PerspectiveCamera(fov, aspect, 0.05, 400);
  cam.position.set(...position);
  cam.lookAt(new THREE.Vector3(...target));
  cam.updateMatrixWorld();
  const pts = [];
  for (const x of [plot.minX, plot.maxX]) for (const y of [plot.minY, plot.maxY]) for (const z of [0, 3]) pts.push(new THREE.Vector3(x, z, -y));
  return pts.map((p) => p.clone().project(cam));
}

for (const [label, aspect] of [['wide screen', 16 / 9], ['phone portrait', 390 / 600]]) {
  for (const [view, bearing, elevation] of [['dollhouse', 115, 0.95], ['orbit', 215, 0.55]]) {
    test(`${view} view shows the whole plot on a ${label}`, () => {
      for (const p of cornersOnScreen({ fov: 50, aspect, bearing, elevation }))
        assert.ok(Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z < 1, `corner off screen: ${p.x.toFixed(2)}, ${p.y.toFixed(2)}`);
    });
  }
}

test('framing is not wastefully far: the plot fills a good part of the view', () => {
  const xs = cornersOnScreen({ fov: 50, aspect: 16 / 9, bearing: 115, elevation: 0.95 });
  const spanX = Math.max(...xs.map((p) => p.x)) - Math.min(...xs.map((p) => p.x));
  const spanY = Math.max(...xs.map((p) => p.y)) - Math.min(...xs.map((p) => p.y));
  assert.ok(Math.max(spanX, spanY) > 1.6, `uses ${Math.max(spanX, spanY).toFixed(2)} of 2`);
});

test('steady slow frames lower the 3D quality one step at a time', () => {
  const q = createQualityGovernor();
  assert.equal(q.level, 0);
  for (let i = 0; i < 40; i++) q.sample(70);
  assert.equal(q.level, 1);
  for (let i = 0; i < 40; i++) q.sample(70);
  assert.equal(q.level, 2);
});

test('a brief stutter does not lower quality', () => {
  const q = createQualityGovernor();
  for (let i = 0; i < 100; i++) q.sample(i % 10 === 0 ? 200 : 16);
  assert.equal(q.level, 0);
});

test('quality never drops below the last level and every level is usable', () => {
  const q = createQualityGovernor();
  for (let i = 0; i < 1000; i++) q.sample(500);
  assert.equal(q.level, QUALITY_LEVELS.length - 1);
  for (const l of QUALITY_LEVELS) assert.ok(l.pixelRatio > 0 && typeof l.shadows === 'boolean');
});
