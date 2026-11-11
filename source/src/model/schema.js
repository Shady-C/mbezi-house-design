// Validates a house description. Returns human-readable errors with paths.

export const SOURCES = ['tile-count', 'door-width', 'paver-count', 'sketch', 'exif', 'assumption', 'user', 'adjusted'];
export const CONFIDENCE = ['high', 'medium', 'low'];
const FLOORS = ['wood-look', 'white-diagonal', 'bath-pattern', 'pavers', 'porch-tile'];
const CEILINGS = ['flat', 'tray', 'none'];
const OPENING_TYPES = ['door', 'window', 'archway', 'gate'];
const SWINGS = ['in-left', 'in-right', 'out-left', 'out-right', null];

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

function checkD(d, path, errors) {
  if (isNum(d)) return;
  if (!isObj(d)) return errors.push(`${path}: must be a number or {value, source, confidence}`);
  if (!isNum(d.value)) errors.push(`${path}.value: must be a number`);
  if (!SOURCES.includes(d.source)) errors.push(`${path}.source: must be one of ${SOURCES.join(', ')}`);
  if (!CONFIDENCE.includes(d.confidence)) errors.push(`${path}.confidence: must be one of ${CONFIDENCE.join(', ')}`);
}

function checkPolygon(poly, path, errors) {
  if (!Array.isArray(poly) || poly.length < 3) return errors.push(`${path}: needs ≥3 points`);
  poly.forEach((p, i) => {
    if (!Array.isArray(p) || p.length !== 2 || !isNum(p[0]) || !isNum(p[1])) return errors.push(`${path}[${i}]: must be [x, y]`);
    const q = poly[(i + 1) % poly.length];
    if (Array.isArray(q) && Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-9) errors.push(`${path}[${i}]: point repeated (zero-length wall)`);
  });
}

function checkEnum(val, allowed, path, errors) {
  if (!allowed.includes(val)) errors.push(`${path}: must be one of ${allowed.map(String).join(', ')}`);
}

export function validateHouse(h) {
  const errors = [];
  if (!isObj(h)) return { ok: false, errors: ['house: must be an object'] };
  if (h.version !== 1) errors.push('version: must be 1');
  checkD(h.northDeg, 'northDeg', errors);
  if (!isObj(h.plot)) errors.push('plot: required ({polygon, wallHeight})');
  else {
    checkPolygon(h.plot.polygon, 'plot.polygon', errors);
    checkD(h.plot.wallHeight, 'plot.wallHeight', errors);
  }
  if (!Array.isArray(h.rooms) || h.rooms.length === 0) {
    errors.push('rooms: must be a non-empty array');
    return { ok: false, errors };
  }
  const ids = new Set();
  h.rooms.forEach((r, i) => {
    const p = `rooms[${i}]`;
    if (!isObj(r)) return errors.push(`${p}: must be an object`);
    if (typeof r.id !== 'string' || !r.id) errors.push(`${p}.id: must be a string`);
    else if (ids.has(r.id)) errors.push(`${p}.id: duplicate "${r.id}"`);
    else ids.add(r.id);
    if (typeof r.name !== 'string') errors.push(`${p}.name: must be a string`);
    checkEnum(r.kind, ['indoor', 'outdoor'], `${p}.kind`, errors);
    checkPolygon(r.polygon, `${p}.polygon`, errors);
    checkEnum(r.floor, FLOORS, `${p}.floor`, errors);
    if (!isObj(r.ceiling)) errors.push(`${p}.ceiling: must be an object`);
    else {
      checkEnum(r.ceiling.type, CEILINGS, `${p}.ceiling.type`, errors);
      if (r.ceiling.type !== 'none') checkD(r.ceiling.height, `${p}.ceiling.height`, errors);
    }
  });
  if (!Array.isArray(h.openings)) errors.push('openings: must be an array');
  else {
    const oids = new Set();
    h.openings.forEach((o, i) => {
      const p = `openings[${i}]`;
      if (!isObj(o)) return errors.push(`${p}: must be an object`);
      if (typeof o.id !== 'string' || oids.has(o.id)) errors.push(`${p}.id: must be a unique string`);
      oids.add(o.id);
      const room = h.rooms.find((r) => r && r.id === o.room);
      if (!room) errors.push(`${p}.room: unknown room "${o.room}"`);
      else if (Array.isArray(room.polygon) && !(Number.isInteger(o.edge) && o.edge >= 0 && o.edge < room.polygon.length))
        errors.push(`${p}.edge: must be an edge index of room "${o.room}"`);
      for (const k of ['offset', 'width', 'height', 'sill']) checkD(o[k], `${p}.${k}`, errors);
      checkEnum(o.type, OPENING_TYPES, `${p}.type`, errors);
      checkEnum(o.swing ?? null, SWINGS, `${p}.swing`, errors);
    });
  }
  for (const key of ['fixtures', 'photos']) {
    if (h[key] !== undefined && !Array.isArray(h[key])) errors.push(`${key}: must be an array`);
  }
  (h.photos || []).forEach((ph, i) => {
    const p = `photos[${i}]`;
    if (!isObj(ph)) return errors.push(`${p}: must be an object`);
    if (typeof ph.file !== 'string') errors.push(`${p}.file: must be a string`);
    if (!isNum(ph.x) || !isNum(ph.y)) errors.push(`${p}: x and y must be numbers`);
    if (!ids.has(ph.room)) errors.push(`${p}.room: unknown room "${ph.room}"`);
  });
  (h.fixtures || []).forEach((f, i) => {
    const p = `fixtures[${i}]`;
    if (!isObj(f)) return errors.push(`${p}: must be an object`);
    if (!ids.has(f.room)) errors.push(`${p}.room: unknown room "${f.room}"`);
    for (const k of ['x', 'y', 'w', 'd']) if (!isNum(f[k])) errors.push(`${p}.${k}: must be a number`);
  });
  if (!isObj(h.roof)) errors.push('roof: required ({type, overhang, pitchDeg})');
  else {
    checkD(h.roof.overhang, 'roof.overhang', errors);
    checkD(h.roof.pitchDeg, 'roof.pitchDeg', errors);
  }
  return { ok: errors.length === 0, errors };
}
