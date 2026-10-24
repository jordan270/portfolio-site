export type SampledMask = Float32Array & {
  canvasWidth: number;
  canvasHeight: number;
  pixelIndices: Uint32Array;
  bboxWidthRatio: number;
};

type MaskWindow = Window & {
  __shapeMaskDebug?: Record<string, { dataUrl: string; bboxWidthRatio: number }>;
};

const viewBoxFromSvg = (svg: string): [number, number, number, number] | null => {
  const root = svg.match(/<svg\b[^>]*>/i)?.[0];
  if (!root) return null;
  const viewBox = root.match(/\bviewBox\s*=\s*["']\s*([\d.+-eE]+)[,\s]+([\d.+-eE]+)[,\s]+([\d.+-eE]+)[,\s]+([\d.+-eE]+)\s*["']/i);
  if (viewBox) {
    const values = viewBox.slice(1).map(Number) as [number, number, number, number];
    if (values.every(Number.isFinite) && values[2] > 0 && values[3] > 0) return values;
  }
  const toPixels = (raw: string | undefined): number => {
    const match = raw?.trim().match(/^([\d.]+)\s*(px|pt|pc|mm|cm|in)?$/i);
    if (!match) return NaN;
    const value = Number(match[1]), unit = (match[2] ?? 'px').toLowerCase();
    return value * ({ px: 1, pt: 96 / 72, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 }[unit] ?? 1);
  };
  const width = toPixels(root.match(/\bwidth\s*=\s*["']([^"']+)/i)?.[1]);
  const height = toPixels(root.match(/\bheight\s*=\s*["']([^"']+)/i)?.[1]);
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? [0, 0, width, height] : null;
};

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode();
  if (!image.naturalWidth || !image.naturalHeight) throw new Error(`Image has no dimensions: ${url}`);
  return image;
}

async function rasterize(image: HTMLImageElement, shape: string, insidePixel: (rgba: Uint8ClampedArray, offset: number) => boolean): Promise<SampledMask> {
  const width = image.naturalWidth, height = image.naturalHeight;
  const longer = Math.max(width, height);
  const canvasWidth = Math.max(1, Math.round(width / longer * 1024));
  const canvasHeight = Math.max(1, Math.round(height / longer * 1024));
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth; canvas.height = canvasHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D is unavailable for SVG sampling');
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  const fit = Math.min(canvasWidth * 0.84 / width, canvasHeight * 0.84 / height);
  const drawWidth = width * fit, drawHeight = height * fit;
  context.drawImage(image, (canvasWidth - drawWidth) / 2, (canvasHeight - drawHeight) / 2, drawWidth, drawHeight);

  const pixels = context.getImageData(0, 0, canvasWidth, canvasHeight).data;
  let minX = canvasWidth, maxX = -1, minY = canvasHeight, maxY = -1;
  for (let y = 0; y < canvasHeight; y++) for (let x = 0; x < canvasWidth; x++) {
    const offset = (y * canvasWidth + x) * 4;
    if (!insidePixel(pixels, offset)) continue;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  if (maxX < minX || maxY < minY) throw new Error(`Image mask has no usable silhouette: ${shape}`);
  const span = Math.max(maxX - minX + 1, maxY - minY + 1);
  const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
  const coords: number[] = [], pixelIndices: number[] = [];
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const offset = (y * canvasWidth + x) * 4;
    if (!insidePixel(pixels, offset)) continue;
    pixelIndices.push(y * canvasWidth + x);
    coords.push((x - centerX) / span * 1.4, -(y - centerY) / span * 1.4);
  }
  if (coords.length < 12) throw new Error(`Image mask has too few usable pixels: ${shape}`);

  const bboxWidthRatio = (maxX - minX + 1) / canvasWidth;
  if (new URLSearchParams(location.search).get('debugMasks') === '1') {
    const debugWindow = window as MaskWindow;
    debugWindow.__shapeMaskDebug ??= {};
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = canvasWidth; maskCanvas.height = canvasHeight;
    const maskContext = maskCanvas.getContext('2d');
    if (maskContext) {
      const maskPixels = maskContext.createImageData(canvasWidth, canvasHeight);
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const offset = (y * canvasWidth + x) * 4;
        if (!insidePixel(pixels, offset)) continue;
        maskPixels.data[offset] = 255; maskPixels.data[offset + 1] = 255; maskPixels.data[offset + 2] = 255; maskPixels.data[offset + 3] = 255;
      }
      maskContext.putImageData(maskPixels, 0, 0);
      debugWindow.__shapeMaskDebug[shape] = { dataUrl: maskCanvas.toDataURL('image/png'), bboxWidthRatio };
    }
  }
  const mask = Float32Array.from(coords) as SampledMask;
  mask.canvasWidth = canvasWidth;
  mask.canvasHeight = canvasHeight;
  mask.pixelIndices = Uint32Array.from(pixelIndices);
  mask.bboxWidthRatio = bboxWidthRatio;
  return mask;
}

/** Rasterise the complete SVG viewBox at 1024px on the long side and return its alpha mask. */
export async function loadSvgMask(svgUrl: string, shape = 'shape'): Promise<SampledMask> {
  const response = await fetch(svgUrl);
  if (!response.ok) throw new Error(`SVG mask request failed (${response.status}): ${svgUrl}`);
  const svg = await response.text();
  const viewBox = viewBoxFromSvg(svg);
  const source = viewBox
    ? svg.replace(/<svg\b/i, `<svg width="${viewBox[2]}px" height="${viewBox[3]}px"`)
    : svg;
  const blobUrl = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
  try {
    const image = await loadImage(blobUrl);
    // When the SVG has no viewBox or physical dimensions, use its decoded natural size.
    if (!viewBox && !image.naturalWidth) throw new Error(`Could not determine SVG dimensions: ${svgUrl}`);
    return await rasterize(image, shape, (rgba, offset) => rgba[offset + 3] > 25.5);
  } catch (error) {
    throw new Error(`Could not rasterise SVG mask ${svgUrl}: ${String(error)}`);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/** Load a supplied raster silhouette, optionally using a predicate for opaque-background logos. */
export async function loadRasterMask(url: string, shape: string, insidePixel?: (rgba: Uint8ClampedArray, offset: number) => boolean): Promise<SampledMask> {
  const image = await loadImage(url);
  return rasterize(image, shape, insidePixel ?? ((rgba, offset) => rgba[offset + 3] > 25.5));
}

export function sampleSvgMask(mask: Float32Array, count: number, seeds?: Float32Array, channel = 5): Float32Array {
  const points = new Float32Array(Math.max(0, count) * 3);
  const pixels = mask.length / 2;
  for (let i = 0; i < count; i++) {
    const seed = seeds?.[i] ?? (i + 0.5) / Math.max(1, count);
    const index = Math.min(pixels - 1, Math.floor(((seed * 0.754877666 + channel * 0.569840296) % 1) * pixels));
    points[i * 3] = mask[index * 2];
    points[i * 3 + 1] = mask[index * 2 + 1];
    points[i * 3 + 2] = ((seed * 17.13 + channel * 0.31) % 1 - 0.5) * 0.04;
  }
  return points;
}
