/** Small randomness helpers used throughout the synthesis code. */

export function rand(min = 0, max = 1): number {
  return min + Math.random() * (max - min);
}

/** Integer in [min, max] (inclusive). */
export function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

export function chance(p: number): boolean {
  return Math.random() < p;
}

export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

/** Log-uniform value in [min, max] — good for frequencies. */
export function logRand(min: number, max: number): number {
  return min * Math.pow(max / min, Math.random());
}

/** Exponentially distributed value with the given mean (Poisson inter-arrival times). */
export function expRand(mean: number): number {
  return -Math.log(1 - Math.random()) * mean;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** v ± (amount * v) */
export function jitter(v: number, amount: number): number {
  return v * (1 + (Math.random() * 2 - 1) * amount);
}

/** Perceptual volume curve: slider value 0..1 → linear gain. */
export function toGain(v: number): number {
  const c = clamp(Number.isFinite(v) ? v : 0, 0, 1);
  return c * c;
}
