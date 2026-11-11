// Pure geometry over a house description. Works in Node and the browser.
// Rooms are assumed rectilinear (axis-aligned edges); other edges become single walls.

const EPS = 1e-6;
export const PASSABLE = ['door', 'archway']; // the gate is the property edge: nothing is modelled outside it

export const v = (d) => (typeof d === 'number' ? d : d && typeof d === 'object' ? d.value : d);

export function roomArea(room) {
  const p = room.polygon;
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

export function bbox(poly) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

const r6 = (n) => Math.round(n * 1e6) / 1e6;

// Rooms that make up the house itself: everything not touching the compound wall (house rooms + porch).
export function houseRooms(h) {
  const pb = bbox(h.plot.polygon);
  const onPlot = (p) => Math.abs(p[0] - pb.minX) < EPS || Math.abs(p[0] - pb.maxX) < EPS || Math.abs(p[1] - pb.minY) < EPS || Math.abs(p[1] - pb.maxY) < EPS;
  return h.rooms.filter((r) => !r.polygon.some(onPlot));
}

// What each room is, worked out from the layout rather than its id:
// porches (outdoor, free-standing), outbuildings (indoor, built against the compound wall), and the
// parking and walkways (outdoor, against the front / west / east / back compound wall). A role that
// isn't exactly one room is null.
export function siteRoles(h) {
  const pb = bbox(h.plot.polygon);
  const inHouse = new Set(houseRooms(h).map((r) => r.id));
  const SIDES = { south: [1, pb.minY], north: [1, pb.maxY], west: [0, pb.minX], east: [0, pb.maxX] };
  const along = (r, side) => {
    const [axis, c] = SIDES[side];
    return r.polygon.some((p, i) => {
      const q = r.polygon[(i + 1) % r.polygon.length];
      return Math.abs(p[axis] - c) < EPS && Math.abs(q[axis] - c) < EPS && Math.hypot(q[0] - p[0], q[1] - p[1]) > EPS;
    });
  };
  const yard = h.rooms.filter((r) => r.kind !== 'indoor' && !inHouse.has(r.id));
  const one = (list) => (list.length === 1 ? list[0] : null);
  const parking = one(yard.filter((r) => along(r, 'south')));
  const back = one(yard.filter((r) => r !== parking && along(r, 'north')));
  const rest = yard.filter((r) => r !== parking && r !== back);
  const porches = h.rooms.filter((r) => r.kind !== 'indoor' && inHouse.has(r.id));
  const outbuildings = h.rooms.filter((r) => r.kind === 'indoor' && !inHouse.has(r.id));
  return {
    house: h.rooms.filter((r) => r.kind === 'indoor' && inHouse.has(r.id)),
    porches, outbuildings, porch: one(porches), outbuilding: one(outbuildings),
    parking, walkN: back, walkW: one(rest.filter((r) => along(r, 'west'))), walkE: one(rest.filter((r) => along(r, 'east'))),
  };
}

export function edgeOf(room, i) {
  const p = room.polygon;
  return [p[i], p[(i + 1) % p.length]];
}

export function deriveWalls(h) {
  const lines = new Map(); // key -> {axis, c, spans:[{rid, lo, hi}]}
  const walls = [];
  const counters = new Map();
  const nextId = (rooms) => {
    const k = rooms.join('+');
    const n = (counters.get(k) || 0) + 1;
    counters.set(k, n);
    return `${k}#${n}`;
  };
  for (const room of h.rooms.filter((r) => r.kind === 'indoor')) {
    room.polygon.forEach((_, i) => {
      const [a, b] = edgeOf(room, i);
      if (Math.abs(a[0] - b[0]) < EPS) {
        const key = `x=${r6(a[0])}`;
        if (!lines.has(key)) lines.set(key, { axis: 'x', c: a[0], spans: [] });
        lines.get(key).spans.push({ rid: room.id, lo: Math.min(a[1], b[1]), hi: Math.max(a[1], b[1]) });
      } else if (Math.abs(a[1] - b[1]) < EPS) {
        const key = `y=${r6(a[1])}`;
        if (!lines.has(key)) lines.set(key, { axis: 'y', c: a[1], spans: [] });
        lines.get(key).spans.push({ rid: room.id, lo: Math.min(a[0], b[0]), hi: Math.max(a[0], b[0]) });
      } else {
        walls.push({ id: nextId([room.id]), a, b, thickness: 0.2, exterior: true, rooms: [room.id] });
      }
    });
  }
  for (const { axis, c, spans } of lines.values()) {
    const pts = [...new Set(spans.flatMap((s) => [r6(s.lo), r6(s.hi)]))].sort((x, y) => x - y);
    let cur = null;
    const flush = () => {
      if (!cur) return;
      const rooms = [...cur.rooms].sort();
      const a = axis === 'x' ? [c, cur.lo] : [cur.lo, c];
      const b = axis === 'x' ? [c, cur.hi] : [cur.hi, c];
      walls.push({ id: nextId(rooms), a, b, thickness: rooms.length > 1 ? 0.15 : 0.2, exterior: rooms.length === 1, rooms });
      cur = null;
    };
    for (let i = 0; i < pts.length - 1; i++) {
      const lo = pts[i], hi = pts[i + 1];
      const rooms = [...new Set(spans.filter((s) => s.lo <= lo + EPS && s.hi >= hi - EPS).map((s) => s.rid))].sort();
      const key = rooms.join('+');
      if (!rooms.length) { flush(); continue; }
      if (cur && cur.key === key && Math.abs(cur.hi - lo) < EPS) cur.hi = hi;
      else { flush(); cur = { key, rooms, lo, hi }; }
    }
    flush();
  }
  if (h.plot && Array.isArray(h.plot.polygon)) {
    const p = h.plot.polygon;
    p.forEach((a, i) => walls.push({ id: `plot:${i}`, a, b: p[(i + 1) % p.length], thickness: 0.2, exterior: true, rooms: [], plot: true }));
  }
  return walls;
}

function closestOnSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  let t = L2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return [a[0] + t * dx, a[1] + t * dy];
}

const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

function onSegment(p, a, b) {
  return dist(p, closestOnSeg(p, a, b)) < 1e-4;
}

export function openingRect(h, openingId, walls = deriveWalls(h)) {
  const o = h.openings.find((x) => x.id === openingId);
  if (!o) throw new Error(`unknown opening "${openingId}"`);
  const room = h.rooms.find((r) => r.id === o.room);
  const [p0, p1] = edgeOf(room, o.edge);
  const len = dist(p0, p1);
  const ux = (p1[0] - p0[0]) / len, uy = (p1[1] - p0[1]) / len;
  const off = v(o.offset), w = v(o.width);
  const a = [r6(p0[0] + ux * off), r6(p0[1] + uy * off)];
  const b = [r6(a[0] + ux * w), r6(a[1] + uy * w)];
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const wall = walls.find((wl) => !wl.plot && onSegment(mid, wl.a, wl.b)) || walls.find((wl) => onSegment(mid, wl.a, wl.b));
  return { id: o.id, wallId: wall ? wall.id : null, a, b, sill: v(o.sill), height: v(o.height), type: o.type };
}

// Solid parts of a wall after removing passable openings that sit on it.
export function solidSegments(wall, openings) {
  const L = dist(wall.a, wall.b);
  if (L < EPS) return [];
  const ux = (wall.b[0] - wall.a[0]) / L, uy = (wall.b[1] - wall.a[1]) / L;
  const proj = (p) => (p[0] - wall.a[0]) * ux + (p[1] - wall.a[1]) * uy;
  const gaps = openings
    .filter((o) => PASSABLE.includes(o.type) && onSegment(o.a, wall.a, wall.b) && onSegment(o.b, wall.a, wall.b))
    .map((o) => [Math.min(proj(o.a), proj(o.b)), Math.max(proj(o.a), proj(o.b))])
    .sort((x, y) => x[0] - y[0]);
  const out = [];
  let s = 0;
  for (const [g0, g1] of gaps) {
    if (g0 > s + EPS) out.push([s, g0]);
    s = Math.max(s, g1);
  }
  if (L > s + EPS) out.push([s, L]);
  return out.map(([t0, t1]) => [[wall.a[0] + ux * t0, wall.a[1] + uy * t0], [wall.a[0] + ux * t1, wall.a[1] + uy * t1]]);
}

export function collide(pos, radius, walls, openings = []) {
  let p = [pos[0], pos[1]];
  const segs = walls.flatMap((w) => solidSegments(w, openings).map(([a, b]) => ({ a, b, half: w.thickness / 2 })));
  for (let pass = 0; pass < 3; pass++) {
    for (const s of segs) {
      const c = closestOnSeg(p, s.a, s.b);
      const d = dist(p, c);
      const min = radius + s.half;
      if (d < min) {
        if (d < 1e-9) {
          const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1];
          const L = Math.hypot(dx, dy) || 1;
          p = [c[0] - (dy / L) * min, c[1] + (dx / L) * min];
        } else {
          p = [c[0] + ((p[0] - c[0]) / d) * min, c[1] + ((p[1] - c[1]) / d) * min];
        }
      }
    }
  }
  return p;
}

export function nearestPhotos(h, pt, n) {
  return [...(h.photos || [])].sort((a, b) => dist([a.x, a.y], pt) - dist([b.x, b.y], pt)).slice(0, n);
}

export function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function distToPolygon(pt, poly) {
  if (pointInPolygon(pt, poly)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) best = Math.min(best, dist(pt, closestOnSeg(pt, poly[i], poly[(i + 1) % poly.length])));
  return best;
}
