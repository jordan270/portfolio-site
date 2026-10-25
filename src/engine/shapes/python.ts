import { loadSvgMask, type SampledMask } from './mask.ts';
import { generate as dust } from './dust.ts';

let pythonMask: SampledMask | null = null;
let outlinePixels: Uint32Array | null = null;
let insidePixels: Uint32Array | null = null;
let pythonLoad: Promise<void> | null = null;

export function loadPythonData(): Promise<void> {
  if (!pythonLoad) {
    pythonLoad = loadSvgMask('/assets/python.svg', 'python').then((mask) => {
      pythonMask = mask;
      const occupied = new Set(mask.pixelIndices);
      const outline: number[] = [], inside: number[] = [];
      for (let i = 0; i < mask.pixelIndices.length; i++) {
        const pixel = mask.pixelIndices[i], x = pixel % mask.canvasWidth, y = Math.floor(pixel / mask.canvasWidth);
        const edge = x === 0 || y === 0 || x === mask.canvasWidth - 1 || y === mask.canvasHeight - 1 ||
          !occupied.has(pixel - 1) || !occupied.has(pixel + 1) ||
          !occupied.has(pixel - mask.canvasWidth) || !occupied.has(pixel + mask.canvasWidth);
        (edge ? outline : inside).push(i);
      }
      outlinePixels = Uint32Array.from(outline);
      insidePixels = Uint32Array.from(inside);
      if (!outlinePixels.length || !insidePixels.length) throw new Error('Python logo mask has no outline or interior pixels.');
    }).catch((error: unknown) => {
      pythonLoad = null;
      console.warn('[ParticleEngine] assets/python.svg unavailable; Python shape uses the dust fallback.', error);
    });
  }
  return pythonLoad;
}

/** Sample mask pixels with a 70/30 outline-to-interior ratio for legible snakes. */
export function generate(count: number, seeds?: Float32Array): Float32Array {
  if (!pythonMask || !outlinePixels?.length || !insidePixels?.length) return dust(count, seeds);
  const mask = pythonMask, scale = 1.5 / 1.4;
  const points = new Float32Array(Math.max(0, count) * 3);
  for (let i = 0; i < count; i++) {
    const seed = seeds?.[i] ?? (i + 0.5) / Math.max(1, count);
    const pool = seed < 0.7 ? outlinePixels : insidePixels;
    const pick = Math.floor((((seed * 0.754877666 + i * 0.569840296) % 1) * pool.length));
    const source = pool[Math.min(pool.length - 1, pick)] ?? 0;
    points[i * 3] = mask[source * 2] * scale;
    points[i * 3 + 1] = mask[source * 2 + 1] * scale;
    points[i * 3 + 2] = (((seed * 17.13 + i * 0.31) % 1) - 0.5) * 0.06;
  }
  return points;
}

/** Count samples that do not map back into the source SVG alpha mask. */
export function verifyMaskSamples(points: Float32Array): { total: number; outside: number } {
  const mask = pythonMask;
  if (!mask || !mask.sourceTransform) return { total: points.length / 3, outside: points.length / 3 };
  const occupied = new Set(mask.pixelIndices), transform = mask.sourceTransform;
  const scale = 1.5 / 1.4;
  let outside = 0;
  for (let i = 0; i < points.length; i += 3) {
    const x = Math.round((points[i] / scale / 1.4) * transform.span + transform.centerX);
    const y = Math.round((-points[i + 1] / scale / 1.4) * transform.span + transform.centerY);
    if (!occupied.has(y * mask.canvasWidth + x)) outside++;
  }
  return { total: points.length / 3, outside };
}
