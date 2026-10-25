import { randomFor, seedAt } from './random.ts';

/** Dense, slightly airy castle tower with eight merlons and ground range rings. */
export function generate(count: number, seeds?: Float32Array): Float32Array {
  const out = new Float32Array(Math.max(0, count) * 3);
  const randAt = (i: number) => randomFor(seedAt(seeds, i, count), 73);
  for (let i = 0; i < count; i++) {
    const rand = randAt(i), slot = i / Math.max(1, count);
    let x = 0, y = 0, z = (rand() - 0.5) * 0.05;
    if (slot < 0.09) {
      const r = slot < 0.045 ? 0.64 : 0.80;
      const a = rand() * Math.PI * 2;
      x = Math.cos(a) * r; z += Math.sin(a) * r; y = -0.76;
    } else if (slot < 0.2) {
      const merlon = Math.floor(rand() * 8), face = rand();
      const across = (rand() - 0.5) * 0.085;
      x = -0.49 + merlon * 0.14 + across;
      y = 0.54 + rand() * 0.27;
      z = face < 0.48 ? 0.365 + (rand() - 0.5) * 0.035 : face < 0.96 ? -0.365 + (rand() - 0.5) * 0.035 : (rand() - 0.5) * 0.7;
    } else if (slot < 0.92) {
      // Filled tower body with extra weight on its walls and a few narrow slits.
      const yBody = -0.69 + rand() * 1.23;
      const perimeter = rand() < 0.7;
      const side = Math.floor(rand() * 4);
      if (perimeter) {
        const edge = (rand() - 0.5) * 0.035;
        if (side === 0) { x = -0.42 + rand() * 0.84; z = -0.34 + edge; }
        else if (side === 1) { x = -0.42 + rand() * 0.84; z = 0.34 + edge; }
        else { x = (side === 2 ? -0.42 : 0.42) + edge; z = (rand() - 0.5) * 0.68; }
        y = yBody;
      } else { x = (rand() - 0.5) * 0.76; y = yBody; z = (rand() - 0.5) * 0.62; }
      // Keep a few dark-looking gaps by sparsely placing particles around slit openings.
      if (rand() < 0.025) { x = (rand() - 0.5) * 0.42; y = -0.18 + rand() * 0.46; z = 0.355; }
    } else {
      // Airy scatter around the masonry silhouette.
      x = (rand() - 0.5) * 1.08; y = -0.72 + rand() * 1.55; z = (rand() - 0.5) * 0.8;
    }
    out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
  }
  return out;
}
