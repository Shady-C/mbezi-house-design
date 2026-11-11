// Edit tab: correct estimated sizes; changes flow to plan and 3D. Saved in this browser.
import { renderPlan, clearSize, esc } from './src/plan/plan-svg.js';
import { applyEdit, importHouse, sideWall, houseRooms } from './src/editor/edits.js';
import { deriveWalls, edgeOf, bbox, v } from './src/model/geometry.js';

const $ = (s) => document.querySelector(s);
const KEY = 'mbezi-house-edits-v2'; // {base: hash of the published house.json, house}
let app, original, baseHash, selected = null, downloads = null;
const sides = { w: 'east', d: 'north' };

const store = {
  get() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } },
  set(h) { try { localStorage.setItem(KEY, JSON.stringify({ base: baseHash, house: h })); } catch { /* storage unavailable */ } },
  clear() { try { localStorage.removeItem(KEY); localStorage.removeItem('mbezi-house-edits-v1'); } catch { /* ignore */ } },
};

function hash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function markup() {
  $('#view-edit').innerHTML = `
  <div class="bar">
    <button class="btn" id="copy-json">Copy house.json</button>
    <button class="btn" id="dl-json" hidden>Download house.json</button>
    <label class="btn" style="cursor:pointer">Load house.json<input type="file" id="load-file" accept=".json,application/json" hidden></label>
    <button class="btn" id="reset-json">Reset to photo estimates</button>
    <span class="note" id="saved-note"></span>
  </div>
  <div id="stale-edits" class="card" style="padding:10px 12px;margin-bottom:10px" hidden>
    You have size edits saved from an earlier version of the house data, so they were not applied.
    <button class="btn" id="stale-use">Use my saved edits</button> <button class="btn" id="stale-drop">Discard them</button>
  </div>
  <div id="edit-errors" hidden role="alert"></div>
  <div class="plan-split">
    <div class="card plan-wrap" id="edit-svg"></div>
    <div class="card edit-panel" id="edit-panel"></div>
  </div>`;
}

function draw() {
  $('#edit-svg').innerHTML = renderPlan(app.house, { mode: 'site', dims: true, pins: false, selected });
  panel();
}

const num = (id, labelText, value) =>
  `<div class="field"><label for="${id}">${labelText}</label><input id="${id}" type="number" step="0.05" min="0" inputmode="decimal" value="${value}"></div>`;
const choice = (id, opts, cur) =>
  `<select id="${id}">${opts.map(([val, txt]) => `<option value="${val}"${val === cur ? ' selected' : ''}>${txt}</option>`).join('')}</select>`;

function panel() {
  const p = $('#edit-panel');
  const h = app.house;
  const room = h.rooms.find((r) => r.id === selected);
  const op = h.openings.find((o) => o.id === selected);
  if (room && room.kind === 'indoor') {
    const c = clearSize(room, deriveWalls(h));
    p.innerHTML = `<h3>${esc(room.name)}</h3>
      <p class="note">Clear sizes, wall face to wall face. ${room.estimate?.edited ? 'Edited by you.' : `Estimated (${esc(room.estimate?.confidence || 'low')} confidence).`}</p>
      ${num('f-width', 'Width, west–east (m)', c.w.toFixed(2))}
      <div class="field"><span class="note">Change width by moving</span>${choice('f-wside', [['east', 'east wall'], ['west', 'west wall']], sides.w)}</div>
      ${num('f-depth', 'Depth, front–back (m)', c.d.toFixed(2))}
      <div class="field"><span class="note">Change depth by moving</span>${choice('f-dside', [['north', 'back wall'], ['south', 'front wall']], sides.d)}</div>
      ${room.ceiling.type !== 'none' ? num('f-ceiling', 'Ceiling height (m)', v(room.ceiling.height).toFixed(2)) : ''}
      <p class="note">Moving a wall also resizes the rooms on its other side; fittings against it move with it.</p>`;
    $('#f-wside').addEventListener('change', (e) => { sides.w = e.target.value; });
    $('#f-dside').addEventListener('change', (e) => { sides.d = e.target.value; });
    bind('#f-width', (val) => moveSide(room, sides.w, val - c.w));
    bind('#f-depth', (val) => moveSide(room, sides.d, val - c.d));
    bind('#f-ceiling', (val) => commit({ kind: 'ceiling', roomId: room.id, height: val }));
  } else if (op) {
    const r = h.rooms.find((x) => x.id === op.room);
    const [a, b] = edgeOf(r, op.edge);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    p.innerHTML = `<h3>${esc(op.type[0].toUpperCase() + op.type.slice(1))}: ${esc(op.id)}</h3>
      <p class="note">On a ${L.toFixed(2)} m wall of ${esc(r.name)}.</p>
      ${num('f-owidth', 'Width (m)', v(op.width).toFixed(2))}
      ${num('f-offset', 'Distance from wall end (m)', v(op.offset).toFixed(2))}
      ${num('f-oheight', 'Height (m)', v(op.height).toFixed(2))}
      ${op.type === 'window' ? num('f-sill', 'Sill height (m)', v(op.sill).toFixed(2)) : ''}`;
    bind('#f-owidth', (val) => commit({ kind: 'opening', id: op.id, width: val }));
    bind('#f-offset', (val) => commit({ kind: 'opening', id: op.id, offset: val }));
    bind('#f-oheight', (val) => commit({ kind: 'opening', id: op.id, height: val }));
    bind('#f-sill', (val) => commit({ kind: 'opening', id: op.id, sill: val }));
  } else if (room) {
    const pb = bbox(h.plot.polygon);
    const hb = bbox(houseRooms(h).filter((r) => r.kind === 'indoor').flatMap((r) => r.polygon));
    const w = pb.maxX - pb.minX, d = pb.maxY - pb.minY;
    const park = hb.minY - pb.minY, west = hb.minX - pb.minX;
    p.innerHTML = `<h3>${esc(room.name)}</h3><p class="note">Walkways and parking follow the house and the compound wall. Move the house within the plot, or resize the plot.</p>
      ${num('f-parking', 'Parking depth: house front to front wall (m)', park.toFixed(2))}
      ${num('f-westwalk', 'West side: house wall to compound wall (m)', west.toFixed(2))}
      ${num('f-plotw', 'Plot width, inside the wall (m)', w.toFixed(2))}
      ${num('f-plotd', 'Plot depth, inside the wall (m)', d.toFixed(2))}
      <p class="note">Changing the plot width or depth moves the east or back compound wall; the outside W/C moves with the back wall.</p>`;
    bind('#f-parking', (val) => commit({ kind: 'moveHouse', dx: 0, dy: val - park }));
    bind('#f-westwalk', (val) => commit({ kind: 'moveHouse', dx: val - west, dy: 0 }));
    bind('#f-plotw', (val) => commit({ kind: 'moveWall', wallId: plotSide('east'), delta: val - w }));
    bind('#f-plotd', (val) => commit({ kind: 'moveWall', wallId: plotSide('north'), delta: val - d }));
  } else {
    p.innerHTML = '<h3>Edit sizes</h3><p class="note">Tap a room, door or window on the plan to correct its size, or tap the parking or a walkway to place the house in the plot. Changes update the plan and the 3D model straight away and are kept in this browser.</p>';
  }
}

function plotSide(side) {
  const pb = app.house.plot.polygon;
  const axis = side === 'east' ? 0 : 1;
  const c = Math.max(...pb.map((q) => q[axis]));
  return deriveWalls(app.house).find((w) => w.plot && Math.abs(w.a[axis] - c) < 1e-6 && Math.abs(w.b[axis] - c) < 1e-6).id;
}

function bind(sel, fn) {
  const el = $(sel);
  if (!el) return;
  let done = false; // Enter and the browser's own change event can both fire; apply each field once.
  el.addEventListener('change', () => {
    if (done) return;
    const val = parseFloat(el.value);
    if (!Number.isFinite(val)) return showErrors(['Enter a number']);
    done = true;
    fn(val);
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.dispatchEvent(new Event('change')); } });
}

function moveSide(room, side, delta) {
  if (Math.abs(delta) < 0.005) return;
  const wallId = sideWall(app.house, room.id, side);
  if (!wallId) return showErrors([`${room.name} has no ${side} wall to move`]);
  const sign = side === 'east' || side === 'north' ? 1 : -1;
  commit({ kind: 'moveWall', wallId, delta: sign * delta });
}

function showErrors(errs) {
  const box = $('#edit-errors');
  box.hidden = !errs.length;
  box.innerHTML = errs.length ? `<strong>Not changed:</strong> ${errs.map(esc).join('; ')}` : '';
}

// Show the new house first; keep it (and save it) only if everything rendered.
function setHouse(h, note) {
  const prev = app.house;
  try {
    app.house = h;
    app.refresh();
  } catch (e) {
    app.house = prev;
    try { app.refresh(); } catch { /* keep going with the old house */ }
    showErrors([`Couldn't show that house: ${e.message}`]);
    return false;
  }
  store.set(h);
  $('#saved-note').textContent = note;
  return true;
}

function commit(edit) {
  const { house, errors } = applyEdit(app.house, edit);
  if (errors.length) { showErrors(errors); panel(); return; }
  showErrors([]);
  setHouse(house, 'Saved in this browser.');
}

async function wireButtons() {
  $('#copy-json').addEventListener('click', async () => {
    const t = JSON.stringify(app.house, null, 1);
    try { await navigator.clipboard.writeText(t); $('#saved-note').textContent = 'Copied house.json to the clipboard.'; }
    catch { $('#saved-note').textContent = 'Copy was blocked by the browser.'; }
  });
  $('#reset-json').addEventListener('click', () => {
    store.clear();
    selected = null;
    showErrors([]);
    $('#stale-edits').hidden = true;
    app.house = structuredClone(original);
    $('#saved-note').textContent = 'Back to the photo estimates.';
    app.refresh();
  });
  $('#load-file').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const { house, errors } = importHouse(await f.text());
    e.target.value = '';
    if (errors.length) return showErrors(errors.length > 6 ? [...errors.slice(0, 6), `and ${errors.length - 6} more`] : errors);
    showErrors([]);
    selected = null;
    setHouse(house, `Loaded ${f.name}.`);
  });
  $('#dl-json').addEventListener('click', async () => {
    try { await downloads.save({ filename: 'house.json', data: JSON.stringify(app.house, null, 1) }); }
    catch { $('#saved-note').textContent = 'Download was declined or unavailable; use Copy instead.'; }
  });
  if (window.claude && typeof window.claude.use === 'function') {
    try { downloads = await window.claude.use('downloads'); } catch { downloads = null; }
    $('#dl-json').hidden = !downloads;
  }
}

export function init(a) {
  app = a;
  original = structuredClone(app.house);
  baseHash = hash(JSON.stringify(original));
  markup();
  const saved = store.get();
  let stale = null;
  if (saved) {
    const { house } = saved.house ? importHouse(JSON.stringify(saved.house)) : { house: null };
    if (house && saved.base === baseHash) { app.house = house; $('#saved-note').textContent = 'Showing your edited sizes.'; }
    else if (house) stale = house;
    else store.clear();
  }
  if (stale) {
    $('#stale-edits').hidden = false;
    $('#stale-use').addEventListener('click', () => { $('#stale-edits').hidden = true; setHouse(stale, 'Using your earlier saved edits.'); });
    $('#stale-drop').addEventListener('click', () => { $('#stale-edits').hidden = true; store.clear(); });
  }
  $('#edit-svg').addEventListener('click', (e) => {
    const g = e.target.closest('[data-opening], [data-room]');
    if (!g) return;
    selected = g.dataset.opening || g.dataset.room;
    showErrors([]);
    draw();
  });
  (app.onRefresh ||= []).push(draw);
  draw();
  wireButtons();
  if (app.house !== original) app.refresh();
}
