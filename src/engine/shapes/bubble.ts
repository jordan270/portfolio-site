import { randomFor, seedAt } from './random.ts';

/** Rounded speech bubble, with a tapered tail in the lower-left corner. */
export function generate(count: number, seeds?: Float32Array): Float32Array {
  const out = new Float32Array(Math.max(0, count) * 3);
  for (let i = 0; i < count; i++) {
    const r = randomFor(seedAt(seeds, i, count), 91);
    let x = 0, y = 0;
    if (r() < 0.19) {
      const a = r() * Math.PI * 2;
      x = Math.cos(a) * (0.69 + (r() - 0.5) * 0.02);
      y = Math.sin(a) * (0.53 + (r() - 0.5) * 0.02);
    } else if (r() < 0.26) {
      const t = r(); x = -0.18 - t * 0.36; y = -0.42 - t * 0.34 + (r() - 0.5) * 0.025;
    } else { x = (r() * 2 - 1) * 0.68; y = (r() * 2 - 1) * 0.51; }
    out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = (r() - 0.5) * 0.045;
  }
  return out;
}
