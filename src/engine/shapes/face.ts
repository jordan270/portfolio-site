import { generate as dust } from './dust.ts';

let bakedFace: Float32Array | null = null;
let faceLoad: Promise<void> | null = null;

export function loadFaceData(): Promise<void> {
  if (!faceLoad) {
    faceLoad = fetch('/shapes/face.bin').then(async (response) => {
      if (!response.ok) throw new Error(`face.bin request failed (${response.status})`);
      if (response.headers.get('content-type')?.includes('text/html')) throw new Error('face.bin path returned HTML instead of binary data');
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength < 12 || bytes.byteLength % 12 !== 0) throw new Error('face.bin must contain packed XYZ Float32 values');
      bakedFace = new Float32Array(bytes);
    }).catch((error: unknown) => {
      console.warn('[ParticleEngine] public/shapes/face.bin unavailable; face uses the dust fallback.', error);
    });
  }
  return faceLoad;
}

export function generate(count: number, seeds?: Float32Array): Float32Array {
  if (!bakedFace?.length) return dust(count, seeds);
  const vertices = bakedFace.length / 3;
  const points = new Float32Array(Math.max(0, count) * 3);
  for (let i = 0; i < count; i++) {
    const seed = seeds?.[i] ?? (i + 0.5) / Math.max(1, count);
    const index = Math.min(vertices - 1, Math.floor(seed * vertices));
    points[i * 3] = bakedFace[index * 3];
    points[i * 3 + 1] = bakedFace[index * 3 + 1];
    points[i * 3 + 2] = bakedFace[index * 3 + 2];
  }
  return points;
}
