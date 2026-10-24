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
  const points = new Float32Array(Math.max(0, count) * 3);
  for (let i = 0; i < count; i++) {
    const seed = seeds?.[i] ?? (i + 0.5) / Math.max(1, count);
    let x = 0, y = 0, z = 0;
    if (bakedFace?.length && seed < 0.62) {
      const vertices = bakedFace.length / 3;
      const index = Math.min(vertices - 1, Math.floor(seed / 0.62 * vertices));
      x = bakedFace[index * 3]; y = bakedFace[index * 3 + 1]; z = bakedFace[index * 3 + 2];
    } else {
      const a = fract(seed * 91.73 + 0.17), b = fract(seed * 173.19 + 0.43), c = fract(seed * 317.31 + 0.71);
      const part = bakedFace?.length ? (seed - 0.62) / 0.38 : seed;
      if (part < 0.52) {
        // Ellipsoid head, centered above the neck; a front-facing point cloud.
        const theta = Math.acos(1 - 2 * a), phi = b * Math.PI * 2;
        x = Math.sin(theta) * Math.cos(phi) * 0.43;
        y = 0.34 + Math.cos(theta) * 0.57;
        z = Math.sin(theta) * Math.sin(phi) * 0.32;
        // Subtle facial planes and features on the camera-facing hemisphere.
        if (z > 0.18) {
          const eye = y > 0.31 && y < 0.43 && (Math.abs(x - 0.15) < 0.045 || Math.abs(x + 0.15) < 0.045);
          const mouth = y > -0.04 && y < 0.015 && Math.abs(x) < 0.12;
          const nose = y > 0.08 && y < 0.27 && Math.abs(x) < 0.055;
          if ((eye || mouth || nose) && c < 0.66) z -= 0.025;
        }
      } else if (part < 0.68) {
        // Narrow neck with a softly tapered lower edge.
        const theta = b * Math.PI * 2;
        const radius = 0.17 + a * 0.045;
        x = Math.cos(theta) * radius;
        z = Math.sin(theta) * radius * 0.78;
        y = -0.30 - a * 0.37;
      } else if (part < 0.97) {
        // Sparse shoulder arc with a gentle vertical falloff at its ends.
        const theta = Math.PI * (0.08 + a * 0.84);
        const radius = 0.48 + b * 0.12;
        x = Math.cos(theta) * radius;
        y = -0.56 - Math.sin(theta) * 0.28 - c * 0.11;
        z = (b - 0.5) * 0.34;
      } else {
        // A faint support ring beneath the bust, visible only with the face shape.
        const theta = a * Math.PI * 2;
        const radius = 0.62 + b * 0.025;
        x = Math.cos(theta) * radius;
        y = -0.91 + (c - 0.5) * 0.012;
        z = Math.sin(theta) * radius * 0.26;
      }
    }
    points[i * 3] = x; points[i * 3 + 1] = y; points[i * 3 + 2] = z;
  }
  return points;
}

function fract(value: number): number { return value - Math.floor(value); }
