import { randomFor } from './random.ts';
import { loadRasterMask, type SampledMask } from './mask.ts';
import { generate as dust } from './dust.ts';

const POINT_COUNT = 90_000;
let mask: SampledMask | null = null;
let distanceToEdge: Float32Array | null = null;
let sampledFace: Float32Array | null = null;
let faceLoad: Promise<void> | null = null;

export function loadFaceMaskData(): Promise<void> {
  if (!faceLoad) {
    faceLoad = loadRasterMask('/assets/face.png', 'face', (rgba, offset) => rgba[offset + 3] > 127.5)
      .then((loaded) => {
        mask = loaded;
        const transform = loaded.sourceTransform!;
        const neckX = (loaded.canvasWidth / 2 - transform.centerX) / transform.span * 1.4;
        for (let i = 0; i < loaded.length; i += 2) loaded[i] -= neckX;
        distanceToEdge = makeDistanceField(loaded);
        sampledFace = null;
      })
      .catch((error: unknown) => {
        faceLoad = null;
        console.warn('[ParticleEngine] assets/face.png unavailable; face uses the dust fallback.', error);
      });
  }
  return faceLoad;
}

/** Uniform-area Poisson-disc samples with a thin, denser edge band. */
export function generate(count: number, seeds?: Float32Array): Float32Array {
  if (!mask || !distanceToEdge || !mask.pixelIndices.length) return dust(count, seeds);
  if (!sampledFace) sampledFace = sampleFace(POINT_COUNT);
  const points = new Float32Array(Math.max(0, count) * 3);
  for (let i = 0; i < count; i++) {
    const seed = seeds?.[i] ?? (i + 0.5) / Math.max(1, count);
    const source = Math.min(POINT_COUNT - 1, Math.floor(seed * POINT_COUNT));
    points.set(sampledFace.subarray(source * 3, source * 3 + 3), i * 3);
  }
  return points;
}

function sampleFace(total: number): Float32Array {
  if (!mask || !distanceToEdge) return new Float32Array(total * 3);
  const edgeCount = Math.round(total * 0.08);
  const interiorCount = total - edgeCount;
  const rand = randomFor(0.417, 711);
  const interior = poissonSamples(mask, interiorCount, distanceToEdge, rand);
  const edge = edgeSamples(mask, distanceToEdge, edgeCount, rand);
  const points = new Float32Array(total * 3);
  const transform = mask.sourceTransform!;
  const centerX = mask.canvasWidth / 2;
  const bboxCenterX = transform.centerX;
  const shiftX = (centerX - bboxCenterX) / transform.span * 1.4;
  let maxDistance = 1;
  for (let i = 0; i < distanceToEdge.length; i++) maxDistance = Math.max(maxDistance, distanceToEdge[i]);
  for (let i = 0; i < total; i++) {
    const sample = i < edgeCount ? edge[i] : interior[i - edgeCount];
    if (!sample) continue;
    const x = sample.x, y = sample.y, pixel = sample.pixel;
    const depth = Math.sqrt(Math.min(1, distanceToEdge[pixel] / maxDistance));
    points[i * 3] = (x - bboxCenterX) / transform.span * 1.4 + shiftX;
    points[i * 3 + 1] = -(y - transform.centerY) / transform.span * 1.4;
    points[i * 3 + 2] = depth * 0.168;
  }
  return points;
}

function makeDistanceField(source: SampledMask): Float32Array {
  const { canvasWidth: width, canvasHeight: height, pixelIndices } = source;
  const field = new Float32Array(width * height);
  field.fill(0);
  const inside = new Uint8Array(width * height);
  for (const pixel of pixelIndices) { inside[pixel] = 1; field[pixel] = 1e6; }
  for (const pixel of pixelIndices) {
    const x = pixel % width;
    if (x === 0 || x === width - 1 || !inside[pixel - 1] || !inside[pixel + 1] || !inside[pixel - width] || !inside[pixel + width]) field[pixel] = 1;
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (!inside[i]) continue;
    if (x > 0) field[i] = Math.min(field[i], field[i - 1] + 1);
    if (y > 0) field[i] = Math.min(field[i], field[i - width] + 1);
    if (x > 0 && y > 0) field[i] = Math.min(field[i], field[i - width - 1] + 1.4142);
    if (x + 1 < width && y > 0) field[i] = Math.min(field[i], field[i - width + 1] + 1.4142);
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const i = y * width + x;
    if (!inside[i]) continue;
    if (x + 1 < width) field[i] = Math.min(field[i], field[i + 1] + 1);
    if (y + 1 < height) field[i] = Math.min(field[i], field[i + width] + 1);
    if (x + 1 < width && y + 1 < height) field[i] = Math.min(field[i], field[i + width + 1] + 1.4142);
    if (x > 0 && y + 1 < height) field[i] = Math.min(field[i], field[i + width - 1] + 1.4142);
  }
  return field;
}

type Sample = { x: number; y: number; pixel: number };

function poissonSamples(source: SampledMask, target: number, distances: Float32Array, random: () => number): Sample[] {
  const { canvasWidth: width, canvasHeight: height, pixelIndices } = source;
  const radius = 0.8, cell = radius / Math.SQRT2, cols = Math.ceil(width / cell), rows = Math.ceil(height / cell);
  const grid = new Int32Array(cols * rows); grid.fill(-1);
  const points: Sample[] = [];
  let attempts = 0;
  while (points.length < target && attempts < target * 50) {
    attempts++;
    const pixel = pixelIndices[Math.floor(random() * pixelIndices.length)];
    const x = pixel % width + random(), y = Math.floor(pixel / width) + random();
    const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
    let valid = distances[pixel] > 0;
    for (let yy = Math.max(0, gy - 2); yy <= Math.min(rows - 1, gy + 2) && valid; yy++) for (let xx = Math.max(0, gx - 2); xx <= Math.min(cols - 1, gx + 2); xx++) {
      const other = grid[yy * cols + xx];
      if (other >= 0 && Math.hypot(points[other].x - x, points[other].y - y) < radius) { valid = false; break; }
    }
    if (!valid) continue;
    const at = points.length;
    points.push({ x, y, pixel });
    grid[gy * cols + gx] = at;
  }
  if (points.length < target) {
    const seen = new Set(points.map((point) => point.pixel));
    for (let tries = 0; points.length < target && tries < target * 40; tries++) {
      const pixel = pixelIndices[Math.floor(random() * pixelIndices.length)];
      if (seen.has(pixel)) continue;
      seen.add(pixel);
      points.push({ x: pixel % width + 0.5, y: Math.floor(pixel / width) + 0.5, pixel });
    }
  }
  return points.slice(0, target);
}

function edgeSamples(source: SampledMask, distances: Float32Array, count: number, random: () => number): Sample[] {
  const { canvasWidth: width, pixelIndices } = source;
  const band = pixelIndices.filter((pixel) => distances[pixel] <= 2.5);
  const result: Sample[] = [];
  for (let i = 0; i < count; i++) {
    const pixel = band[Math.floor(random() * Math.max(1, band.length))] ?? pixelIndices[Math.floor(random() * pixelIndices.length)];
    result.push({ x: pixel % width + 0.5, y: Math.floor(pixel / width) + 0.5, pixel });
  }
  return result;
}
