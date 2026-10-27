import { randomFor, seedAt } from './random.ts';

/** Contact-only night sky. Fallback and intro dust continue to use shapes/dust.ts. */
export function generate(count: number, seeds?: Float32Array, keep = 1): Float32Array {
  const points = new Float32Array(Math.max(0, count) * 3);
  const bandAngle = 17 * Math.PI / 180;
  for (let i = 0; i < count; i++) {
    const rand = randomFor(seedAt(seeds, i, count), 197);
    let x = 0, y = 0;
    // Rejection-sample a noisy sky so every budget slot contributes a visible
    // point while the field still has natural clusters and quiet gaps.
    for (let attempt = 0; attempt < 48; attempt++) {
      const inBand = rand() < 0.22;
      x = (rand() * 2 - 1) * 3.25;
      if (inBand) {
        const perpendicular = (rand() - 0.5) * 0.74;
        y = Math.tan(bandAngle) * x + perpendicular;
      } else {
        y = (rand() * 2 - 1) * 2.12;
      }
      const noise = 0.5
        + 0.20 * Math.sin(x * 0.82 + Math.sin(y * 0.61))
        + 0.15 * Math.sin(y * 1.55 + x * 1.23)
        + 0.10 * Math.sin(x * 2.8 - y * 2.35);
      const density = Math.max(0.06, Math.min(0.96, noise + (inBand ? 0.12 : 0)));
      const inTextEllipse = (x / 1.42) ** 2 + (y / 0.92) ** 2 < 1;
      if (!inTextEllipse && rand() < density * keep + (1 - keep)) break;
    }
    points[i * 3] = x;
    points[i * 3 + 1] = y;
    points[i * 3 + 2] = (rand() - 0.5) * 0.12;
  }
  return points;
}
