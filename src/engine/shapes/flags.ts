import { loadRasterMask, type SampledMask } from './mask.ts';
import { generate as dust } from './dust.ts';

let flagsMask: SampledMask | null = null;
let flagsLoad: Promise<void> | null = null;
let occupiedPixels: Set<number> | null = null;

export function loadFlagsData(): Promise<void> {
  if (!flagsLoad) {
    flagsLoad = loadRasterMask('/assets/flags.png', 'flags', (rgba, offset) => rgba[offset + 3] > 127.5)
      .then((mask) => { flagsMask = mask; occupiedPixels = new Set(mask.pixelIndices); })
      .catch((error: unknown) => console.warn('[ParticleEngine] assets/flags.png unavailable; flags use the dust fallback.', error));
  }
  return flagsLoad;
}

/** Sample only opaque mask pixels, prioritising flag and pole edges over checker squares. */
export function generate(count: number, seeds?: Float32Array): Float32Array {
  if (!flagsMask?.pixelIndices.length) return dust(count, seeds);
  const mask = flagsMask;
  const occupied = occupiedPixels ?? new Set(mask.pixelIndices);
  const edges: number[] = [], poles: number[] = [], squares: number[] = [];
  for (let i = 0; i < mask.pixelIndices.length; i++) {
    const pixel = mask.pixelIndices[i];
    const x = pixel % mask.canvasWidth;
    const y = Math.floor(pixel / mask.canvasWidth);
    const edge = x === 0 || x === mask.canvasWidth - 1 || y === 0 || y === mask.canvasHeight - 1 ||
      !occupied.has(pixel - 1) || !occupied.has(pixel + 1) ||
      !occupied.has(pixel - mask.canvasWidth) || !occupied.has(pixel + mask.canvasWidth);
    const localY = mask[i * 2 + 1];
    if (edge) edges.push(i);
    if (localY < -0.24) poles.push(i);
    else if (!edge) squares.push(i);
  }
  const widthScale = flagsWidthScale(mask);
  const out = new Float32Array(Math.max(0, count) * 3);
  for (let i = 0; i < count; i++) {
    const seed = seeds?.[i] ?? (i + 0.5) / Math.max(1, count);
    const pool = seed < 0.34 && poles.length ? poles : seed < 0.82 && edges.length ? edges : squares.length ? squares : edges;
    const pick = Math.floor((((seed * 0.754877666 + i * 0.569840296) % 1) * pool.length));
    const source = pool[Math.min(pool.length - 1, pick)] ?? 0;
    const x = mask[source * 2] * widthScale;
    const y = mask[source * 2 + 1] * widthScale;
    // Give the two flag planes a small opposing depth slope; keep random depth subtle.
    const side = x < 0 ? -1 : 1;
    const flagTilt = y > -0.18 ? side * (x - side * 0.42) * 0.12 : 0;
    const jitter = (((seed * 17.13) % 1) - 0.5) * 0.06;
    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = flagTilt + jitter;
  }
  return out;
}

/** Return counts for generated points that fail an inverse lookup in the source alpha mask. */
export function verifyMaskSamples(points: Float32Array): { total: number; outside: number } {
  const mask = flagsMask, occupied = occupiedPixels;
  const transform = mask?.sourceTransform;
  if (!mask || !occupied || !transform) return { total: points.length / 3, outside: points.length / 3 };
  const scale = flagsWidthScale(mask);
  let outside = 0;
  for (let i = 0; i < points.length; i += 3) {
    const sourceX = Math.round((points[i] / scale / 1.4) * transform.span + transform.centerX);
    const sourceY = Math.round((-points[i + 1] / scale / 1.4) * transform.span + transform.centerY);
    if (!occupied.has(sourceY * mask.canvasWidth + sourceX)) outside++;
  }
  return { total: points.length / 3, outside };
}

function flagsWidthScale(mask: SampledMask): number {
  let minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < mask.length / 2; i++) { minX = Math.min(minX, mask[i * 2]); maxX = Math.max(maxX, mask[i * 2]); }
  return 1.5 / Math.max(1e-6, maxX - minX);
}

