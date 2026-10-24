import { randomFor, seedAt } from './random.ts';

/** A wide, flat field with gentle low-frequency holes and density ripples. */
export function generate(count: number, seeds?: Float32Array): Float32Array {
  const points = new Float32Array(Math.max(0, count) * 3);
  for (let i = 0; i < count; i++) {
    const rand = randomFor(seedAt(seeds, i, count), 17);
    let x = 0, y = 0, density = 0;
    for (let tries = 0; tries < 20; tries++) {
      x = (rand() * 2 - 1) * 1.42;
      y = (rand() * 2 - 1) * 0.92;
      const broad = 0.48 + 0.28 * Math.sin(x * 2.4 + 0.7) * Math.cos(y * 2.1 - 0.4);
      const wisps = 0.18 * (0.5 + 0.5 * Math.sin(x * 4.1 + y * 1.6));
      density = broad + wisps;
      if (rand() < density) break;
    }
    points[i * 3] = x;
    points[i * 3 + 1] = y;
    points[i * 3 + 2] = (rand() - 0.5) * 0.12;
  }
  return points;
}
