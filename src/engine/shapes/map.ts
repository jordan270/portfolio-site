let sampledMask: Float32Array | null = null;
let sourceVersion = 0;

export function getMapSourceVersion(): number { return sourceVersion; }

/** Set an SVG path-data string or image URL as the source silhouette. */
export async function setMapSource(svgPathOrImageUrl: string): Promise<void> {
  const canvas = document.createElement('canvas');
  const size = 512;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D is unavailable');
  context.fillStyle = '#fff';
  if (/^\s*[Mm]/.test(svgPathOrImageUrl)) {
    const path = new Path2D(svgPathOrImageUrl);
    context.save();
    context.translate(size * 0.08, size * 0.08);
    context.scale(size * 0.84 / 100, size * 0.84 / 100);
    context.fill(path);
    context.restore();
  } else {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = svgPathOrImageUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`Could not load map source: ${svgPathOrImageUrl}`));
    });
    const scale = Math.min(size / image.width, size / image.height) * 0.84;
    context.drawImage(image, (size - image.width * scale) / 2, (size - image.height * scale) / 2, image.width * scale, image.height * scale);
  }
  const pixels = context.getImageData(0, 0, size, size).data;
  const candidates: number[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (pixels[(y * size + x) * 4 + 3] > 100) candidates.push(x, y);
  }
  if (candidates.length >= 6) { sampledMask = Float32Array.from(candidates); sourceVersion++; }
}

/** Rejection-sample the built-in blob or the last successfully loaded mask. */
export function generate(count: number): Float32Array {
  const points = new Float32Array(Math.max(0, count) * 3);
  for (let i = 0; i < count; i++) {
    let x: number, y: number, z: number;
    if (sampledMask) {
      const index = Math.floor(Math.random() * sampledMask.length / 2) * 2;
      x = (sampledMask[index] / 511 - 0.5) * 1.8;
      y = (0.5 - sampledMask[index + 1] / 511) * 1.8;
      z = (Math.random() - 0.5) * 0.07;
    } else {
      // Placeholder rounded, asymmetrical blob; rejection sampling keeps a crisp silhouette.
      do {
        x = Math.random() * 1.8 - 0.9;
        y = Math.random() * 1.8 - 0.9;
      } while (((x * x) / 0.72 + (y * y) / 0.68 > 1) || (x > 0.35 && y < -0.15 && Math.random() < 0.8));
      z = (Math.random() - 0.5) * 0.07;
    }
    points[i * 3] = x; points[i * 3 + 1] = y; points[i * 3 + 2] = z;
  }
  return points;
}
