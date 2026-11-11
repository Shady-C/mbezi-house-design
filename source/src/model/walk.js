// First-person walking: one movement step, with wall collision. Pure, so it runs in Node and the browser.
import { collide } from './geometry.js';

export const RADIUS = 0.25, SPEED = 1.4, TURN = 1.8; // m, m/s, rad/s
export const MAX_DT = 0.25; // longest step taken from one frame; longer pauses (tab switched away) are dropped

const dirOf = (bearing) => { const b = (bearing * Math.PI) / 180; return [Math.sin(b), Math.cos(b)]; };

// Moves `pose` by `input` over `dt` seconds. Movement is split into 5 cm sub-steps so a slow frame
// covers the same ground as several fast ones without passing through walls.
export function walkStep(pose, input, dt, walls, gaps) {
  dt = Math.min(Math.max(dt, 0), MAX_DT);
  const bearing = (pose.bearing + input.turn * TURN * (180 / Math.PI) * dt + 360) % 360;
  const [fx, fy] = dirOf(bearing);
  const mx = (fx * input.forward + fy * input.strafe) * SPEED * dt;
  const my = (fy * input.forward - fx * input.strafe) * SPEED * dt;
  const n = Math.max(1, Math.ceil(Math.hypot(mx, my) / 0.05));
  let p = pose.p;
  for (let i = 0; i < n; i++) p = collide([p[0] + mx / n, p[1] + my / n], RADIUS, walls, gaps);
  return { ...pose, p: [...p], bearing };
}
