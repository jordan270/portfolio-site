import { randomFor, seedAt } from './random.ts';

/** Sparse, wide background field. The shader supplies the slow idle drift. */
export function generate(count: number, seeds?: Float32Array): Float32Array {
  const points = new Float32Array(Math.max(0, count) * 3);
  for (let i = 0; i < count; i++) {
    const rand = randomFor(seedAt(seeds, i, count), 17);
    const x = (rand() * 2 - 1) * 3.2;
    const y = (rand() * 2 - 1) * 2.05;
    const keep = 0.2 + 0.14 * (0.5 + 0.5 * Math.sin(x * 1.15 + y * 0.75));
    const sparse = rand() < keep;
    points[i * 3] = sparse ? x : x + 100;
    points[i * 3 + 1] = y;
    points[i * 3 + 2] = (rand() - 0.5) * 0.12;
  }
  return points;
}
