import { randomFor, seedAt } from './random.ts';

/** Hand lens with a torus rim, sparse glass, upper-left glint, and angled handle. */
export function generate(count: number, seeds?: Float32Array): Float32Array {
  const points = new Float32Array(Math.max(0, count) * 3);
  for (let i = 0; i < count; i++) {
    const rand = randomFor(seedAt(seeds, i, count), 43);
    const kind = rand();
    let x = 0, y = 0, z = 0;
    if (kind < 0.42) {
      const around = rand() * Math.PI * 2;
      const cross = rand() * Math.PI * 2;
      const tube = 0.045 + (rand() - 0.5) * 0.012;
      const radius = 0.55 + Math.cos(cross) * tube;
      x = Math.cos(around) * radius;
      y = Math.sin(around) * radius;
      z = Math.sin(cross) * tube;
    } else if (kind < 0.68) {
      const radius = Math.sqrt(rand()) * 0.49;
      const angle = rand() * Math.PI * 2;
      x = Math.cos(angle) * radius;
      y = Math.sin(angle) * radius;
      z = (rand() - 0.5) * 0.026;
    } else if (kind < 0.76) {
      const angle = 2.18 + rand() * 1.08;
      const radius = 0.55 + (rand() - 0.5) * 0.012;
      x = Math.cos(angle) * radius;
      y = Math.sin(angle) * radius;
      z = 0.025 + (rand() - 0.5) * 0.012;
    } else {
      const along = rand();
      const centerX = 0.49 + along * 0.56;
      const centerY = -0.49 - along * 0.56;
      const side = (rand() - 0.5) * 0.105;
      const depth = (rand() - 0.5) * 0.065;
      const inv = Math.SQRT1_2;
      x = centerX + side * inv + depth * inv;
      y = centerY - side * inv + depth * inv;
      z = -side * inv + (rand() - 0.5) * 0.025;
    }
    points[i * 3] = x * 1.08; points[i * 3 + 1] = y * 1.08; points[i * 3 + 2] = z;
  }
  return points;
}
