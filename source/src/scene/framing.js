// Camera framing for the orbit and dollhouse views: the closest camera, from a given compass bearing
// and elevation, that keeps the whole plot (up to `height`) on screen at any aspect ratio.
// Plan (x, y) maps to three (x, h, -y). Returns plain arrays so it runs without three.js.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };

export function framePlot(plot, { fov = 50, aspect = 16 / 9, bearing = 215, elevation = 0.55, height = 6, margin = 0.92 } = {}) {
  const target = [(plot.minX + plot.maxX) / 2, height * 0.25, -(plot.minY + plot.maxY) / 2];
  const b = (bearing * Math.PI) / 180;
  const dir = [Math.sin(b) * Math.cos(elevation), Math.sin(elevation), -Math.cos(b) * Math.cos(elevation)];
  const corners = [];
  for (const x of [plot.minX, plot.maxX]) for (const y of [plot.minY, plot.maxY]) for (const z of [0, height]) corners.push([x, z, -y]);
  const ty = Math.tan((fov * Math.PI) / 360), tx = ty * aspect;
  const fits = (dist) => {
    const pos = target.map((t, i) => t + dir[i] * dist);
    const f = norm(sub(target, pos)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
    return corners.every((c) => {
      const p = sub(c, pos), depth = dot(p, f);
      return depth > 0.1 && Math.abs(dot(p, r) / (depth * tx)) <= margin && Math.abs(dot(p, u) / (depth * ty)) <= margin;
    });
  };
  const size = Math.hypot(plot.maxX - plot.minX, plot.maxY - plot.minY, height);
  let lo = size * 0.1, hi = size * 20;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
  return { position: target.map((t, i) => t + dir[i] * hi), target };
}
