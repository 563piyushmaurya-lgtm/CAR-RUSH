// Small math helpers used all over the game.

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export const lerp = (a, b, t) => a + (b - a) * t;

export const rand = (min, max) => min + Math.random() * (max - min);

export const randInt = (min, max) => Math.floor(rand(min, max + 1));

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Frame-rate independent smoothing.
 * Moves `current` towards `target`; higher `lambda` = snappier.
 * Unlike a plain lerp, it behaves the same at 30 FPS and 144 FPS.
 */
export const damp = (current, target, lambda, dt) =>
  current + (target - current) * (1 - Math.exp(-lambda * dt));

/** Returns a shuffled copy of an array (Fisher-Yates). */
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Picks an item using its `weight` property (bigger weight = more common). */
export function weightedPick(items) {
  const total = items.reduce((sum, it) => sum + it.weight, 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}
