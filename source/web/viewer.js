// three.js viewer: orbit, dollhouse and first-person walk over the house model.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildHouse } from './src/scene/build-scene.js';
import { deriveWalls, openingRect, bbox, v } from './src/model/geometry.js';
import { walkStep } from './src/model/walk.js';
import { framePlot } from './src/scene/framing.js';
import { createQualityGovernor } from './src/scene/quality.js';

const EYE = 1.6;
const SKY = 0xdde8f0;

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

// plan (x, y) -> three (x, 0, -y); bearing 0 = +y (back of house), clockwise.
const toThree = (x, y, h = 0) => new THREE.Vector3(x, h, -y);
const dirOf = (bearing) => { const b = (bearing * Math.PI) / 180; return [Math.sin(b), Math.cos(b)]; };

export function createViewer(canvas, house) {
  if (!webglAvailable()) throw new Error('WebGL unavailable');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  const quality = createQualityGovernor();
  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, quality.settings.pixelRatio);
  renderer.setPixelRatio(pixelRatio());
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 400);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8d8471, 1.7);
  scene.add(hemi, new THREE.AmbientLight(0xffffff, 0.9));
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;

  let h = house, mode = 'orbit', cut = false, model = null, walls = [], gaps = [];
  let pose = { p: [1, 4.5], bearing: 0, pitch: 0 };
  const input = { forward: 0, strafe: 0, turn: 0 };
  let center = new THREE.Vector3(), span = 20, plotBox = { minX: 0, maxX: 10, minY: 0, maxY: 10 };
  // Drawing happens only when something changed (dirty), and only while the 3D tab is showing (active).
  let dirty = true, active = true, busy = false, renders = 0, lastDrawn = 0;
  const invalidate = () => { dirty = true; };

  function placeSun() {
    // Dar es Salaam (−6.7°), mid-November afternoon: compass azimuth ≈ 250°, elevation ≈ 40°.
    const b = 250 - (v(h.northDeg) || 0), el = (40 * Math.PI) / 180;
    const [dx, dy] = dirOf(b);
    sun.position.copy(center).add(new THREE.Vector3(dx * Math.cos(el), Math.sin(el), -dy * Math.cos(el)).multiplyScalar(40));
    sun.target.position.copy(center);
    const s = sun.shadow.camera;
    s.left = s.bottom = -span; s.right = s.top = span; s.near = 1; s.far = 120;
    s.updateProjectionMatrix();
  }

  function disposeModel() {
    if (!model) return;
    scene.remove(model);
    const mats = new Set();
    model.traverse((o) => { o.geometry?.dispose(); for (const m of [o.material].flat()) if (m) mats.add(m); });
    for (const m of mats) m.dispose();
  }

  function applyQuality() {
    const s = quality.settings;
    renderer.setPixelRatio(pixelRatio());
    if (renderer.shadowMap.enabled !== s.shadows) {
      renderer.shadowMap.enabled = s.shadows;
      scene.traverse((o) => { for (const m of [o.material].flat()) if (m) m.needsUpdate = true; });
    }
    resize();
  }

  function rebuild() {
    disposeModel();
    const opts = mode === 'dollhouse' ? { roof: false, ceilings: false, cutHeight: cut ? 1.2 : null }
      : mode === 'walk' ? { roof: true, ceilings: true, cutHeight: null } : { roof: true, ceilings: false, cutHeight: null };
    model = buildHouse(THREE, h, opts);
    model.traverse((o) => { if (o.isMesh) { o.castShadow = !o.material.transparent; o.receiveShadow = true; } });
    scene.add(model);
    walls = deriveWalls(h);
    gaps = h.openings.map((o) => openingRect(h, o.id, walls));
    const b = bbox(h.plot ? h.plot.polygon : h.rooms.flatMap((r) => r.polygon));
    plotBox = b;
    center = toThree((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
    span = Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.75;
    placeSun();
    invalidate();
  }

  function spawnAtGate() {
    const g = h.openings.find((o) => o.type === 'gate');
    if (!g) { pose = { p: [1, 1], bearing: 0, pitch: 0 }; return; }
    const r = openingRect(h, g.id, walls);
    const mid = [(r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2];
    const dx = r.b[0] - r.a[0], dy = r.b[1] - r.a[1], L = Math.hypot(dx, dy);
    let n = [-dy / L, dx / L];
    const pb = bbox(h.plot.polygon);
    const test = [mid[0] + n[0], mid[1] + n[1]];
    if (test[0] < pb.minX || test[0] > pb.maxX || test[1] < pb.minY || test[1] > pb.maxY) n = [-n[0], -n[1]];
    pose = { p: [mid[0] + n[0] * 1.0, mid[1] + n[1] * 1.0], bearing: 0, pitch: 0 };
  }

  function applyPose() {
    const [dx, dy] = dirOf(pose.bearing);
    camera.position.copy(toThree(pose.p[0], pose.p[1], EYE));
    const look = toThree(pose.p[0] + dx, pose.p[1] + dy, EYE + Math.tan(pose.pitch));
    camera.lookAt(look);
    invalidate();
  }

  // Closest view from this bearing and elevation that shows the whole plot.
  function presetOrbit(fromBearing = 215, elev = 0.55) {
    const { position, target } = framePlot(plotBox, { fov: camera.fov, aspect: camera.aspect, bearing: fromBearing, elevation: elev, height: 3, margin: 0.97 });
    camera.position.set(...position);
    controls.target.set(...target);
    controls.update();
    invalidate();
  }

  function setMode(m) {
    mode = m;
    controls.enabled = m !== 'walk';
    camera.fov = m === 'walk' ? 75 : 50;
    camera.updateProjectionMatrix();
    rebuild();
    if (m === 'walk') { spawnAtGate(); applyPose(); }
    else if (m === 'dollhouse') presetOrbit(115, 0.95);
    else presetOrbit();
  }

  function step(dt) { pose = walkStep(pose, input, dt, walls, gaps); }
  const moving = () => input.forward || input.strafe || input.turn;

  function resize(w, hgt) {
    const cw = w || canvas.clientWidth || 800, ch = hgt || canvas.clientHeight || 500;
    renderer.setSize(cw, ch, false);
    camera.aspect = cw / ch;
    camera.updateProjectionMatrix();
    invalidate();
  }

  let last = performance.now(), raf = 0;
  function draw() {
    renderer.render(scene, camera);
    renders++;
  }
  function loop(t) {
    raf = 0;
    if (!active || busy) return;
    const dt = (t - last) / 1000;
    last = t;
    if (mode === 'walk') { if (moving()) { step(dt); applyPose(); } } else if (controls.update()) invalidate();
    if (canvas.clientWidth && (canvas.width !== Math.round(canvas.clientWidth * renderer.getPixelRatio()))) resize();
    if (dirty) {
      dirty = false;
      draw();
      // Judge speed only across back-to-back drawn frames (idle gaps aren't slowness).
      if (lastDrawn && t - lastDrawn < 1000 && quality.sample(t - lastDrawn)) applyQuality();
      lastDrawn = t;
    } else lastDrawn = 0;
    raf = requestAnimationFrame(loop);
  }
  function start() { if (!raf && active && !busy) { last = performance.now(); lastDrawn = 0; raf = requestAnimationFrame(loop); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  const VIEWS = {
    aerial: () => { setModeQuiet('orbit'); presetOrbit(215, 0.6); },
    dollhouse: () => { setModeQuiet('dollhouse'); presetOrbit(115, 0.95); },
    living: () => walkView([6.7, 17.6], 320, -0.08),
    kitchen: () => walkView([5.6, 21.0], 345, -0.1),
    bd2: () => walkView([2.8, 7.5], 40, -0.08),
    'front-yard': () => walkView([6.8, 1.2], 330, 0.05),
  };
  function setModeQuiet(m) { if (mode !== m) setMode(m); }
  function walkView(p, bearing, pitch) {
    setModeQuiet('walk');
    pose = { p, bearing, pitch };
    applyPose();
  }

  rebuild();
  resize();
  presetOrbit();
  controls.addEventListener('change', invalidate);
  start();

  return {
    THREE, input,
    get mode() { return mode; },
    get house() { return h; },
    get renders() { return renders; },
    get quality() { return quality.level; },
    // Pause drawing while the 3D tab is hidden.
    setActive(on) { active = on; if (on) { invalidate(); start(); } else stop(); },
    getPose() { return { p: [...pose.p], bearing: pose.bearing, pitch: pose.pitch }; },
    setMode,
    setCut(on) { cut = on; if (mode === 'dollhouse') rebuild(); },
    setHouse(next) { h = next; const keep = mode === 'walk' ? { ...pose } : null; rebuild(); if (keep) { pose = keep; applyPose(); } },
    getPlanPosition() { return mode === 'walk' ? [...pose.p] : [controls.target.x, -controls.target.z]; },
    setPose(p, bearing, pitch = 0) { pose = { p: [...p], bearing, pitch }; applyPose(); },
    look(dBearing, dPitch) {
      pose.bearing = (pose.bearing + dBearing + 360) % 360;
      pose.pitch = Math.max(-1.2, Math.min(1.2, pose.pitch + dPitch));
      if (mode === 'walk') applyPose();
    },
    simulate(seconds, inp) {
      const saved = { ...input };
      Object.assign(input, { forward: 0, strafe: 0, turn: 0 }, inp);
      for (let t = 0; t < seconds; t += 1 / 60) step(1 / 60);
      Object.assign(input, saved);
      applyPose();
    },
    viewFromPhoto(photo, hfov = 100) {
      setModeQuiet('walk');
      const vf = 2 * Math.atan(Math.tan((hfov * Math.PI) / 360) / camera.aspect) * (180 / Math.PI);
      camera.fov = vf; camera.updateProjectionMatrix();
      pose = { p: [photo.x, photo.y], bearing: photo.heading ?? 0, pitch: 0 };
      applyPose();
    },
    async renderView(name, { width, height } = {}) {
      const prev = { w: canvas.clientWidth, h: canvas.clientHeight, mode, pose: { ...pose } };
      busy = true; stop();
      if (width && height) resize(width, height);
      if (typeof name === 'string') {
        if (!VIEWS[name]) throw new Error(`unknown view ${name}`);
        VIEWS[name]();
      } else this.viewFromPhoto(name);
      if (width && height) resize(width, height);
      if (mode === 'walk') applyPose(); else controls.update();
      draw();
      const url = canvas.toDataURL('image/png');
      if (prev.mode !== mode) setMode(prev.mode);
      if (prev.mode === 'walk') { pose = prev.pose; camera.fov = 75; applyPose(); }
      resize();
      busy = false; start();
      return url;
    },
    exportGLB() {
      const m = buildHouse(THREE, h, { roof: true, ceilings: true, cutHeight: null });
      return new GLTFExporter().parseAsync(m, { binary: true });
    },
    resize,
    dispose() { active = false; stop(); disposeModel(); controls.dispose(); renderer.dispose(); },
  };
}
