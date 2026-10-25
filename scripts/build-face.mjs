import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const photoPath = await findPhoto(process.argv[2]);
const outPath = path.join(root, 'public', 'shapes', 'face.bin');
const previewPath = path.join(root, 'debug', 'face-preview.png');
const modelName = 'onnx-community/depth-anything-v2-small-ONNX';
if (!photoPath || !existsSync(photoPath)) throw new Error(`Photo not found in ${path.join(root, 'private')}. Accepted files: face.jpg, face.jpeg, face.png.`);

let pipeline;
try { ({ pipeline } = await import('@huggingface/transformers')); }
catch (error) { throw new Error(`Depth-estimation package is missing. Install it with: npm install --no-save --package-lock=false @imgly/background-removal-node @huggingface/transformers\n${String(error)}`); }

console.log(`Using photo: ${path.relative(root, photoPath)}`);
const cutoutPath = path.join(tmpdir(), `particle-face-cutout-${randomUUID()}.png`);
try {
  const helper = path.join(root, 'scripts', 'remove-face-background.mjs');
  const result = spawnSync(process.execPath, [helper, photoPath, cutoutPath], { stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(String(result.error ?? `background helper exited with status ${result.status}`));
} catch (error) {
  throw new Error(`Background-removal failed. Install @imgly/background-removal-node and check model access.\n${String(error)}`);
}
const cutoutPng = PNG.sync.read(await readFile(cutoutPath));
await unlink(cutoutPath).catch(() => {});

console.log(`Loading Depth Anything V2 Small (${modelName})...`);
const estimateDepth = await pipeline('depth-estimation', modelName, { device: 'cpu' });
const depthResult = await estimateDepth(photoPath);
const depthImage = depthResult.depth;
if (!depthImage?.data?.length || !depthImage.width || !depthImage.height) throw new Error('Depth Anything V2 Small returned no usable depth image.');

const sourcePhoto = await readFile(photoPath);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
let sourcePng;
try {
  const page = await browser.newPage();
  const mime = path.extname(photoPath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
  await page.setContent(`<img id="photo" src="data:${mime};base64,${sourcePhoto.toString('base64')}">`);
  const decoded = await page.evaluate(async () => {
    const image = document.querySelector('#photo'); await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    return { dataUrl: canvas.toDataURL('image/png') };
  });
  sourcePng = PNG.sync.read(Buffer.from(decoded.dataUrl.split(',')[1], 'base64'));
} finally { await browser.close(); }

const width = sourcePng.width, height = sourcePng.height, length = width * height;
const alpha = new Uint8Array(length), luminance = new Float32Array(length);
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const i = y * width + x, p = i * 4;
  luminance[i] = (0.2126 * sourcePng.data[p] + 0.7152 * sourcePng.data[p + 1] + 0.0722 * sourcePng.data[p + 2]) / 255;
  const mx = Math.min(cutoutPng.width - 1, Math.floor((x + 0.5) / width * cutoutPng.width));
  const my = Math.min(cutoutPng.height - 1, Math.floor((y + 0.5) / height * cutoutPng.height));
  alpha[i] = cutoutPng.data[(my * cutoutPng.width + mx) * 4 + 3];
}

// Keep the largest connected person component, then fill enclosed mask holes.
const component = new Uint8Array(length), seen = new Uint8Array(length), queue = new Int32Array(length);
let largest = [];
for (let start = 0; start < length; start++) {
  if (alpha[start] < 40 || seen[start]) continue;
  let head = 0, tail = 0; const members = [];
  seen[start] = 1; queue[tail++] = start;
  while (head < tail) {
    const i = queue[head++], x = i % width; members.push(i);
    const neighbours = [i - width, i + width, x > 0 ? i - 1 : -1, x + 1 < width ? i + 1 : -1];
    for (const next of neighbours) if (next >= 0 && next < length && !seen[next] && alpha[next] >= 40) { seen[next] = 1; queue[tail++] = next; }
  }
  if (members.length > largest.length) largest = members;
}
if (!largest.length) throw new Error('Background removal returned an empty person mask.');
for (const i of largest) component[i] = 1;
const exterior = new Uint8Array(length); let head = 0, tail = 0;
for (let x = 0; x < width; x++) { if (!component[x]) { exterior[x] = 1; queue[tail++] = x; } const b = (height - 1) * width + x; if (!component[b]) { exterior[b] = 1; queue[tail++] = b; } }
for (let y = 1; y < height - 1; y++) { const l = y * width, r = l + width - 1; if (!component[l]) { exterior[l] = 1; queue[tail++] = l; } if (!component[r]) { exterior[r] = 1; queue[tail++] = r; } }
while (head < tail) {
  const i = queue[head++], x = i % width;
  for (const next of [i - width, i + width, x > 0 ? i - 1 : -1, x + 1 < width ? i + 1 : -1]) {
    if (next >= 0 && next < length && !component[next] && !exterior[next]) { exterior[next] = 1; queue[tail++] = next; }
  }
}
for (let i = 0; i < length; i++) if (!component[i] && !exterior[i]) component[i] = 1;

let minX = width, maxX = -1, minY = height, maxY = -1;
const inside = [];
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (component[y * width + x]) {
  inside.push(y * width + x); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
}
const sourcePersonHeight = maxY - minY + 1;
const rowBounds = [];
for (let y = minY; y <= maxY; y++) {
  let left = width, right = -1;
  for (let x = 0; x < width; x++) if (component[y * width + x]) { left = Math.min(left, x); right = Math.max(right, x); }
  if (right >= left) rowBounds.push({ y, left, right, center: (left + right) / 2, width: right - left + 1 });
}
const headRows = rowBounds.filter((row) => row.y < minY + sourcePersonHeight * 0.43);
const neckRows = rowBounds.filter((row) => row.y >= minY + sourcePersonHeight * 0.36 && row.y <= minY + sourcePersonHeight * 0.56);
if (!headRows.length || !neckRows.length) throw new Error('Could not locate head and neck rows in the person mask.');
const sortedHeadWidths = headRows.map((row) => row.width).sort((a, b) => a - b);
const headWidth = sortedHeadWidths[Math.floor(sortedHeadWidths.length * 0.9)];
const neckCenters = neckRows.map((row) => row.center).sort((a, b) => a - b);
const centerX = neckCenters[Math.floor(neckCenters.length / 2)];
const neckY = minY + sourcePersonHeight * 0.47;
const bodyRows = rowBounds.filter((row) => row.y >= neckY);
const bodyWidth = Math.max(0, ...bodyRows.map((row) => row.width));
const asymmetry = bodyRows.length ? bodyRows.reduce((sum, row) => sum + Math.abs(row.center - centerX) / Math.max(1, row.width / 2), 0) / bodyRows.length : 0;
const synthesizeShoulders = bodyWidth < headWidth * 1.8 || asymmetry > 0.22;
const virtualHeight = Math.ceil(minY + sourcePersonHeight * (synthesizeShoulders ? 1.3 : 1.02));
const workLength = width * virtualHeight;
const workMask = new Uint8Array(workLength);
if (!synthesizeShoulders) {
  for (const pixel of inside) workMask[pixel] = 1;
} else {
  const blendEnd = Math.min(maxY, Math.round(neckY + sourcePersonHeight * 0.08));
  for (const pixel of inside) {
    if (Math.floor(pixel / width) <= blendEnd) workMask[pixel] = 1;
  }
  const shoulderStart = Math.max(minY, Math.floor(neckY - sourcePersonHeight * 0.08));
  const shoulderEnd = virtualHeight - 1;
  const neckHalfWidth = headWidth * 0.48, shoulderHalfWidth = headWidth * 1.2;
  for (let y = shoulderStart; y <= shoulderEnd; y++) {
    const t = Math.max(0, Math.min(1, (y - shoulderStart) / Math.max(1, shoulderEnd - shoulderStart)));
    const spread = smoothstep(0, 0.42, t);
    const halfWidth = neckHalfWidth + (shoulderHalfWidth - neckHalfWidth) * spread;
    const left = Math.max(0, Math.ceil(centerX - halfWidth)), right = Math.min(width - 1, Math.floor(centerX + halfWidth));
    for (let x = left; x <= right; x++) workMask[y * width + x] = 1;
  }
}
const samplePixels = [];
for (let i = 0; i < workMask.length; i++) if (workMask[i]) samplePixels.push(i);
if (!samplePixels.length) throw new Error('Person mask contains no pixels for sampling.');
const figureHeight = virtualHeight - minY;
console.log(`Person mask ${width}x${height}, occupied pixels=${samplePixels.length}, head width=${headWidth}, body width=${bodyWidth}, asymmetry=${asymmetry.toFixed(3)}, synthetic shoulders=${synthesizeShoulders}.`);

let depthMin = Infinity, depthMax = -Infinity;
for (const value of depthImage.data) { depthMin = Math.min(depthMin, value); depthMax = Math.max(depthMax, value); }
if (!Number.isFinite(depthMin) || depthMax - depthMin < 1e-6) throw new Error('Depth map has no usable depth range.');
const depth = new Float32Array(length);
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const dx = Math.min(depthImage.width - 1, Math.floor((x + 0.5) / width * depthImage.width));
  const dy = Math.min(depthImage.height - 1, Math.floor((y + 0.5) / height * depthImage.height));
  depth[y * width + x] = (depthImage.data[dy * depthImage.width + dx] - depthMin) / (depthMax - depthMin);
}
const smoothDepth = gaussianBlur(depth, width, height, 3);

let seed = 0x83f9a673;
const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 0x100000000; };
const pointCount = 90_000;
function poissonDisc(radius) {
  const cellSize = radius / Math.SQRT2, gridWidth = Math.ceil(width / cellSize), gridHeight = Math.ceil(virtualHeight / cellSize);
  const grid = new Int32Array(gridWidth * gridHeight); grid.fill(-1);
  const points = new Float32Array(pointCount * 2), active = new Int32Array(pointCount);
  let count = 0, activeCount = 0;
  const insideAt = (x, y) => x >= 0 && x < width && y >= 0 && y < virtualHeight && workMask[Math.floor(y) * width + Math.floor(x)] === 1;
  const accepted = (x, y) => {
    if (!insideAt(x, y)) return false;
    const gx = Math.floor(x / cellSize), gy = Math.floor(y / cellSize), r2 = radius * radius;
    for (let yy = Math.max(0, gy - 2); yy <= Math.min(gridHeight - 1, gy + 2); yy++) for (let xx = Math.max(0, gx - 2); xx <= Math.min(gridWidth - 1, gx + 2); xx++) {
      const other = grid[yy * gridWidth + xx];
      if (other < 0) continue;
      const dx = points[other * 2] - x, dy = points[other * 2 + 1] - y;
      if (dx * dx + dy * dy < r2) return false;
    }
    return true;
  };
  const add = (x, y) => {
    const index = count++;
    points[index * 2] = x; points[index * 2 + 1] = y;
    grid[Math.floor(y / cellSize) * gridWidth + Math.floor(x / cellSize)] = index;
    active[activeCount++] = index;
  };
  for (let tries = 0; tries < 5000 && !count; tries++) {
    const pixel = samplePixels[Math.floor(random() * samplePixels.length)];
    const x = pixel % width + random(), y = Math.floor(pixel / width) + random();
    if (insideAt(x, y)) add(x, y);
  }
  while (activeCount && count < pointCount) {
    const activeSlot = Math.floor(random() * activeCount), origin = active[activeSlot];
    const ox = points[origin * 2], oy = points[origin * 2 + 1];
    let added = false;
    for (let k = 0; k < 30; k++) {
      const angle = random() * Math.PI * 2, distance = radius * Math.sqrt(1 + random() * 3);
      const x = ox + Math.cos(angle) * distance, y = oy + Math.sin(angle) * distance;
      if (!accepted(x, y)) continue;
      add(x, y); added = true; break;
    }
    if (!added) { active[activeSlot] = active[--activeCount]; }
  }
  return { points, count, grid, gridWidth, gridHeight, cellSize, radius };
}
let poissonRadius = Math.sqrt(samplePixels.length / (pointCount * 2.25));
let sampled = poissonDisc(poissonRadius);
for (let retry = 0; sampled.count < pointCount && retry < 5; retry++) {
  poissonRadius *= 0.88;
  sampled = poissonDisc(poissonRadius);
}
if (sampled.count < pointCount) throw new Error(`Blue-noise sampler produced only ${sampled.count} of ${pointCount} points.`);
const output = new Float32Array(pointCount * 3);
for (let i = 0; i < pointCount; i++) {
  const x = sampled.points[i * 2], y = sampled.points[i * 2 + 1];
  const sourceX = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const sourceY = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const depthPixel = sourceY * width + sourceX;
  output[i * 3] = (x - centerX) / figureHeight;
  output[i * 3 + 1] = 0.5 - (y - minY) / figureHeight;
  output[i * 3 + 2] = (smoothDepth[depthPixel] - 0.5) * 0.15;
}

const nnGrid = new Int32Array(sampled.grid.length); nnGrid.set(sampled.grid);
const nearestDistances = [];
for (let i = 0; i < pointCount; i += 3) {
  const x = sampled.points[i * 2], y = sampled.points[i * 2 + 1];
  const gx = Math.floor(x / sampled.cellSize), gy = Math.floor(y / sampled.cellSize);
  let nearest = Infinity;
  for (let yy = Math.max(0, gy - 2); yy <= Math.min(sampled.gridHeight - 1, gy + 2); yy++) for (let xx = Math.max(0, gx - 2); xx <= Math.min(sampled.gridWidth - 1, gx + 2); xx++) {
    const other = nnGrid[yy * sampled.gridWidth + xx];
    if (other < 0 || other === i) continue;
    const dx = sampled.points[other * 2] - x, dy = sampled.points[other * 2 + 1] - y;
    nearest = Math.min(nearest, Math.hypot(dx, dy));
  }
  if (Number.isFinite(nearest)) nearestDistances.push(nearest);
}
nearestDistances.sort((a, b) => a - b);
const nnMedian = nearestDistances[Math.floor(nearestDistances.length * 0.5)];
const nnP90 = nearestDistances[Math.floor(nearestDistances.length * 0.9)];
if (!(nnP90 / nnMedian > 1.08)) throw new Error(`Nearest-neighbour spread looks too regular: median=${nnMedian}, p90=${nnP90}`);

const preview = new PNG({ width: 1024, height: 1024 });
for (let i = 0; i < preview.data.length; i += 4) { preview.data[i] = 38; preview.data[i + 1] = 38; preview.data[i + 2] = 43; preview.data[i + 3] = 255; }
for (let i = 0; i < pointCount; i++) {
  const x = Math.round(512 + output[i * 3] * 610);
  const y = Math.round(512 - output[i * 3 + 1] * 610);
  const radius = random() > 0.9 ? 1 : 0, value = 115 + Math.floor(random() * 36);
  for (let oy = -radius; oy <= radius; oy++) for (let ox = -radius; ox <= radius; ox++) {
    if (ox * ox + oy * oy > radius * radius + 0.1) continue;
    const px = x + ox, py = y + oy;
    if (px < 0 || px >= preview.width || py < 0 || py >= preview.height) continue;
    const p = (py * preview.width + px) * 4;
    preview.data[p] = Math.max(preview.data[p], value); preview.data[p + 1] = Math.max(preview.data[p + 1], value); preview.data[p + 2] = Math.max(preview.data[p + 2], value);
  }
}
await mkdir(path.dirname(outPath), { recursive: true }); await mkdir(path.dirname(previewPath), { recursive: true });
await writeFile(outPath, Buffer.from(output.buffer)); await writeFile(previewPath, PNG.sync.write(preview));
console.log(`Mask ${width}x${height}; head ${headWidth}px; neck centre x=${centerX.toFixed(1)}; body ${bodyWidth}px; asymmetry=${asymmetry.toFixed(3)}; synthesized shoulders=${synthesizeShoulders}; points=${pointCount.toLocaleString()}.`);
console.log(`Poisson-disc minimum spacing ${sampled.radius.toFixed(2)} px; nearest-neighbour median=${nnMedian.toFixed(2)} px, p90=${nnP90.toFixed(2)} px (ratio ${(nnP90 / nnMedian).toFixed(2)}); depth span 0.15 figure heights.`);
console.log(`Wrote ${pointCount.toLocaleString()} points to public/shapes/face.bin and front preview to debug/face-preview.png.`);

async function findPhoto(argument) {
  if (argument) return path.resolve(argument);
  const dir = path.join(root, 'private'); if (!existsSync(dir)) return null;
  const files = await readdir(dir); const name = ['face.jpg', 'face.jpeg', 'face.png'].find((item) => files.includes(item));
  return name ? path.join(dir, name) : null;
}
function smoothstep(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function gaussianBlur(input, w, h, sigma) {
  const radius = Math.ceil(sigma * 3), kernel = new Float32Array(radius * 2 + 1); let sum = 0;
  for (let k = -radius; k <= radius; k++) { const v = Math.exp(-(k * k) / (2 * sigma * sigma)); kernel[k + radius] = v; sum += v; }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
  const temp = new Float32Array(input.length), out = new Float32Array(input.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let k = -radius; k <= radius; k++) v += input[y * w + Math.max(0, Math.min(w - 1, x + k))] * kernel[k + radius]; temp[y * w + x] = v; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let k = -radius; k <= radius; k++) v += temp[Math.max(0, Math.min(h - 1, y + k)) * w + x] * kernel[k + radius]; out[y * w + x] = v; }
  return out;
}
