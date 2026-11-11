// Pure edits on a house. Never mutates its input; a rejected edit returns the input unchanged with errors.
import { validateHouse } from '../model/schema.js';
import { v, bbox, deriveWalls, openingRect, edgeOf, distToPolygon, houseRooms, siteRoles } from '../model/geometry.js';

export { houseRooms };

const EPS = 1e-6;
const MIN_EDGE = 0.3;     // smallest indoor wall length
const MIN_OPENING = 0.3;  // smallest opening width / height
const HUG = 0.8;          // fittings within this distance of a moved wall move with it
const r6 = (n) => Math.round(n * 1e6) / 1e6;
const user = (value) => ({ value: r6(value), source: 'user', confidence: 'high' });
const KIND = { door: 'Door', window: 'Window', archway: 'Opening', gate: 'Gate' };
const label = (o) => `${KIND[o.type] || 'Opening'} "${o.id}"`;

function signedArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

export function wallBetween(h, a, b) {
  const w = deriveWalls(h).find((x) => x.rooms.includes(a) && x.rooms.includes(b));
  return w ? w.id : null;
}

// The wall on one side ('north' | 'south' | 'east' | 'west') of a room; the longest if several.
export function sideWall(h, roomId, side) {
  const room = h.rooms.find((r) => r.id === roomId);
  const b = bbox(room.polygon);
  const axis = side === 'east' || side === 'west' ? 0 : 1;
  const c = { east: b.maxX, west: b.minX, north: b.maxY, south: b.minY }[side];
  const ws = deriveWalls(h).filter((w) => (w.rooms.includes(roomId) || (w.plot && room.kind !== 'indoor')) &&
    Math.abs(w.a[axis] - c) < EPS && Math.abs(w.b[axis] - c) < EPS);
  ws.sort((p, q) => Math.hypot(q.b[0] - q.a[0], q.b[1] - q.a[1]) - Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]));
  return ws.length ? ws[0].id : null;
}

// Wall spans (in metres along the opening's room edge) the opening may sit in.
function edgeSpans(h, o, walls) {
  const room = h.rooms.find((r) => r.id === o.room);
  const [p0, p1] = edgeOf(room, o.edge);
  const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  if (L < EPS) return { L, spans: [] };
  const u = [(p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L];
  const t = (p) => (p[0] - p0[0]) * u[0] + (p[1] - p0[1]) * u[1];
  const perp = (p) => Math.abs((p[0] - p0[0]) * u[1] - (p[1] - p0[1]) * u[0]);
  const spans = walls
    .filter((w) => (room.kind === 'indoor' ? w.rooms.includes(room.id) : w.plot || w.rooms.length > 0))
    .filter((w) => perp(w.a) < EPS && perp(w.b) < EPS)
    .map((w) => [Math.max(0, Math.min(t(w.a), t(w.b))), Math.min(L, Math.max(t(w.a), t(w.b)))])
    .filter(([lo, hi]) => hi - lo > EPS)
    .sort((a, b) => a[0] - b[0]);
  return { L, spans };
}

const overlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
// A value the editor changed on its own (not typed by you): keeps its confidence, marked 'adjusted'.
const adjusted = (d, value) => (typeof d === 'number' ? r6(value) : { ...d, value: r6(value), source: 'adjusted' });

// Slide (or, for archways, shrink) openings so each sits within one wall. Mutates `next`.
function fitOpenings(next) {
  const errors = [];
  const walls = deriveWalls(next);
  for (const o of next.openings) {
    const { spans } = edgeSpans(next, o, walls);
    if (!spans.length) { errors.push(`${label(o)} no longer sits on a wall`); continue; }
    let off = v(o.offset), w = v(o.width);
    if (spans.some(([lo, hi]) => off >= lo - EPS && off + w <= hi + EPS)) continue;
    const mid = off + w / 2;
    const [lo, hi] = spans.find(([a, b]) => mid >= a && mid <= b)
      || [...spans].sort((a, b) => overlap(off, off + w, b[0], b[1]) - overlap(off, off + w, a[0], a[1]))[0];
    const room2 = hi - lo - 0.1;
    if (w > room2) {
      if (o.type === 'archway' && room2 >= 0.6) { w = room2; o.width = adjusted(o.width, w); }
      else { errors.push(`${label(o)} is wider than wall (${(hi - lo).toFixed(2)} m)`); continue; }
    }
    off = Math.min(Math.max(off, lo + 0.05), hi - w - 0.05);
    if (Math.abs(off - v(o.offset)) > EPS) o.offset = adjusted(o.offset, off);
  }
  return errors;
}

// Every opening within a single wall, and no two openings overlapping on the same wall line.
function checkOpenings(next, only = null) {
  const errors = [];
  const walls = deriveWalls(next);
  const rects = new Map(next.openings.map((o) => [o.id, openingRect(next, o.id, walls)]));
  for (const o of next.openings) {
    if (only && o.id !== only) continue;
    const off = v(o.offset), w = v(o.width);
    const { L, spans } = edgeSpans(next, o, walls);
    if (w > L + EPS) { errors.push(`${label(o)} is wider than wall (${L.toFixed(2)} m)`); continue; }
    if (off < -EPS || off + w > L + EPS) { errors.push(`${label(o)} runs past the end of its wall`); continue; }
    if (!spans.some(([lo, hi]) => off >= lo - EPS && off + w <= hi + EPS)) {
      const fits = spans.some(([lo, hi]) => hi - lo >= w);
      errors.push(fits ? `${label(o)} would straddle two walls; move it along the wall` : `${label(o)} is wider than wall`);
      continue;
    }
    const r = rects.get(o.id);
    const axis = Math.abs(r.a[0] - r.b[0]) < EPS ? 0 : 1; // constant coordinate
    const along = 1 - axis;
    for (const q of next.openings) {
      if (q.id === o.id) continue;
      const s = rects.get(q.id);
      if (Math.abs(s.a[axis] - r.a[axis]) > EPS || Math.abs(s.b[axis] - r.a[axis]) > EPS) continue;
      const ov = overlap(Math.min(r.a[along], r.b[along]), Math.max(r.a[along], r.b[along]), Math.min(s.a[along], s.b[along]), Math.max(s.a[along], s.b[along]));
      if (ov > 0.01 && (!only || o.id === only)) errors.push(`${label(o)} would overlap ${label(q)}`);
    }
  }
  return [...new Set(errors)];
}

function checkRooms(before, next, derivedOutdoor = false) {
  const errors = derivedOutdoor ? checkSite(before, next) : [];
  next.rooms.forEach((r, i) => {
    const old = before.rooms[i];
    if (derivedOutdoor && r.kind !== 'indoor') return;
    const a0 = signedArea(old.polygon), a1 = signedArea(r.polygon);
    let reversed = false, short = false;
    const sameShape = r.polygon.length === old.polygon.length;
    r.polygon.forEach((p, k) => {
      const q = r.polygon[(k + 1) % r.polygon.length];
      const p0 = old.polygon[k], q0 = old.polygon[(k + 1) % old.polygon.length];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (sameShape && (q[0] - p[0]) * (q0[0] - p0[0]) + (q[1] - p[1]) * (q0[1] - p0[1]) < -EPS) reversed = true;
      if (r.kind === 'indoor' && len < MIN_EDGE) short = true;
    });
    if (r.kind === 'indoor') {
      if (Math.sign(a0) !== Math.sign(a1) || Math.abs(a1) < MIN_EDGE * MIN_EDGE || short || reversed) errors.push(`${r.name} would be too small`);
    } else if (reversed || Math.sign(a0) !== Math.sign(a1) || Math.abs(a1) < EPS) {
      errors.push(`${r.name} would be squeezed out by this move`);
    }
  });
  const rects = next.rooms.filter((r) => r.polygon.length === 4);
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = bbox(rects[i].polygon), b = bbox(rects[j].polygon);
      if (overlap(a.minX, a.maxX, b.minX, b.maxX) > 1e-4 && overlap(a.minY, a.maxY, b.minY, b.maxY) > 1e-4)
        errors.push(`${rects[i].name} would overlap ${rects[j].name}`);
    }
  }
  return errors;
}

// Shift every vertex whose coordinate on `axis` is in `lines` by delta.
function shiftLines(next, axis, lines, delta) {
  const hit = (p) => lines.some((c) => Math.abs(p[axis] - c) < EPS);
  const moved = new Set();
  for (const r of next.rooms) for (const p of r.polygon) if (hit(p)) { p[axis] = r6(p[axis] + delta); moved.add(r.id); }
  if (next.plot) for (const p of next.plot.polygon) if (hit(p)) p[axis] = r6(p[axis] + delta);
  for (const r of next.rooms) if (moved.has(r.id) && r.estimate) r.estimate = { ...r.estimate, edited: true };
  return moved;
}

const fxKey = (axis) => (axis === 0 ? 'x' : 'y');

function dedupe(poly) {
  return poly.filter((p, i) => {
    const q = poly[(i + 1) % poly.length];
    return Math.hypot(q[0] - p[0], q[1] - p[1]) > EPS;
  });
}

// The site's rooms in `next`, found from the layout of `before` (the edit may have moved them).
function roles(before, next) {
  const r = siteRoles(before);
  const get = (room) => room && next.rooms.find((x) => x.id === room.id);
  return { park: get(r.parking), ww: get(r.walkW), we: get(r.walkE), wn: get(r.walkN), porch: get(r.porch), owc: get(r.outbuilding),
    house: r.house.map(get) };
}

// Walkways and parking are what's left between the house, porch, outside W/C and compound wall:
// rebuild them from those so they follow every edit. Only for this layout (one porch, one outbuilding,
// parking at the front, walkways on three sides); otherwise unchanged.
function rebuildOutdoor(before, next) {
  const { park, ww, we, wn, porch, owc, house } = roles(before, next);
  if (!park || !ww || !we || !wn || !porch || !owc) return false;
  const hb = bbox(house.flatMap((r) => r.polygon));
  const pb = bbox(next.plot.polygon), pc = bbox(porch.polygon), ob = bbox(owc.polygon);
  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  park.polygon = rect(pb.minX, pb.minY, pb.maxX, hb.minY);
  we.polygon = rect(hb.maxX, hb.minY, pb.maxX, hb.maxY);
  ww.polygon = dedupe([[pb.minX, hb.minY], [hb.minX, hb.minY], [hb.minX, pc.minY], [pc.minX, pc.minY], [pc.minX, pc.maxY],
    [hb.minX, pc.maxY], [hb.minX, ob.minY], [pb.minX, ob.minY]]);
  wn.polygon = dedupe([[ob.maxX, ob.minY], [hb.minX, ob.minY], [hb.minX, hb.maxY], [pb.maxX, hb.maxY], [pb.maxX, pb.maxY], [ob.maxX, pb.maxY]]);
  return true;
}

const MIN_WALK = 0.3;
// The real constraints once walkways are derived: the house fits inside the compound with room to walk round it.
function checkSite(before, next) {
  const { porch, owc, house } = roles(before, next);
  const hb = bbox(house.flatMap((r) => r.polygon));
  const pb = bbox(next.plot.polygon), pc = bbox(porch.polygon), ob = bbox(owc.polygon);
  const errors = [];
  if (pc.minX - pb.minX < MIN_WALK) errors.push(`West walkway would be narrower than ${MIN_WALK} m`);
  if (pb.maxX - hb.maxX < MIN_WALK) errors.push(`East walkway would be narrower than ${MIN_WALK} m`);
  if (hb.minY - pb.minY < MIN_WALK) errors.push(`Parking would be shallower than ${MIN_WALK} m`);
  if (pb.maxY - hb.maxY < MIN_WALK) errors.push(`Back walkway would be narrower than ${MIN_WALK} m`);
  for (const [name, b] of [['house', hb], ['porch', pc]])
    if (overlap(b.minX, b.maxX, ob.minX, ob.maxX) > 1e-3 && overlap(b.minY, b.maxY, ob.minY, ob.maxY) > 1e-3)
      errors.push(`The ${name} would run into the outside W/C`);
  if (ob.minX < pb.minX - EPS || ob.maxY > pb.maxY + EPS) errors.push('The outside W/C would leave the compound');
  return errors;
}

function moveWall(h, next, w, delta) {
  const axis = Math.abs(w.a[0] - w.b[0]) < EPS ? 0 : 1;
  const c = w.a[axis];
  const lines = [c];
  const translate = new Set();
  if (w.plot) {
    // Rooms built against the compound wall (outside W/C) move with it instead of stretching.
    for (const r of h.rooms.filter((x) => x.kind === 'indoor' && x.polygon.some((p) => Math.abs(p[axis] - c) < EPS))) {
      const b = bbox(r.polygon);
      const lo = axis === 0 ? b.minX : b.minY, hi = axis === 0 ? b.maxX : b.maxY;
      lines.push(Math.abs(lo - c) < EPS ? hi : lo);
      translate.add(r.id);
    }
  }
  const touching = new Set(h.rooms.filter((r) => r.polygon.some((p) => Math.abs(p[axis] - c) < EPS)).map((r) => r.id));
  shiftLines(next, axis, lines, delta);
  const k = fxKey(axis);
  for (const f of next.fixtures || []) {
    if (translate.has(f.room) || (touching.has(f.room) && Math.abs(f[k] - c) <= HUG)) f[k] = r6(f[k] + delta);
  }
  for (const p of next.photos || []) {
    const r = next.rooms.find((x) => x.id === p.room);
    if (translate.has(p.room) || (r && distToPolygon([p.x, p.y], r.polygon) > 0)) p[k] = r6(p[k] + delta);
  }
}

function moveHouse(h, next, dx, dy) {
  const ids = new Set(houseRooms(h).map((r) => r.id));
  const pts = houseRooms(h).flatMap((r) => r.polygon);
  for (const [axis, d] of [[0, dx], [1, dy]]) {
    if (!d) continue;
    shiftLines(next, axis, [...new Set(pts.map((p) => p[axis]))], d);
    const k = fxKey(axis);
    for (const f of next.fixtures || []) if (ids.has(f.room)) f[k] = r6(f[k] + d);
    for (const p of next.photos || []) if (ids.has(p.room)) p[k] = r6(p[k] + d);
  }
}

export function applyEdit(h, edit) {
  const next = structuredClone(h);
  const errors = [];
  if (edit.kind === 'moveWall') {
    const w = deriveWalls(h).find((x) => x.id === edit.wallId);
    if (!w) return { house: h, errors: [`Unknown wall "${edit.wallId}"`] };
    if (!Number.isFinite(edit.delta)) return { house: h, errors: ['Enter a number'] };
    moveWall(h, next, w, edit.delta);
    const target = edit.roomId && next.rooms.find((r) => r.id === edit.roomId);
    if (target) target.estimate = { ...target.estimate, edited: true, source: 'user', confidence: 'high' };
    const derived = rebuildOutdoor(h, next);
    errors.push(...checkRooms(h, next, derived));
    if (!errors.length) errors.push(...fitOpenings(next));
    if (!errors.length) errors.push(...checkOpenings(next));
  } else if (edit.kind === 'moveHouse') {
    const dx = edit.dx || 0, dy = edit.dy || 0;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { house: h, errors: ['Enter a number'] };
    moveHouse(h, next, dx, dy);
    const derived = rebuildOutdoor(h, next);
    errors.push(...checkRooms(h, next, derived));
    if (!errors.length) errors.push(...fitOpenings(next));
    if (!errors.length) errors.push(...checkOpenings(next));
  } else if (edit.kind === 'opening') {
    const o = next.openings.find((x) => x.id === edit.id);
    if (!o) return { house: h, errors: [`Unknown opening "${edit.id}"`] };
    for (const k of ['offset', 'width', 'height', 'sill']) {
      if (edit[k] === undefined) continue;
      const min = k === 'width' || k === 'height' ? MIN_OPENING : 0;
      if (!Number.isFinite(edit[k]) || edit[k] < min) { errors.push(`${label(o)}: ${k} must be at least ${min} m`); continue; }
      o[k] = user(edit[k]);
    }
    if (!errors.length) errors.push(...checkOpenings(next, o.id));
    const room = next.rooms.find((r) => r.id === o.room);
    const ceil = room.ceiling && room.ceiling.type !== 'none' ? v(room.ceiling.height) : v(next.plot.wallHeight) || 3;
    if (v(o.sill) + v(o.height) > ceil + EPS) errors.push(`${label(o)} is taller than the wall (${ceil.toFixed(2)} m)`);
  } else if (edit.kind === 'ceiling') {
    const r = next.rooms.find((x) => x.id === edit.roomId);
    if (!r || r.ceiling.type === 'none') return { house: h, errors: [`"${edit.roomId}" has no ceiling`] };
    if (!Number.isFinite(edit.height) || edit.height < 2.0 || edit.height > 6.0) errors.push('Ceiling height must be between 2.0 and 6.0 m');
    else r.ceiling.height = user(edit.height);
  } else {
    return { house: h, errors: [`Unknown edit "${edit.kind}"`] };
  }
  if (!errors.length) errors.push(...validateHouse(next).errors);
  return errors.length ? { house: h, errors } : { house: next, errors: [] };
}

export function importHouse(text) {
  let h;
  try { h = JSON.parse(text); } catch (e) { return { house: null, errors: [`Not valid JSON: ${e.message}`] }; }
  const r = validateHouse(h);
  return r.ok ? { house: h, errors: [] } : { house: null, errors: r.errors };
}
