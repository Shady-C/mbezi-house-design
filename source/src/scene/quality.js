// Lowers 3D quality step by step when frames are steadily slow, so weak phones stay usable.
// Never raises it again in the same session, to avoid flickering between levels.
export const QUALITY_LEVELS = [
  { pixelRatio: 2, shadows: true },     // capped at the device's own pixel ratio by the viewer
  { pixelRatio: 1, shadows: true },
  { pixelRatio: 1, shadows: false },
  { pixelRatio: 0.75, shadows: false },
];

const WINDOW = 30;   // frames per judgement
const SLOW_MS = 40;  // median frame time above this (under 25 fps) counts as slow

export function createQualityGovernor() {
  let samples = [];
  const q = {
    level: 0,
    // Feed the time between two consecutive drawn frames. Returns true when the level changed.
    sample(ms) {
      samples.push(ms);
      if (samples.length < WINDOW) return false;
      const median = [...samples].sort((a, b) => a - b)[WINDOW >> 1];
      samples = [];
      if (median > SLOW_MS && q.level < QUALITY_LEVELS.length - 1) { q.level++; return true; }
      return false;
    },
    get settings() { return QUALITY_LEVELS[q.level]; },
  };
  return q;
}
