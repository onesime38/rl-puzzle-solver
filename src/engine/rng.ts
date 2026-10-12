/** Random number generator in `[0, 1)`. */
export type Rng = () => number;

/**
 * Deterministic mulberry32 pseudo-random generator.
 * Used to make training, benchmarking and tests reproducible.
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Returns a seedable RNG when `seed` is defined, `Math.random` otherwise. */
export function resolveRng(seed?: number): Rng {
  return seed === undefined ? Math.random : mulberry32(seed);
}
