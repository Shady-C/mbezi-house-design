// Renders the house as a standalone SVG string (floor plan or site plan).
import { v, bbox, roomArea, deriveWalls, openingRect, solidSegments, edgeOf } from '../model/geometry.js';

const S = 100; // SVG units per metre
const HOUSE_EXCLUDE = new Set(['owc']);
const FILL = {
  'wood-look': '#ece6dc', 'white-diagonal': '#f7f7f4', 'bath-pattern': '#e3ddd3', pavers: '#e2d7c7', 'porch-tile': '#efeae2',
};
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);

function signedArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

export function clearSize(room, walls) {
  const b = bbox(room.polygon);
  if (room.kind !== 'indoor') return { w: b.maxX - b.minX, d: b.maxY - b.minY };
  const half = (axis, c) => {
    const ws = walls.filter((w) => w.rooms.includes(room.id) && Math.abs(w.a[axis] - c) < 1e-6 && Math.abs(w.b[axis] - c) < 1e-6);
    return ws.length ? Math.max(...ws.map((w) => w.thickness / 2)) : 0.1;
  };
  return {
    w: b.maxX - b.minX - half(0, b.minX) - half(0, b.maxX),
    d: b.maxY - b.minY - half(1, b.minY) - half(1, b.maxY),
  };
}

export function renderPlan(h, { mode = 'floor', dims = true, pins = false, selected = null } = {}) {
  const site = mode === 'site';
  const rooms = h.rooms.filter((r) => (site ? true : r.kind === 'indoor' ? !HOUSE_EXCLUDE.has(r.id) : r.id === 'porch'));
  const roomIds = new Set(rooms.map((r) => r.id));
  const allWalls = deriveWalls(h);
  const walls = allWalls.filter((w) => (w.plot ? site : w.rooms.some((id) => roomIds.has(id))));
  const openings = h.openings.filter((o) => roomIds.has(o.room)).map((o) => ({ o, r: openingRect(h, o.id, allWalls) }));

  const pts = (site && h.plot ? h.plot.polygon : rooms.flatMap((r) => r.polygon));
  const bb = bbox(pts);
  const pad = 1.6;
  const minX = bb.minX - pad, maxX = bb.maxX + pad, minY = bb.minY - pad, maxY = bb.maxY + pad;
  const X = (x) => +((x - minX) * S).toFixed(1);
  const Y = (y) => +((maxY - y) * S).toFixed(1);
  const P = (p) => `${X(p[0])},${Y(p[1])}`;
  const W = (maxX - minX) * S, H = (maxY - minY) * S;
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" class="plan plan-${mode}" font-family="system-ui, sans-serif">`);
  out.push(`<style>.room text{fill:#2c2c2a;text-anchor:middle}.room .nm{font-size:30px;font-weight:600}.room .dm{font-size:22px;fill:#5f5e5a}.est{font-style:italic}
.wall{fill:#2c2c2a}.plotwall{fill:#8a8370}.win line{stroke:#1d6fa5;stroke-width:4}.door line,.swing{stroke:#5f5e5a;stroke-width:3;fill:none}.swing{stroke-dasharray:8 6}
.arch line{stroke:#5f5e5a;stroke-width:3;stroke-dasharray:12 8}.gate line{stroke:#5f5e5a;stroke-width:6;stroke-dasharray:20 10}
.selected polygon{stroke:#d85a30;stroke-width:8}.pin circle{fill:#d85a30;stroke:#fff;stroke-width:3}.pin path{fill:#d85a30;fill-opacity:.25}.pin{cursor:pointer}</style>`);
  out.push(`<rect width="100%" height="100%" fill="#fff"/>`);

  // Room fills
  for (const r of rooms) {
    const sel = selected === r.id ? ' selected' : '';
    out.push(`<g data-room="${esc(r.id)}" class="room${sel}"><polygon points="${r.polygon.map(P).join(' ')}" fill="${FILL[r.floor] || '#fff'}" stroke="#d3d1c7" stroke-width="2"/></g>`);
  }

  // Walls with every opening cut out
  const gapsAll = openings.map(({ r }) => ({ ...r, type: 'door' }));
  for (const w of walls) {
    for (const [a, b] of solidSegments(w, gapsAll)) {
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      const nx = (-dy / L) * (w.thickness / 2), ny = (dx / L) * (w.thickness / 2);
      const ex = (dx / L) * (w.thickness / 2), ey = (dy / L) * (w.thickness / 2);
      const q = [[a[0] - ex + nx, a[1] - ey + ny], [b[0] + ex + nx, b[1] + ey + ny], [b[0] + ex - nx, b[1] + ey - ny], [a[0] - ex - nx, a[1] - ey - ny]];
      out.push(`<polygon class="${w.plot ? 'plotwall' : 'wall'}" points="${q.map(P).join(' ')}"/>`);
    }
  }

  // Openings
  for (const { o, r } of openings) {
    const sel = selected === o.id ? ' selected' : '';
    const room = h.rooms.find((x) => x.id === o.room);
    const [e0, e1] = edgeOf(room, o.edge);
    const L = Math.hypot(e1[0] - e0[0], e1[1] - e0[1]);
    const ux = (e1[0] - e0[0]) / L, uy = (e1[1] - e0[1]) / L;
    const sgn = signedArea(room.polygon) > 0 ? 1 : -1;
    const inN = [-uy * sgn, ux * sgn]; // normal pointing into the room
    const wall = walls.find((wl) => wl.id === r.wallId) || allWalls.find((wl) => wl.id === r.wallId);
    const t = wall ? wall.thickness / 2 : 0.1;
    if (o.type === 'window') {
      const lines = [-t / 2, t / 2].map((k) => `<line x1="${X(r.a[0] + inN[0] * k)}" y1="${Y(r.a[1] + inN[1] * k)}" x2="${X(r.b[0] + inN[0] * k)}" y2="${Y(r.b[1] + inN[1] * k)}"/>`);
      out.push(`<g data-opening="${esc(o.id)}" class="win${sel}">${lines.join('')}</g>`);
    } else if (o.type === 'door') {
      const dir = (o.swing || 'in-left').startsWith('in') ? 1 : -1;
      const hinge = (o.swing || '').endsWith('right') ? r.b : r.a;
      const other = hinge === r.a ? r.b : r.a;
      const w = v(o.width);
      const tip = [hinge[0] + inN[0] * dir * w, hinge[1] + inN[1] * dir * w];
      const cross = (other[0] - hinge[0]) * (tip[1] - hinge[1]) - (other[1] - hinge[1]) * (tip[0] - hinge[0]);
      const sweep = cross > 0 ? 1 : 0; // SVG y is flipped
      out.push(`<g data-opening="${esc(o.id)}" class="door${sel}"><line x1="${X(hinge[0])}" y1="${Y(hinge[1])}" x2="${X(tip[0])}" y2="${Y(tip[1])}"/>` +
        `<path class="swing" d="M${P(tip)} A${w * S},${w * S} 0 0 ${sweep} ${P(other)}"/></g>`);
    } else {
      const cls = o.type === 'gate' ? 'gate' : 'arch';
      out.push(`<g data-opening="${esc(o.id)}" class="${cls}${sel}"><line x1="${X(r.a[0])}" y1="${Y(r.a[1])}" x2="${X(r.b[0])}" y2="${Y(r.b[1])}"/></g>`);
    }
  }

  // Labels
  for (const r of rooms) {
    const b = bbox(r.polygon);
    let cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
    if (r.id === 'walk-w') cx = (b.minX + 1.1) / 2;
    const est = r.estimate && r.estimate.confidence !== 'high' ? ' class="est"' : '';
    const narrow = b.maxX - b.minX < 1.6 || b.maxY - b.minY < 1.6;
    const lines = [`<text class="nm" x="${X(cx)}" y="${Y(cy) - (dims ? 14 : -10)}"${narrow ? ' font-size="22"' : ''}>${esc(r.name)}</text>`];
    if (dims && r.kind === 'indoor') {
      const c = clearSize(r, allWalls);
      const area = r.polygon.length === 4 ? c.w * c.d : roomArea(r);
      lines.push(`<text class="dm" x="${X(cx)}" y="${Y(cy) + 16}"><tspan${est}>${f1(c.w)} × ${f1(c.d)} m</tspan></text>`);
      lines.push(`<text class="dm" x="${X(cx)}" y="${Y(cy) + 42}"><tspan${est}>${f1(area)} m²</tspan></text>`);
    }
    out.push(`<g data-room="${esc(r.id)}" class="room label" pointer-events="none">${lines.join('')}</g>`);
  }

  // Photo pins
  if (pins) {
    for (const p of h.photos || []) {
      const hd = typeof p.heading === 'number' && Number.isFinite(p.heading) ? p.heading : null;
      let cone = '';
      if (hd !== null) {
        const r = 0.8, a0 = ((hd - 30) * Math.PI) / 180, a1 = ((hd + 30) * Math.PI) / 180;
        const q0 = [p.x + r * Math.sin(a0), p.y + r * Math.cos(a0)], q1 = [p.x + r * Math.sin(a1), p.y + r * Math.cos(a1)];
        cone = `<path d="M${P([p.x, p.y])} L${P(q0)} A${r * S},${r * S} 0 0 1 ${P(q1)} Z"/>`;
      }
      out.push(`<g data-photo="${esc(p.file)}" class="pin"><title>${esc(p.file)}</title>${cone}<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="12"/></g>`);
    }
  }

  // North arrow and scale bar (bottom-left margin)
  const nd = v(h.northDeg) || 0;
  const ax = 100, ay = H - 100;
  out.push(`<g id="north-arrow" transform="translate(${ax},${ay}) rotate(-${nd})"><path d="M0,-50 L16,20 L0,8 L-16,20 Z" fill="#2c2c2a"/><text x="0" y="-60" font-size="26" text-anchor="middle" fill="#2c2c2a">N</text></g>`);
  const sx = 180, sy = H - 50;
  out.push(`<g id="scale-bar"><rect x="${sx}" y="${sy}" width="${S}" height="10" fill="#2c2c2a"/><rect x="${sx + S}" y="${sy}" width="${S}" height="10" fill="#fff" stroke="#2c2c2a" stroke-width="2"/>` +
    `<text x="${sx}" y="${sy - 8}" font-size="20" fill="#2c2c2a">0</text><text x="${sx + 2 * S}" y="${sy - 8}" font-size="20" fill="#2c2c2a" text-anchor="middle">2 m</text></g>`);
  out.push('</svg>');
  return out.join('\n');
}
