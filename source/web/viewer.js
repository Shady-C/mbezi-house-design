// three.js viewer: orbit, dollhouse and first-person walk over the house model.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildHouse } from './src/scene/build-scene.js';
import { deriveWalls, openingRect, collide, bbox, v } from './src/model/geometry.js';

const EYE = 1.6, RADIUS = 0.25, SPEED = 1.4, TURN = 1.8;
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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
  let center = new THREE.Vector3(), span = 20;

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

  function rebuild() {
    if (model) { scene.remove(model); model.traverse((o) => o.geometry && o.geometry.dispose()); }
    const opts = mode === 'dollhouse' ? { roof: false, ceilings: false, cutHeight: cut ? 1.2 : null }
      : mode === 'walk' ? { roof: true, ceilings: true, cutHeight: null } : { roof: true, ceilings: false, cutHeight: null };
    model = buildHouse(THREE, h, opts);
    model.traverse((o) => { if (o.isMesh) { o.castShadow = !o.material.transparent; o.receiveShadow = true; } });
    scene.add(model);
    walls = deriveWalls(h);
    gaps = h.openings.map((o) => openingRect(h, o.id, walls));
    const b = bbox(h.plot ? h.plot.polygon : h.rooms.flatMap((r) => r.polygon));
    center = toThree((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
    span = Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.75;
    placeSun();
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
  }

  function presetOrbit(fromBearing = 215, elev = 0.55, dist = 1.15) {
    const [dx, dy] = dirOf(fromBearing);
    const r = span * 1.3 * dist;
    camera.position.set(center.x + dx * r * Math.cos(elev), r * Math.sin(elev), center.z - dy * r * Math.cos(elev));
    controls.target.copy(center);
    controls.update();
  }

  function setMode(m) {
    mode = m;
    controls.enabled = m !== 'walk';
    camera.fov = m === 'walk' ? 75 : 50;
    camera.updateProjectionMatrix();
    rebuild();
    if (m === 'walk') { spawnAtGate(); applyPose(); }
    else if (m === 'dollhouse') presetOrbit(150, 0.85, 0.75);
    else presetOrbit();
  }

  function step(dt) {
    pose.bearing = (pose.bearing + input.turn * TURN * (180 / Math.PI) * dt + 360) % 360;
    const [fx, fy] = dirOf(pose.bearing);
    const mx = (fx * input.forward + fy * input.strafe) * SPEED * dt;
    const my = (fy * input.forward - fx * input.strafe) * SPEED * dt;
    const n = Math.max(1, Math.ceil(Math.hypot(mx, my) / 0.05));
    for (let i = 0; i < n; i++) pose.p = collide([pose.p[0] + mx / n, pose.p[1] + my / n], RADIUS, walls, gaps);
  }

  function resize(w, hgt) {
    const cw = w || canvas.clientWidth || 800, ch = hgt || canvas.clientHeight || 500;
    renderer.setSize(cw, ch, false);
    camera.aspect = cw / ch;
    camera.updateProjectionMatrix();
  }

  let last = performance.now(), raf = 0, running = true;
  function loop(t) {
    if (!running) return;
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (mode === 'walk') { step(dt); applyPose(); } else controls.update();
    if (canvas.clientWidth && (canvas.width !== Math.round(canvas.clientWidth * renderer.getPixelRatio()))) resize();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  }

  const VIEWS = {
    aerial: () => { setModeQuiet('orbit'); presetOrbit(215, 0.6, 1.0); },
    dollhouse: () => { setModeQuiet('dollhouse'); presetOrbit(150, 0.9, 0.7); },
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
  presetOrbit();
  resize();
  raf = requestAnimationFrame(loop);

  return {
    THREE, input,
    get mode() { return mode; },
    get house() { return h; },
    setMode,
    setCut(on) { cut = on; if (mode === 'dollhouse') rebuild(); },
    setHouse(next) { h = next; const keep = mode === 'walk' ? { ...pose } : null; rebuild(); if (keep) { pose = keep; applyPose(); } },
    getPlanPosition() { return mode === 'walk' ? [...pose.p] : [controls.target.x, -controls.target.z]; },
    setPose(p, bearing, pitch = 0) { pose = { p: [...p], bearing, pitch }; applyPose(); },
    look(dBearing, dPitch) {
      pose.bearing = (pose.bearing + dBearing + 360) % 360;
      pose.pitch = Math.max(-1.2, Math.min(1.2, pose.pitch + dPitch));
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
      running = false; cancelAnimationFrame(raf);
      if (width && height) resize(width, height);
      if (typeof name === 'string') {
        if (!VIEWS[name]) throw new Error(`unknown view ${name}`);
        VIEWS[name]();
      } else this.viewFromPhoto(name);
      if (width && height) resize(width, height);
      if (mode === 'walk') applyPose(); else controls.update();
      renderer.render(scene, camera);
      const url = canvas.toDataURL('image/png');
      if (prev.mode !== mode) setMode(prev.mode);
      if (prev.mode === 'walk') { pose = prev.pose; camera.fov = 75; applyPose(); }
      resize();
      running = true; last = performance.now(); raf = requestAnimationFrame(loop);
      return url;
    },
    exportGLB() {
      const m = buildHouse(THREE, h, { roof: true, ceilings: true, cutHeight: null });
      return new GLTFExporter().parseAsync(m, { binary: true });
    },
    resize,
    dispose() { running = false; cancelAnimationFrame(raf); controls.dispose(); renderer.dispose(); },
  };
}
