import { generate as dust } from './dust.ts';
import { loadSvgMask, type SampledMask } from './mask.ts';

let indiaMask: SampledMask | null = null;
let indiaLoad: Promise<void> | null = null;

export function loadIndiaData(): Promise<void> {
  if (!indiaLoad) {
    indiaLoad = loadSvgMask('/shapes/india.svg', 'india').then((mask) => { indiaMask = mask; }).catch((error: unknown) => {
      console.warn('[ParticleEngine] public/shapes/india.svg unavailable; india uses the dust fallback.', error);
    });
  }
  return indiaLoad;
}

/** Sample the supplied official outline, emphasizing its edge and Delhi NCR. */
export function generate(count: number, seeds?: Float32Array): Float32Array {
  if (!indiaMask?.length) return dust(count, seeds);
  const mask = indiaMask;
  const pixels = mask.length / 2;
  const occupied = new Set(mask.pixelIndices);
  const edge: number[] = [], interior: number[] = [];
  for (let i = 0; i < pixels; i++) {
    const pixel = mask.pixelIndices[i];
    const x = pixel % mask.canvasWidth;
    const boundary = x === 0 || x === mask.canvasWidth - 1 || !occupied.has(pixel - 1) || !occupied.has(pixel + 1) || !occupied.has(pixel - mask.canvasWidth) || !occupied.has(pixel + mask.canvasWidth);
    (boundary ? edge : interior).push(i);
  }
  const points = new Float32Array(Math.max(0, count) * 3);
  for (let i = 0; i < count; i++) {
    const seed = seeds?.[i] ?? (i + 0.5) / Math.max(1, count);
    const edgeSample = seed < 0.38;
    const list = edgeSample && edge.length ? edge : interior.length ? interior : edge;
    const pick = Math.floor((((seed * 0.618033989 + i * 0.754877666) % 1) * list.length));
    const source = list[Math.min(list.length - 1, pick)] ?? 0;
    const x = mask[source * 2];
    const y = mask[source * 2 + 1];
    points[i * 3] = x;
    points[i * 3 + 1] = y;
    points[i * 3 + 2] = (seed * 17.13 % 1 - 0.5) * 0.04;
  }
  // A compact bright marker cloud near Delhi NCR is stable across morph frames.
  for (let i = 0; i < count; i++) {
    const seed = seeds?.[i] ?? (i + 0.5) / Math.max(1, count);
    if (seed > 0.986) {
      points[i * 3] = -0.18 + Math.sin(seed * 913) * 0.035;
      points[i * 3 + 1] = 0.30 + Math.cos(seed * 733) * 0.035;
      points[i * 3 + 2] = 0.052 + (seed * 17.13 % 1 - 0.5) * 0.008;
    }
  }
  return points;
}
