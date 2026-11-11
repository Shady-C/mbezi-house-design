// Test helpers shared by the unit tests.
import { readFileSync } from 'node:fs';

export const freshHouse = () => JSON.parse(readFileSync(new URL('../data/house.json', import.meta.url), 'utf8'));

// Rename rooms everywhere they are referenced, to prove nothing depends on the ids in house.json.
export function renameRooms(h, map) {
  const to = (id) => map[id] ?? id;
  for (const r of h.rooms) r.id = to(r.id);
  for (const o of h.openings) o.room = to(o.room);
  for (const f of h.fixtures || []) f.room = to(f.room);
  for (const p of h.photos || []) p.room = to(p.room);
  return h;
}

export const RENAMED = { parking: 'yard', 'walk-w': 'side-a', 'walk-e': 'side-b', 'walk-n': 'back', porch: 'veranda', owc: 'shed' };
