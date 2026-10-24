import { randomFor, seedAt } from './random.ts';
import { loadSvgMask, sampleSvgMask } from './mask.ts';
import { generate as dust } from './dust.ts';

let sampledMask: Float32Array | null = null;
let sourceRequest: Promise<void> | null = null;

export function loadSource(): Promise<void> {
  if (!sourceRequest) {
    sourceRequest = loadSvgMask('/assets/f1.svg').then((mask) => { sampledMask = mask; }).catch((error: unknown) => {
      console.warn('[ParticleEngine] assets/f1.svg unavailable; using the F1 placeholder.', error);
    });
  }
  return sourceRequest;
}

/** Sample the SVG silhouette, or a simple racing-mark placeholder until it loads. */
export function generate(count: number, seeds?: Float32Array): Float32Array {
  if (sampledMask) return sampleSvgMask(sampledMask, count, seeds, 13);
  const points = new Float32Array(Math.max(0, count) * 3);
  for (let i = 0; i < count; i++) {
    const rand = randomFor(seedAt(seeds, i, count), 59);
    const bar = rand();
    let x: number, y: number;
    if (bar < 0.4) {
      x = -0.68 + rand() * 1.35;
      y = 0.46 + (rand() - 0.5) * 0.15;
    } else if (bar < 0.67) {
      x = -0.56 + rand() * 1.2;
      y = 0.08 + (rand() - 0.5) * 0.13;
    } else if (bar < 0.88) {
      x = -0.41 + rand() * 0.98;
      y = -0.29 + (rand() - 0.5) * 0.13;
    } else {
      const t = rand();
      x = 0.68 - t * 0.98 + (rand() - 0.5) * 0.12;
      y = -0.55 + t * 1.06 + (rand() - 0.5) * 0.1;
    }
    points[i * 3] = x * 1.2;
    points[i * 3 + 1] = y * 1.2;
    points[i * 3 + 2] = (rand() - 0.5) * 0.06;
  }
  return points;
}

export { dust as fallbackDust };
