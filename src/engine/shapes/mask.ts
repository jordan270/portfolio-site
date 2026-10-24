/** Rasterise an SVG through an offscreen canvas and return alpha-qualified coordinates. */
export async function loadSvgMask(svgUrl: string): Promise<Float32Array> {
  const response = await fetch(svgUrl);
  if (!response.ok) throw new Error(`SVG mask request failed (${response.status}): ${svgUrl}`);
  const svg = await response.text();
  const blobUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = blobUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`Could not rasterise SVG mask: ${svgUrl}`));
    });
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas 2D is unavailable for SVG sampling');
    context.clearRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(440 / image.width, 440 / image.height);
    context.drawImage(image, (512 - image.width * scale) / 2, (512 - image.height * scale) / 2, image.width * scale, image.height * scale);
    const pixels = context.getImageData(0, 0, 512, 512).data;
    const coords: number[] = [];
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
      const pixel = (y * 512 + x) * 4;
      if (pixels[pixel + 3] > 100) coords.push(x / 511 * 2 - 1, 1 - y / 511 * 2);
    }
    if (coords.length < 12) throw new Error(`SVG mask has no usable silhouette: ${svgUrl}`);
    return Float32Array.from(coords);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

export function sampleSvgMask(mask: Float32Array, count: number, seeds?: Float32Array, channel = 5): Float32Array {
  const points = new Float32Array(Math.max(0, count) * 3);
  const pixels = mask.length / 2;
  for (let i = 0; i < count; i++) {
    const seed = seeds?.[i] ?? (i + 0.5) / Math.max(1, count);
    // A seed-driven permutation gives each particle a stable silhouette sample.
    const index = Math.min(pixels - 1, Math.floor(((seed * 0.754877666 + channel * 0.569840296) % 1) * pixels));
    points[i * 3] = mask[index * 2] * 1.1;
    points[i * 3 + 1] = mask[index * 2 + 1] * 1.1;
    points[i * 3 + 2] = ((seed * 17.13 + channel * 0.31) % 1 - 0.5) * 0.06;
  }
  return points;
}
