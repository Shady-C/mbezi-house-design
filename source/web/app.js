// Page wiring: tabs, plan, 3D viewer, photos, editor.
import { renderPlan, clearSize, esc } from './src/plan/plan-svg.js';
import { deriveWalls } from './src/model/geometry.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = { house: null, viewer: null, planMode: 'floor' };
window.app = app;

// ---------- Tabs (hash routing: #plan #model #photos #edit) ----------
const VIEWS = { plan: 'view-plan', model: 'view-3d', photos: 'view-photos', edit: 'view-edit' };
function show(view) {
  if (!VIEWS[view]) view = 'plan';
  for (const [k, id] of Object.entries(VIEWS)) $('#' + id).hidden = k !== view;
  for (const b of $$('nav button')) b.setAttribute('aria-selected', String(b.dataset.view === view));
  if (view === 'model') ensureViewer();
  app.onShow?.[view]?.();
}
for (const b of $$('nav button')) b.addEventListener('click', () => { history.replaceState(null, '', '#' + b.dataset.view); show(b.dataset.view); });
window.addEventListener('hashchange', () => show(location.hash.slice(1)));

// ---------- Plan ----------
export function drawPlan() {
  $('#plan-svg').innerHTML = renderPlan(app.house, { mode: app.planMode, dims: true, pins: false, selected: null });
  const walls = deriveWalls(app.house);
  $('#estimates tbody').innerHTML = app.house.rooms.filter((r) => r.kind === 'indoor').map((r) => {
    const c = clearSize(r, walls);
    const e = r.estimate || {};
    const conf = ['high', 'medium', 'low'].includes(e.confidence) ? e.confidence : '';
    return `<tr><td>${esc(r.name)}</td><td class="num">${c.w.toFixed(1)} × ${c.d.toFixed(1)} m <span class="conf ${conf}">${e.edited ? 'edited' : conf}</span></td><td>${esc(e.note || '')}</td></tr>`;
  }).join('');
}
for (const b of $$('#plan-mode button')) b.addEventListener('click', () => {
  app.planMode = b.dataset.plan;
  for (const x of $$('#plan-mode button')) x.setAttribute('aria-pressed', String(x === b));
  drawPlan();
});

// ---------- 3D ----------
let viewerMod = null;
async function ensureViewer() {
  if (app.viewer || app.viewerFailed) return app.viewer;
  const fail = (html, e) => {
    app.viewerFailed = true;
    $('#stage').innerHTML = `<div id="webgl-msg">${html} The plan, photos and size editor still work.</div>`;
    console.warn('3D unavailable:', e && e.message);
  };
  try {
    viewerMod = viewerMod || (await import('./viewer.js'));
  } catch (e) {
    return fail("<strong>The 3D viewer couldn't load</strong> (its 3D library didn't download). Check your connection and reload.", e);
  }
  try {
    if (!viewerMod.webglAvailable()) throw new Error('no webgl');
    app.viewer = viewerMod.createViewer($('#canvas'), app.house);
    wireWalk();
  } catch (e) {
    fail('<strong>3D needs WebGL</strong>, which this browser or device has turned off.', e);
  }
  return app.viewer;
}
app.ensureViewer = ensureViewer;

function setMode(m) {
  const v = app.viewer;
  if (!v) return;
  v.setMode(m);
  for (const x of $$('#mode-seg button')) x.setAttribute('aria-pressed', String(x.dataset.mode === m));
  $('#cut-wrap').hidden = m !== 'dollhouse';
  const touch = matchMedia('(pointer: coarse)').matches;
  $('#joystick').hidden = !(m === 'walk' && touch);
  $('#hint').textContent = m === 'walk'
    ? (touch ? 'Joystick to move · drag to look around' : 'W A S D or arrows to move · drag (or click for mouse-look) to look')
    : 'Drag to rotate · scroll or pinch to zoom';
}
for (const b of $$('#mode-seg button')) b.addEventListener('click', async () => { await ensureViewer(); setMode(b.dataset.mode); });
$('#cut').addEventListener('change', (e) => app.viewer?.setCut(e.target.checked));

function wireWalk() {
  const v = app.viewer, canvas = $('#canvas');
  const keys = new Set();
  const sync = () => {
    v.input.forward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    v.input.strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    v.input.turn = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
  };
  window.addEventListener('keydown', (e) => {
    if (v.mode !== 'walk' || $('#view-3d').hidden || e.target.closest('input')) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) { keys.add(e.code); sync(); e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => { keys.delete(e.code); sync(); });
  window.addEventListener('blur', () => { keys.clear(); sync(); });

  // Drag-to-look (mouse and touch on the canvas).
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { if (v.mode === 'walk') { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); } });
  canvas.addEventListener('pointermove', (e) => {
    if (v.mode === 'walk' && document.pointerLockElement === canvas) { v.look(e.movementX * 0.15, -e.movementY * 0.003); return; }
    if (!drag) return;
    v.look((e.clientX - drag.x) * 0.25, -(e.clientY - drag.y) * 0.005);
    drag = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('dblclick', () => {
    if (v.mode !== 'walk' || !canvas.requestPointerLock) return;
    try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* refused in some viewers */ }
  });

  // Touch joystick.
  const js = $('#joystick'), knob = $('.knob', js);
  let jid = null;
  const move = (e) => {
    const r = js.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const m = Math.hypot(dx, dy), max = r.width / 2 - 10;
    if (m > max) { dx *= max / m; dy *= max / m; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    v.input.forward = -dy / max;
    v.input.strafe = dx / max;
  };
  js.addEventListener('pointerdown', (e) => { jid = e.pointerId; js.setPointerCapture(jid); move(e); });
  js.addEventListener('pointermove', (e) => { if (e.pointerId === jid) move(e); });
  const end = () => { jid = null; knob.style.transform = ''; v.input.forward = 0; v.input.strafe = 0; };
  js.addEventListener('pointerup', end);
  js.addEventListener('pointercancel', end);
}

// ---------- Photos and editor (filled in by their modules) ----------
app.onShow = {};
app.refresh = () => {
  drawPlan();
  app.viewer?.setHouse(app.house);
  for (const f of app.onRefresh || []) f();
};

// ---------- Boot ----------
async function boot() {
  const res = await fetch('./data/house.json');
  app.house = await res.json();
  drawPlan();
  const extras = await Promise.allSettled([import('./photos.js'), import('./editor.js')]);
  for (const r of extras) if (r.status === 'fulfilled') r.value.init?.(app);
  show(location.hash.slice(1) || 'plan');
}
boot();
