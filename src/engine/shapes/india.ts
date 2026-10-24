import { generate as dust } from './dust.ts';
import { loadSvgMask } from './mask.ts';

let indiaMask: Float32Array | null = null;
let indiaLoad: Promise<void> | null = null;

export function loadIndiaData(): Promise<void> {
  if (!indiaLoad) {
    indiaLoad = loadSvgMask('/shapes/india.svg').then((mask) => { indiaMask = mask; }).catch((error: unknown) => {
      console.warn('[ParticleEngine] public/shapes/india.svg unavailable; india uses the dust fallback.', error);
    });
  }
  return indiaLoad;
}

/** Sample the supplied official outline, emphasizing its edge and Delhi NCR. */
export function generate(count: number, seeds?: Float32Array): Float32Array {
  if (!indiaMask?.length) return dust(count, seeds);
  const mask = indiaMask;
  const occupied = new Set<string>();
  const pixels = mask.length / 2;
  const xy = (i: number) => {
    const x = Math.max(0, Math.min(511, Math.round((mask[i * 2] / 1.1 + 1) * 255.5)));
    const y = Math.max(0, Math.min(511, Math.round((1 - mask[i * 2 + 1] / 1.1) * 255.5)));
    return { x, y };
  };
  for (let i = 0; i < pixels; i++) {
    const { x, y } = xy(i);
    occupied.add(`${x},${y}`);
  }
  const edge: number[] = [], interior: number[] = [];
  for (let i = 0; i < pixels; i++) {
    const { x, y } = xy(i);
    const boundary = !occupied.has(`${x - 1},${y}`) || !occupied.has(`${x + 1},${y}`) || !occupied.has(`${x},${y - 1}`) || !occupied.has(`${x},${y + 1}`);
    (boundary ? edge : interior).push(i);
  }
  const points = new Float32Array(Math.max(0, count) * 3);
  for (let i = 0; i < count; i++) {
    const seed = seeds?.[i] ?? (i + 0.5) / Math.max(1, count);
    const edgeSample = seed < 0.38;
    const list = edgeSample && edge.length ? edge : interior.length ? interior : edge;
    const pick = Math.floor((((seed * 0.618033989 + i * 0.754877666) % 1) * list.length));
    const source = list[Math.min(list.length - 1, pick)] ?? 0;
    const x = mask[source * 2] * 1.1;
    const y = mask[source * 2 + 1] * 1.1;
    // Raster coordinates place Delhi at roughly 35% eastward and 72% northward
    // from the silhouette's bounds, a stable local approximation of 28.6N, 77.2E.
    const isDelhi = seed >= 0.965 && Math.hypot(x - (-0.30), y - 0.43) < 0.11;
    points[i * 3] = isDelhi ? -0.30 + (seed - 0.965) * 2.0 : x;
    points[i * 3 + 1] = isDelhi ? 0.43 + Math.sin(i * 12.9898) * 0.055 : y;
    points[i * 3 + 2] = (seed * 17.13 % 1 - 0.5) * 0.04;
  }
  // A compact bright marker cloud near Delhi NCR is stable across morph frames.
  for (let i = 0; i < count; i++) {
    const seed = seeds?.[i] ?? (i + 0.5) / Math.max(1, count);
    if (seed > 0.986) {
      points[i * 3] = -0.30 + Math.sin(seed * 913) * 0.035;
      points[i * 3 + 1] = 0.43 + Math.cos(seed * 733) * 0.035;
      points[i * 3 + 2] = 0.052 + (seed * 17.13 % 1 - 0.5) * 0.008;
    }
  }
  return points;
}
