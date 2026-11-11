// Photos tab (pins + lightbox) and the 3D "Photos here" strip.
import { renderPlan, esc } from './src/plan/plan-svg.js';
import { nearestPhotos } from './src/model/geometry.js';

const $ = (s) => document.querySelector(s);
let app, idx = -1;

const src = (file, thumb = false) => `./photos/${thumb ? 'thumbs/' : ''}${file}.jpg`;
const roomName = (id) => (app.house.rooms.find((r) => r.id === id) || {}).name || id;

function draw() {
  $('#photos-svg').innerHTML = renderPlan(app.house, { mode: 'site', dims: false, pins: true, selected: null });
  // Bigger invisible tap targets for phones.
  for (const g of document.querySelectorAll('#photos-svg .pin')) {
    const c = g.querySelector('circle');
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    hit.setAttribute('cx', c.getAttribute('cx'));
    hit.setAttribute('cy', c.getAttribute('cy'));
    hit.setAttribute('r', '34');
    hit.setAttribute('fill', 'transparent');
    hit.setAttribute('stroke', 'none');
    g.appendChild(hit);
  }
}

export function openPhoto(file) {
  const photos = app.house.photos;
  idx = photos.findIndex((p) => p.file === file);
  if (idx < 0) return;
  showIdx();
  $('#lightbox').hidden = false;
  $('#lb-close').focus();
}

function showIdx() {
  const photos = app.house.photos;
  idx = (idx + photos.length) % photos.length;
  const p = photos[idx];
  $('#lb-img').src = src(p.file);
  $('#lb-img').alt = `${p.file}, ${roomName(p.room)}`;
  $('#lb-cap').textContent = `${p.file} · ${roomName(p.room)} · ${idx + 1} of ${photos.length}`;
  for (const g of document.querySelectorAll('#photos-svg .pin')) g.classList.toggle('current', g.dataset.photo === p.file);
}

const close = () => { $('#lightbox').hidden = true; };

export function init(a) {
  app = a;
  draw();
  (app.onRefresh ||= []).push(draw);
  $('#photos-svg').addEventListener('click', (e) => {
    const g = e.target.closest('[data-photo]');
    if (g) openPhoto(g.dataset.photo);
  });
  $('#lb-prev').addEventListener('click', () => { idx--; showIdx(); });
  $('#lb-next').addEventListener('click', () => { idx++; showIdx(); });
  $('#lb-close').addEventListener('click', close);
  $('#lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox') close(); });
  window.addEventListener('keydown', (e) => {
    if ($('#lightbox').hidden) return;
    if (e.key === 'ArrowRight') { idx++; showIdx(); }
    else if (e.key === 'ArrowLeft') { idx--; showIdx(); }
    else if (e.key === 'Escape') close();
  });
  $('#photos-here').addEventListener('click', () => {
    const v = app.viewer;
    if (!v) return;
    const near = nearestPhotos(app.house, v.getPlanPosition(), 3);
    $('#nearby').innerHTML = near.map((p) => `<img src="${esc(src(p.file, true))}" alt="${esc(p.file)}, ${esc(roomName(p.room))}" data-file="${esc(p.file)}" title="${esc(p.file)}">`).join('');
  });
  $('#nearby').addEventListener('click', (e) => { const f = e.target.dataset && e.target.dataset.file; if (f) openPhoto(f); });
}
