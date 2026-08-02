// Small maths helpers. Nothing clever, just used everywhere.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const lerp = (a, b, t) => a + (b - a) * t;

/** Hermite ramp from 0 at `edge0` to 1 at `edge1`. Works when edge0 > edge1. */
export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Frame-rate independent exponential approach. `rate` is roughly "how many
 * e-foldings per second", so the result is identical at 30 fps and 300 fps.
 */
export const damp = (current, target, rate, dt) =>
  target + (current - target) * Math.exp(-rate * dt);

/**
 * Deterministic integer hash -> [0,1). Used for all placement decisions so a
 * blade of grass or a tree stays exactly where it is as chunks stream in and
 * out. No RNG state, no ordering dependence.
 */
export function hash2i(x, y, salt = 0) {
  let h = Math.imul(x | 0, 0x1f1f1f1f) ^ Math.imul(y | 0, 0x27d4eb2d) ^ Math.imul(salt | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
