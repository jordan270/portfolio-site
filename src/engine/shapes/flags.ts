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

/** Draw uniformly from the silhouette with Poisson-disc spacing and a local density cap. */
export function generate(count: number, seeds?: Float32Array): Float32Array {
  if (!flagsMask?.pixelIndices.length) return dust(count, seeds);
  const mask = flagsMask;
  const total = Math.max(0, Math.floor(count));
  const out = new Float32Array(total * 3);
  if (!total) return out;

  const widthScale = flagsWidthScale(mask);
  const pixels = mask.pixelIndices;
  const candidates = Array.from(pixels, (pixel, index) => ({ pixel, index, rank: hash(pixel + 1) }));
  candidates.sort((a, b) => a.rank - b.rank);
  const binsAcross = 16, binsDown = 16;
  const binCounts = new Uint32Array(binsAcross * binsDown);
  const binCapacity = new Uint32Array(binCounts.length);
  const bounds = maskBounds(mask);
  const binWidth = (bounds.maxX - bounds.minX + 1) / binsAcross;
  const binHeight = (bounds.maxY - bounds.minY + 1) / binsDown;
  for (const pixel of pixels) {
    const x = pixel % mask.canvasWidth, y = Math.floor(pixel / mask.canvasWidth);
    const bin = binIndex(x, y, bounds, binWidth, binHeight, binsAcross, binsDown);
    binCapacity[bin]++;
  }
  // Cap each coarse neighborhood at 1.3x its area-proportional share.
  for (let bin = 0; bin < binCapacity.length; bin++) {
    binCapacity[bin] = binCapacity[bin] ? Math.max(1, Math.floor(total * binCapacity[bin] / pixels.length * 1.3)) : 0;
  }

  const spacing = Math.max(0.5, Math.sqrt(pixels.length / total / Math.PI) * 0.72);
  let selected = selectPoisson(candidates, total, spacing, mask.canvasWidth, binCounts, binCapacity, bounds, binWidth, binHeight, binsAcross, binsDown);
  // At very high particle counts, relax spacing in small steps while retaining the density cap.
  for (let attempt = 1; selected.length < total && attempt <= 12; attempt++) {
    binCounts.fill(0);
    selected = selectPoisson(candidates, total, spacing * (1 - attempt * 0.065), mask.canvasWidth, binCounts, binCapacity, bounds, binWidth, binHeight, binsAcross, binsDown);
  }
  // Deterministic, area-uniform fill for unusual masks where the spacing pass cannot reach count.
  if (selected.length < total) {
    const used = new Set(selected);
    for (const candidate of candidates) {
      if (selected.length >= total) break;
      if (used.has(candidate.index)) continue;
      const x = candidate.pixel % mask.canvasWidth, y = Math.floor(candidate.pixel / mask.canvasWidth);
      const bin = binIndex(x, y, bounds, binWidth, binHeight, binsAcross, binsDown);
      if (binCounts[bin] >= binCapacity[bin]) continue;
      selected.push(candidate.index); used.add(candidate.index); binCounts[bin]++;
    }
  }

  for (let i = 0; i < total; i++) {
    const source = selected[i] ?? candidates[i % candidates.length].index;
    const pixel = pixels[source];
    out[i * 3] = mask[source * 2] * widthScale;
    out[i * 3 + 1] = mask[source * 2 + 1] * widthScale;
    const seed = seeds?.[i] ?? (i + 0.5) / total;
    out[i * 3 + 2] = (hash((pixel + 1) * 13 + seed * 65535) * 2 - 1) * 0.02;
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

function selectPoisson(
  candidates: { pixel: number; index: number; rank: number }[], count: number, radius: number, width: number,
  binCounts: Uint32Array, binCapacity: Uint32Array, bounds: { minX: number; minY: number; maxX: number; maxY: number },
  binWidth: number, binHeight: number, binsAcross: number, binsDown: number,
): number[] {
  const cellSize = Math.max(0.5, radius / Math.SQRT2);
  const gridWidth = Math.ceil(width / cellSize), grid = new Map<number, number[]>();
  const result: number[] = [];
  const radiusSquared = radius * radius;
  for (const candidate of candidates) {
    if (result.length >= count) break;
    const x = candidate.pixel % width, y = Math.floor(candidate.pixel / width);
    const bin = binIndex(x, y, bounds, binWidth, binHeight, binsAcross, binsDown);
    if (binCounts[bin] >= binCapacity[bin]) continue;
    const gx = Math.floor(x / cellSize), gy = Math.floor(y / cellSize);
    let clear = true;
    for (let dy = -2; dy <= 2 && clear; dy++) for (let dx = -2; dx <= 2 && clear; dx++) {
      for (const other of grid.get((gy + dy) * gridWidth + gx + dx) ?? []) {
        const ox = other % width, oy = Math.floor(other / width);
        if ((x - ox) ** 2 + (y - oy) ** 2 < radiusSquared) { clear = false; break; }
      }
    }
    if (!clear) continue;
    result.push(candidate.index);
    binCounts[bin]++;
    const key = gy * gridWidth + gx;
    const cell = grid.get(key);
    if (cell) cell.push(candidate.pixel); else grid.set(key, [candidate.pixel]);
  }
  return result;
}

function maskBounds(mask: SampledMask) {
  let minX = mask.canvasWidth, minY = mask.canvasHeight, maxX = 0, maxY = 0;
  for (const pixel of mask.pixelIndices) {
    const x = pixel % mask.canvasWidth, y = Math.floor(pixel / mask.canvasWidth);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

function binIndex(x: number, y: number, bounds: { minX: number; minY: number }, binWidth: number, binHeight: number, across: number, down: number): number {
  const bx = Math.min(across - 1, Math.floor((x - bounds.minX) / binWidth));
  const by = Math.min(down - 1, Math.floor((y - bounds.minY) / binHeight));
  return by * across + bx;
}

function hash(value: number): number {
  let x = Math.floor(value * 2654435761) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15; x = Math.imul(x, 0x846ca68b); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function flagsWidthScale(mask: SampledMask): number {
  let minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < mask.length / 2; i++) { minX = Math.min(minX, mask[i * 2]); maxX = Math.max(maxX, mask[i * 2]); }
  return 1.5 / Math.max(1e-6, maxX - minX);
}
