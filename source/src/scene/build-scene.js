// Builds a three.js Group for the house. THREE is passed in so this runs in Node and the browser.
// Plan (x, y) maps to three (x, 0, -y); y-up.
import { v, bbox, deriveWalls, openingRect, solidSegments, pointInPolygon, edgeOf } from '../model/geometry.js';

const COLORS = {
  interior: 0xf4f3ef, exterior: 0xc9d3da, skirting: 0x1f1f1f, plot: 0xd9d3a8, pilaster: 0xf2f2ee,
  'wood-look': 0xcfc6b8, 'white-diagonal': 0xeeeeea, 'bath-pattern': 0xb8aa98, pavers: 0xa89a88, 'porch-tile': 0xd6d0c6,
  ceiling: 0xfafaf8, trim: 0x2a2522, roof: 0x5a5f66, soffit: 0xeeeeee, glass: 0x9fc4dd, frame: 0x3a2e26,
  doorDark: 0x3b2a22, doorWood: 0x9a5b2e, doorAlu: 0xdedede, gate: 0x6e7378,
  counter: 0x6b3a26, cabinet: 0x7a4330, porcelain: 0xffffff, ac: 0xf4f4f4, tank: 0x1c1c1c, shower: 0xc8ccd0,
};

export function buildHouse(THREE, h, { roof = true, ceilings = true, cutHeight = null } = {}) {
  const mats = new Map();
  const mat = (key, extra = {}) => {
    const k = key + JSON.stringify(extra);
    if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: COLORS[key] ?? key, roughness: 0.9, ...extra }));
    return mats.get(k);
  };
  const group = new THREE.Group();
  group.name = 'house';
  const walls = deriveWalls(h);
  const rects = h.openings.map((o) => ({ o, r: openingRect(h, o.id, walls) }));
  const roomById = new Map(h.rooms.map((r) => [r.id, r]));
  const ceilH = (r) => (r && r.ceiling && r.ceiling.type !== 'none' ? v(r.ceiling.height) : 3.0);
  const clip = (y) => (cutHeight == null ? y : Math.min(y, cutHeight));

  // Box spanning plan segment a->b, from y0 to y1, thickness t, with per-side materials.
  function wallBox(a, b, y0, y1, t, sideMats, extend = 0) {
    y1 = clip(y1);
    if (y1 - y0 < 1e-4) return null;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) + extend * 2;
    if (L < 1e-4) return null;
    const geo = new THREE.BoxGeometry(L, y1 - y0, t);
    const m = new THREE.Mesh(geo, sideMats);
    m.position.set((a[0] + b[0]) / 2, (y0 + y1) / 2, -(a[1] + b[1]) / 2);
    m.rotation.y = Math.atan2(dy, dx); // local +x along wall; local +z = plan right normal (dy, -dx)
    return m;
  }

  // ---------- Walls ----------
  for (const w of walls.filter((x) => !x.plot)) {
    const g = new THREE.Group();
    g.name = `wall:${w.id}`;
    const H = Math.max(...w.rooms.map((id) => ceilH(roomById.get(id))));
    const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L = Math.hypot(dx, dy);
    const n = [dy / L, -dx / L]; // plan right normal == box local +z after rotation.y = atan2(dy, dx)
    const mid = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
    let posSideIn = true, negSideIn = true;
    if (w.exterior) {
      const room = roomById.get(w.rooms[0]);
      posSideIn = pointInPolygon([mid[0] + n[0] * 0.3, mid[1] + n[1] * 0.3], room.polygon);
      negSideIn = !posSideIn;
    }
    const side = (inside) => mat(inside ? 'interior' : 'exterior');
    const sideMats = [mat('interior'), mat('interior'), mat('interior'), mat('interior'), side(posSideIn), side(negSideIn)];
    const mine = rects.filter(({ r }) => r.wallId === w.id).map(({ r }) => r);
    const gaps = mine.map((r) => ({ ...r, type: 'door' }));
    const segs = solidSegments(w, gaps);
    segs.forEach(([a, b], i) => {
      const ext = (i === 0 && Math.hypot(a[0] - w.a[0], a[1] - w.a[1]) < 1e-6) || (i === segs.length - 1 && Math.hypot(b[0] - w.b[0], b[1] - w.b[1]) < 1e-6) ? w.thickness / 2 : 0;
      const m = wallBox(a, b, 0, H, w.thickness, sideMats, ext);
      if (m) g.add(m);
      if (w.exterior) {
        const off = (posSideIn ? -1 : 1) * (w.thickness / 2 + 0.006);
        const sk = wallBox([a[0] + n[0] * off, a[1] + n[1] * off], [b[0] + n[0] * off, b[1] + n[1] * off], 0, 0.25, 0.012, mat('skirting'), ext);
        if (sk) g.add(sk);
      }
    });
    for (const r of mine) {
      const top = r.sill + r.height;
      const lintel = wallBox(r.a, r.b, top, H, w.thickness, sideMats);
      if (lintel) g.add(lintel);
      if (r.sill > 0) {
        const sill = wallBox(r.a, r.b, 0, r.sill, w.thickness, sideMats);
        if (sill) g.add(sill);
      }
    }
    group.add(g);
  }

  // ---------- Openings ----------
  for (const { o, r } of rects) {
    const g = new THREE.Group();
    g.name = `opening:${o.id}`;
    const wall = walls.find((x) => x.id === r.wallId);
    const t = wall ? wall.thickness : 0.2;
    if (o.type === 'window') {
      const glass = wallBox(r.a, r.b, r.sill, r.sill + r.height, 0.02, mat('glass', { transparent: true, opacity: 0.35, roughness: 0.1 }));
      if (glass) g.add(glass);
      const fr = mat('frame');
      for (const [y0, y1] of [[r.sill, r.sill + 0.05], [r.sill + r.height - 0.05, r.sill + r.height]]) {
        const b = wallBox(r.a, r.b, y0, y1, t * 0.6, fr);
        if (b) g.add(b);
      }
    } else if (o.type === 'door') {
      const room = roomById.get(o.room);
      const [e0, e1] = edgeOf(room, o.edge);
      const L = Math.hypot(e1[0] - e0[0], e1[1] - e0[1]);
      const u = [(e1[0] - e0[0]) / L, (e1[1] - e0[1]) / L];
      let inN = [-u[1], u[0]];
      const mid = [(r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2];
      if (!pointInPolygon([mid[0] + inN[0] * 0.3, mid[1] + inN[1] * 0.3], room.polygon)) inN = [-inN[0], -inN[1]];
      const dir = (o.swing || 'in-left').startsWith('in') ? 1 : -1;
      const hinge = (o.swing || '').endsWith('right') ? r.b : r.a;
      const w = v(o.width);
      const tip = [hinge[0] + inN[0] * dir * w, hinge[1] + inN[1] * dir * w];
      const color = o.id === 'door-front' ? 'doorWood' : o.id.match(/wc1|ensuite|owc/) ? 'doorAlu' : 'doorDark';
      const leaf = wallBox(hinge, tip, 0, Math.min(r.height, 2.1), 0.04, mat(color));
      if (leaf) g.add(leaf);
    } else if (o.type === 'gate') {
      const dx = r.b[0] - r.a[0], dy = r.b[1] - r.a[1];
      // Sliding gate shown open: panel parked inside the wall, beyond the opening.
      const L = Math.hypot(dx, dy), n = [-dy / L, dx / L];
      const inward = [n[0] * 0.25, n[1] * 0.25];
      const start = [r.a[0] + inward[0], r.a[1] + inward[1]];
      const panel = wallBox(start, [start[0] - dx * 0.98, start[1] - dy * 0.98], 0.05, 2.1, 0.06, mat('gate'));
      if (panel) g.add(panel);
    }
    group.add(g);
  }

  // ---------- Floors and ceilings ----------
  const shapeOf = (poly) => {
    const s = new THREE.Shape();
    poly.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    s.closePath();
    return s;
  };
  for (const r of h.rooms) {
    const geo = new THREE.ShapeGeometry(shapeOf(r.polygon));
    geo.rotateX(-Math.PI / 2);
    const f = new THREE.Mesh(geo, mat(r.floor));
    f.position.y = r.kind === 'indoor' ? 0.02 : r.id === 'porch' ? 0.015 : 0.005;
    f.name = `floor:${r.id}`;
    group.add(f);
    if (ceilings && r.kind === 'indoor') {
      const H = ceilH(r);
      const c = new THREE.Group();
      c.name = `ceiling:${r.id}`;
      const cm = mat('ceiling', { side: THREE.DoubleSide });
      if (r.ceiling.type === 'tray') {
        const b = bbox(r.polygon), inset = 0.7;
        const outer = shapeOf(r.polygon);
        const inner = [[b.minX + inset, b.minY + inset], [b.maxX - inset, b.minY + inset], [b.maxX - inset, b.maxY - inset], [b.minX + inset, b.maxY - inset]];
        outer.holes.push(new THREE.Path(inner.map(([x, y]) => new THREE.Vector2(x, y)).reverse()));
        const og = new THREE.ShapeGeometry(outer); og.rotateX(-Math.PI / 2);
        const om = new THREE.Mesh(og, cm); om.position.y = H; c.add(om);
        const ig = new THREE.ShapeGeometry(shapeOf(inner)); ig.rotateX(-Math.PI / 2);
        const im = new THREE.Mesh(ig, cm); im.position.y = H + 0.3; c.add(im);
        for (let i = 0; i < 4; i++) {
          const band = wallBox(inner[i], inner[(i + 1) % 4], H, H + 0.3, 0.02, mat('trim'));
          if (band) c.add(band);
        }
      } else {
        const cg = new THREE.ShapeGeometry(shapeOf(r.polygon)); cg.rotateX(-Math.PI / 2);
        const cmsh = new THREE.Mesh(cg, cm); cmsh.position.y = H; c.add(cmsh);
      }
      group.add(c);
    }
  }

  // ---------- Fixtures ----------
  const box = (fx, y0, y1, key) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(fx.w, y1 - y0, fx.d), mat(key));
    m.position.set(fx.x, (y0 + y1) / 2, -fx.y);
    m.rotation.y = ((fx.rot || 0) * Math.PI) / 180;
    return m;
  };
  for (const fx of h.fixtures || []) {
    const g = new THREE.Group();
    g.name = `fixture:${fx.id}`;
    const H = ceilH(roomById.get(fx.room));
    switch (fx.kind) {
      case 'counter': g.add(box(fx, 0, 0.9, 'counter')); break;
      case 'wall-cabinet': g.add(box(fx, 1.55, 2.25, 'cabinet')); break;
      case 'toilet-squat': g.add(box(fx, 0, 0.06, 'porcelain')); break;
      case 'toilet-western': g.add(box({ ...fx, d: fx.d * 0.6 }, 0, 0.42, 'porcelain')); g.add(box({ ...fx, y: fx.y + fx.d * 0.35, d: 0.18 }, 0, 0.8, 'porcelain')); break;
      case 'basin': g.add(box(fx, 0.78, 0.88, 'porcelain')); g.add(box({ ...fx, w: 0.14, d: 0.14 }, 0, 0.78, 'porcelain')); break;
      case 'shower': g.add(box(fx, 0, 0.03, 'shower')); break;
      case 'ac': g.add(box(fx, 2.3, 2.6, 'ac')); break;
      case 'fan': {
        const fan = new THREE.Mesh(new THREE.BoxGeometry(fx.w, 0.02, 0.12), mat('porcelain'));
        fan.position.set(fx.x, H - 0.45, -fx.y); g.add(fan); break;
      }
      case 'tank': {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(fx.w / 2, fx.w / 2, 1.2, 24), mat('tank'));
        tank.position.set(fx.x, H + 0.15 + 0.6, -fx.y); g.add(tank); break;
      }
      case 'pillar': {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(fx.w / 2, fx.w / 2, 3.0, 16), mat('pilaster'));
        p.position.set(fx.x, 1.5, -fx.y); g.add(p); break;
      }
      default: g.add(box(fx, 0, 0.5, 'cabinet'));
    }
    if (cutHeight != null) g.children = g.children.filter((m) => new THREE.Box3().setFromObject(m).min.y < cutHeight);
    group.add(g);
  }

  // ---------- Outside W/C slab ----------
  const owc = roomById.get('owc');
  if (owc && ceilings) {
    const b = bbox(owc.polygon);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(b.maxX - b.minX + 0.6, 0.15, b.maxY - b.minY + 0.2), mat('soffit'));
    slab.position.set((b.minX + b.maxX) / 2 + 0.25, ceilH(owc) + 0.075, -(b.minY + b.maxY) / 2);
    slab.name = 'slab:owc';
    group.add(slab);
  }

  // ---------- Compound wall ----------
  if (h.plot) {
    const pw = new THREE.Group();
    pw.name = 'plot-wall';
    const ph = clip(v(h.plot.wallHeight));
    const pm = mat('plot');
    const plotCCW = (() => { const q = h.plot.polygon; let s2 = 0; q.forEach((p, i) => { const n2 = q[(i + 1) % q.length]; s2 += p[0] * n2[1] - n2[0] * p[1]; }); return s2 > 0; })();
    for (const w of walls.filter((x) => x.plot)) {
      // The plot polygon is the wall's inner face: push the wall outward by half its thickness.
      const L0 = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
      const sgn = plotCCW ? 1 : -1;
      const out = [((w.b[1] - w.a[1]) / L0) * sgn * (w.thickness / 2), (-(w.b[0] - w.a[0]) / L0) * sgn * (w.thickness / 2)];
      for (let [a, b] of solidSegments(w, rects.map(({ r }) => ({ ...r, type: 'door' })))) {
        a = [a[0] + out[0], a[1] + out[1]]; b = [b[0] + out[0], b[1] + out[1]];
        const m = wallBox(a, b, 0, ph, w.thickness, pm, w.thickness / 2);
        if (m) pw.add(m);
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const n = Math.max(1, Math.round(L / 3));
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          const c = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          const pil = new THREE.Mesh(new THREE.BoxGeometry(0.3, clip(v(h.plot.wallHeight) + 0.1), 0.3), mat('pilaster'));
          pil.position.set(c[0], clip(v(h.plot.wallHeight) + 0.1) / 2, -c[1]);
          pw.add(pil);
        }
      }
    }
    group.add(pw);
    const pb = bbox(h.plot.polygon);
    const gg = new THREE.PlaneGeometry(pb.maxX - pb.minX + 0.4, pb.maxY - pb.minY + 0.4);
    gg.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(gg, mat('pavers'));
    ground.position.set((pb.minX + pb.maxX) / 2, 0, -(pb.minY + pb.maxY) / 2);
    ground.name = 'ground';
    group.add(ground);
  }

  // ---------- Roof: hip at the back, gable at the front ----------
  if (roof) {
    const house = h.rooms.filter((r) => r.kind === 'indoor' && r.id !== 'owc');
    const b = bbox(house.flatMap((r) => r.polygon));
    const oh = v(h.roof.overhang), pitch = (v(h.roof.pitchDeg) * Math.PI) / 180;
    const H = Math.max(...house.map(ceilH)) + 0.05;
    const x0 = b.minX - 0.1 - oh, x1 = b.maxX + 0.1 + oh, yS = b.minY - 0.1 - oh, yN = b.maxY + 0.1 + oh;
    const half = (x1 - x0) / 2, cx = (x0 + x1) / 2, rise = half * Math.tan(pitch);
    const P = (x, y, z) => [x, z, -y];
    const SW = P(x0, yS, H), SE = P(x1, yS, H), NE = P(x1, yN, H), NW = P(x0, yN, H);
    const RS = P(cx, yS, H + rise), RN = P(cx, yN - half, H + rise);
    const tris = [SW, RS, RN, SW, RN, NW, SE, NE, RN, SE, RN, RS, NW, RN, NE].flat();
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
    rg.computeVertexNormals();
    const rm = new THREE.Mesh(rg, mat('roof', { side: THREE.DoubleSide }));
    const rgp = new THREE.Group();
    rgp.name = 'roof';
    rgp.add(rm);
    // Front gable wall (triangle above the front wall line)
    const wx0 = b.minX - 0.1, wx1 = b.maxX + 0.1, wy = b.minY - 0.1;
    const gRise = ((wx1 - wx0) / 2) * Math.tan(pitch);
    const gt = [P(wx0, wy, H), P(wx1, wy, H), P(cx, wy, H + gRise)].flat();
    const gg2 = new THREE.BufferGeometry();
    gg2.setAttribute('position', new THREE.Float32BufferAttribute(gt, 3));
    gg2.computeVertexNormals();
    rgp.add(new THREE.Mesh(gg2, mat('exterior', { side: THREE.DoubleSide })));
    group.add(rgp);
  }

  return group;
}
