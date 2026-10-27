import { randomFor, seedAt } from './random.ts';

/** Contact-only night sky. Fallback and intro dust continue to use shapes/dust.ts. */
export function generate(count: number, seeds?: Float32Array, keep = 0.62): Float32Array {
  const points = new Float32Array(Math.max(0, count) * 3);
  for (let i = 0; i < count; i++) {
    const rand = randomFor(seedAt(seeds, i, count), 197);
    const x = (rand() * 2 - 1) * 3.2;
    const y = (rand() * 2 - 1) * 2.05;
    const noise = 0.50
      + 0.22 * Math.sin(x * 1.1 + Math.sin(y * 0.8))
      + 0.16 * Math.sin(y * 2.0 + x * 1.7)
      + 0.12 * Math.sin(x * 3.8 - y * 3.1);
    // The center carries the contact copy; leave it quieter while preserving a
    // few distant stars so the field still reads as a continuous night sky.
    const textQuiet = Math.abs(x) < 1.35 && Math.abs(y) < 1.12;
    const localKeep = Math.max(0.12, Math.min(0.9, keep + (noise - 0.5) * 0.55)) * (textQuiet ? 0.28 : 1);
    const visible = rand() < localKeep;
    points[i * 3] = visible ? x : x + 100;
    points[i * 3 + 1] = y;
    points[i * 3 + 2] = (rand() - 0.5) * 0.12;
  }
  return points;
}
