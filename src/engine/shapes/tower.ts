import { randomFor, seedAt } from './random.ts';

/** Cylindrical defence tower with eight separated merlons and two ground rings. */
export function generate(count: number, seeds?: Float32Array): Float32Array {
  const points = new Float32Array(Math.max(0, count) * 3);
  for (let i = 0; i < count; i++) {
    const rand = randomFor(seedAt(seeds, i, count), 31);
    const kind = rand();
    let x = 0, y = 0, z = 0;
    if (kind < 0.69) {
      let angle = 0, radius = 0.43;
      for (let tries = 0; tries < 14; tries++) {
        angle = rand() * Math.PI * 2;
        y = -0.68 + rand() * 1.48;
        radius = 0.43 + (rand() - 0.5) * 0.045;
        x = Math.cos(angle) * radius;
        z = Math.sin(angle) * radius;
        const doorway = Math.abs(x) < 0.105 && y < -0.12;
        const leftWindow = Math.abs(x + 0.2) < 0.05 && y > 0.15 && y < 0.46;
        const rightWindow = Math.abs(x - 0.2) < 0.05 && y > 0.15 && y < 0.46;
        if (!doorway && !leftWindow && !rightWindow) break;
      }
    } else if (kind < 0.9) {
      const merlon = Math.floor(rand() * 8);
      const angle = (merlon + (rand() - 0.5) * 0.42) * Math.PI / 4;
      const radius = 0.58 + (rand() - 0.5) * 0.06;
      x = Math.cos(angle) * radius;
      z = Math.sin(angle) * radius;
      y = 0.76 + rand() * 0.24;
    } else if (kind < 0.94) {
      const angle = rand() * Math.PI * 2;
      const radius = 0.57 + (rand() - 0.5) * 0.035;
      x = Math.cos(angle) * radius;
      z = Math.sin(angle) * radius;
      y = 0.76 + (rand() - 0.5) * 0.025;
    } else {
      const ring = rand() < 0.5 ? 0.88 : 1.08;
      const angle = rand() * Math.PI * 2;
      x = Math.cos(angle) * (ring + (rand() - 0.5) * 0.015);
      z = Math.sin(angle) * (ring + (rand() - 0.5) * 0.015);
      y = -0.69 + (rand() - 0.5) * 0.012;
    }
    x += (rand() - 0.5) * 0.018;
    y += (rand() - 0.5) * 0.018;
    z += (rand() - 0.5) * 0.018;
    points[i * 3] = x; points[i * 3 + 1] = y; points[i * 3 + 2] = z;
  }
  return points;
}
