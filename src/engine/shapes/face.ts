import { randomFor } from './random.ts';
import { loadRasterMask, type SampledMask } from './mask.ts';
import { generate as dust } from './dust.ts';

const POINT_COUNT = 90_000;
let mask: SampledMask | null = null;
let distanceToEdge: Float32Array | null = null;
let density: Float32Array | null = null;
let faceFrameMetrics: { imageAspect: number; alphaTop: number; alphaHeight: number } | null = null;
let sampledFace: Float32Array | null = null;
let faceLoad: Promise<void> | null = null;

export function loadFaceMaskData(): Promise<void> {
  if (!faceLoad) {
    faceLoad = loadRasterMask('/assets/face.png', 'face', (rgba, offset) => rgba[offset + 3] > 127.5)
      .then(async (loaded) => {
        mask = loaded;
        distanceToEdge = makeDistanceField(loaded);
        faceFrameMetrics = measureFaceFrame(loaded);
        density = await readDensityMap(loaded);
        sampledFace = null;
      })
      .catch((error: unknown) => {
        faceLoad = null;
        console.warn('[ParticleEngine] assets/face.png unavailable; face uses the dust fallback.', error);
      });
  }
  return faceLoad;
}

/** Density weighted Poisson-disc samples from the complete face silhouette. */
export function generate(count: number, seeds?: Float32Array): Float32Array {
  if (!mask || !distanceToEdge || !density || !mask.pixelIndices.length) return dust(count, seeds);
  if (!sampledFace) sampledFace = sampleFace(POINT_COUNT);
  const points = new Float32Array(Math.max(0, count) * 3);
  for (let i = 0; i < count; i++) {
    const seed = seeds?.[i] ?? (i + 0.5) / Math.max(1, count);
    const source = Math.min(POINT_COUNT - 1, Math.floor(seed * POINT_COUNT));
    points.set(sampledFace.subarray(source * 3, source * 3 + 3), i * 3);
  }
  return points;
}

export function getFaceFrameMetrics(): { imageAspect: number; alphaTop: number; alphaHeight: number } {
  return faceFrameMetrics ?? { imageAspect: 16 / 15, alphaTop: 0, alphaHeight: 1 };
}

function measureFaceFrame(source: SampledMask): { imageAspect: number; alphaTop: number; alphaHeight: number } {
  const transform = source.sourceTransform!;
  let minY = source.canvasHeight, maxY = -1;
  for (const pixel of source.pixelIndices) {
    const y = Math.floor(pixel / source.canvasWidth);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const imageHeight = source.canvasHeight - transform.offsetY * 2;
  const imageWidth = source.canvasWidth - transform.offsetX * 2;
  return {
    imageAspect: imageWidth / imageHeight,
    alphaTop: (minY - transform.offsetY) / imageHeight,
    alphaHeight: (maxY - minY + 1) / imageHeight,
  };
}

function sampleFace(total: number): Float32Array {
  if (!mask || !distanceToEdge || !density) return new Float32Array(total * 3);
  const rand = randomFor(0.417, 711);
  const samples = poissonSamples(mask, total, distanceToEdge, density, rand);
  const points = new Float32Array(total * 3);
  const transform = mask.sourceTransform!;
  const bboxCenterX = transform.centerX;
  let maxDistance = 1;
  for (let i = 0; i < distanceToEdge.length; i++) maxDistance = Math.max(maxDistance, distanceToEdge[i]);
  for (let i = 0; i < total; i++) {
    const sample = samples[i];
    if (!sample) continue;
    const depth = Math.sqrt(Math.min(1, distanceToEdge[sample.pixel] / maxDistance));
    points[i * 3] = (sample.x - bboxCenterX) / transform.span * 1.4;
    points[i * 3 + 1] = -(sample.y - transform.centerY) / transform.span * 1.4;
    points[i * 3 + 2] = depth * 0.168;
  }
  return points;
}

async function readDensityMap(source: SampledMask): Promise<Float32Array> {
  const transform = source.sourceTransform!;
  const image = new Image();
  image.src = '/assets/face.png';
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = source.canvasWidth; canvas.height = source.canvasHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D is unavailable for face density sampling');
  context.drawImage(image, transform.offsetX, transform.offsetY, image.naturalWidth * transform.scale, image.naturalHeight * transform.scale);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const weights = new Float32Array(canvas.width * canvas.height);
  for (const pixel of source.pixelIndices) weights[pixel] = Math.min(1, Math.max(0, pixels[pixel * 4] / 255));
  return weights;
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

type Sample = { x: number; y: number; pixel: number; weight: number };

function poissonSamples(source: SampledMask, target: number, distances: Float32Array, weights: Float32Array, random: () => number): Sample[] {
  const { canvasWidth: width, canvasHeight: height, pixelIndices } = source;
  const radius = Math.max(0.65, Math.sqrt(pixelIndices.length / target / Math.PI) * 0.55);
  const cell = radius / Math.SQRT2, cols = Math.ceil(width / cell), rows = Math.ceil(height / cell);
  const grid = new Int32Array(cols * rows); grid.fill(-1);
  const points: Sample[] = [];
  let attempts = 0;
  while (points.length < target && attempts < target * 100) {
    attempts++;
    const pixel = pixelIndices[Math.floor(random() * pixelIndices.length)];
    const weight = weights[pixel];
    if (random() > weight) continue;
    const x = pixel % width + random(), y = Math.floor(pixel / width) + random();
    const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
    let valid = distances[pixel] > 0;
    for (let yy = Math.max(0, gy - 2); yy <= Math.min(rows - 1, gy + 2) && valid; yy++) for (let xx = Math.max(0, gx - 2); xx <= Math.min(cols - 1, gx + 2); xx++) {
      const other = grid[yy * cols + xx];
      if (other >= 0 && Math.hypot(points[other].x - x, points[other].y - y) < radius) { valid = false; break; }
    }
    if (!valid) continue;
    const at = points.length;
    points.push({ x, y, pixel, weight });
    grid[gy * cols + gx] = at;
  }
  return points.slice(0, target);
}
