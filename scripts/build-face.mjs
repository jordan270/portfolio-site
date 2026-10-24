import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const photoPath = path.resolve(process.argv[2] ?? path.join(root, 'private', 'face.jpg'));
const outPath = path.join(root, 'public', 'shapes', 'face.bin');
const previewPath = path.join(root, 'debug', 'face-preview.png');
const modelName = 'onnx-community/depth-anything-v2-small-ONNX';
if (!existsSync(photoPath)) {
  throw new Error(`Photo not found at ${photoPath}. Put it at private/face.jpg, or pass a photo path: node scripts/build-face.mjs <path>`);
}

let pipeline;
try {
  ({ pipeline } = await import('@huggingface/transformers'));
} catch (error) {
  throw new Error(`Depth-estimation package is missing. Install it with: npm install --no-save --package-lock=false @imgly/background-removal-node @huggingface/transformers\n${String(error)}`);
}

console.log(`Reading photo: ${photoPath}`);
const cutoutPath = path.join(tmpdir(), `particle-face-cutout-${randomUUID()}.png`);
try {
  const helper = path.join(root, 'scripts', 'remove-face-background.mjs');
  const result = spawnSync(process.execPath, [helper, photoPath, cutoutPath], { stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    throw new Error(String(result.error ?? `background helper exited with status ${result.status}`));
  }
} catch (error) {
  throw new Error(`Background-removal package/model failed. Install with npm install --no-save --package-lock=false @imgly/background-removal-node @huggingface/transformers and check network access.\n${String(error)}`);
}
const cutoutPng = PNG.sync.read(await readFile(cutoutPath));
await unlink(cutoutPath).catch(() => {});

console.log(`Loading Depth Anything V2 Small (${modelName}); model files download on the first run...`);
const progress = (label) => (event) => {
  progress.last ??= new Map();
  if (!event || typeof event !== 'object') return;
  const file = event.file ?? event.name ?? 'model';
  const loaded = Number(event.loaded ?? event.progress ?? 0), total = Number(event.total ?? 0);
  const percent = total > 0 ? ` ${Math.round(loaded / total * 100)}%` : '';
  const line = `[${label}] ${file}${percent}`;
  if (progress.last.get(line) === line) return;
  progress.last.set(line, line);
  console.log(line);
};
let estimateDepth;
try {
  estimateDepth = await pipeline('depth-estimation', modelName, {
    device: 'cpu',
    progress_callback: progress('depth model'),
  });
} catch (error) {
  throw new Error(`Depth Anything V2 Small model download/load failed. Check network access, then rerun the build command.\n${String(error)}`);
}
let depthResult;
try {
  depthResult = await estimateDepth(photoPath);
} catch (error) {
  throw new Error(`Depth Anything V2 Small inference failed for ${photoPath}.\n${String(error)}`);
}
const depthImage = depthResult.depth;
if (!depthImage?.data?.length || !depthImage.width || !depthImage.height) {
  throw new Error('Depth Anything V2 Small returned no usable depth image.');
}

// Browser decoding keeps the script independent of extra JPEG/PNG native addons.
const sourcePhoto = await readFile(photoPath);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
let sourcePng;
try {
  const page = await browser.newPage();
  const dataUrl = `data:image/jpeg;base64,${sourcePhoto.toString('base64')}`;
  await page.setContent(`<img id="photo" src="${dataUrl}">`);
  const decoded = await page.evaluate(async () => {
    const image = document.querySelector('#photo');
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    return { width: canvas.width, height: canvas.height, dataUrl: canvas.toDataURL('image/png') };
  });
  sourcePng = PNG.sync.read(Buffer.from(decoded.dataUrl.split(',')[1], 'base64'));
} finally {
  await browser.close();
}

const width = sourcePng.width;
const height = sourcePng.height;
const sourceLum = new Float32Array(width * height);
const alpha = new Uint8Array(width * height);
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const sourceIndex = (y * sourcePng.width + x) * 4;
  const index = y * width + x;
  sourceLum[index] = (0.2126 * sourcePng.data[sourceIndex] + 0.7152 * sourcePng.data[sourceIndex + 1] + 0.0722 * sourcePng.data[sourceIndex + 2]) / 255;
  const mx = Math.min(cutoutPng.width - 1, Math.floor((x + 0.5) / width * cutoutPng.width));
  const my = Math.min(cutoutPng.height - 1, Math.floor((y + 0.5) / height * cutoutPng.height));
  alpha[index] = cutoutPng.data[(my * cutoutPng.width + mx) * 4 + 3];
}

// Ignore disconnected mask specks while preserving the largest continuous person silhouette.
const componentSeen = new Uint8Array(alpha.length), queue = new Int32Array(alpha.length);
let largestComponent = [];
for (let start = 0; start < alpha.length; start++) {
  if (alpha[start] < 70 || componentSeen[start]) continue;
  let head = 0, tail = 0;
  const members = [];
  queue[tail++] = start; componentSeen[start] = 1;
  while (head < tail) {
    const index = queue[head++]; members.push(index);
    const x = index % width;
    const neighbours = [index - width, index + width, x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1];
    for (const next of neighbours) {
      if (next < 0 || next >= alpha.length || componentSeen[next] || alpha[next] < 70) continue;
      componentSeen[next] = 1; queue[tail++] = next;
    }
  }
  if (members.length > largestComponent.length) largestComponent = members;
}
const personPixels = new Uint8Array(alpha.length);
for (const index of largestComponent) personPixels[index] = 1;
for (let i = 0; i < alpha.length; i++) {
  if (personPixels[i] || alpha[i] < 25) continue;
  const x = i % width;
  const nearPerson = personPixels[i - width] || personPixels[i + width] || (x > 0 && personPixels[i - 1]) || (x + 1 < width && personPixels[i + 1]);
  if (!nearPerson) alpha[i] = 0;
}

const depthData = depthImage.data;
const depthWidth = depthImage.width, depthHeight = depthImage.height;
let depthMin = Infinity, depthMax = -Infinity;
for (const value of depthData) { depthMin = Math.min(depthMin, value); depthMax = Math.max(depthMax, value); }
if (!Number.isFinite(depthMin) || depthMax - depthMin < 1e-6) throw new Error('Depth map has no usable depth range.');
const depth = new Float32Array(width * height);
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const dx = Math.min(depthWidth - 1, Math.floor((x + 0.5) / width * depthWidth));
  const dy = Math.min(depthHeight - 1, Math.floor((y + 0.5) / height * depthHeight));
  depth[y * width + x] = (depthData[dy * depthWidth + dx] - depthMin) / (depthMax - depthMin);
}

// A 5x5 Gaussian-like kernel softens model noise while preserving facial planes.
const kernel = [1, 4, 6, 4, 1];
const horizontal = new Float32Array(depth.length), smoothDepth = new Float32Array(depth.length);
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  let sum = 0, weight = 0;
  for (let k = -2; k <= 2; k++) {
    const sx = Math.max(0, Math.min(width - 1, x + k)), w = kernel[k + 2];
    sum += depth[y * width + sx] * w; weight += w;
  }
  horizontal[y * width + x] = sum / weight;
}
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  let sum = 0, weight = 0;
  for (let k = -2; k <= 2; k++) {
    const sy = Math.max(0, Math.min(height - 1, y + k)), w = kernel[k + 2];
    sum += horizontal[sy * width + x] * w; weight += w;
  }
  smoothDepth[y * width + x] = sum / weight;
}

let minX = width, maxX = -1, minY = height, maxY = -1;
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  if (alpha[y * width + x] <= 25) continue;
  minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
}
if (maxX < minX || maxY < minY) throw new Error('Background removal returned an empty person mask.');
const personHeight = maxY - minY + 1;
const centerX = (minX + maxX) / 2;
const candidates = [], cumulative = [];
let totalWeight = 0;
for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
  const index = y * width + x;
  if (alpha[index] <= 25) continue;
  const left = sourceLum[y * width + Math.max(0, x - 1)], right = sourceLum[y * width + Math.min(width - 1, x + 1)];
  const up = sourceLum[Math.max(0, y - 1) * width + x], down = sourceLum[Math.min(height - 1, y + 1) * width + x];
  const contrast = (Math.abs(sourceLum[index] - left) + Math.abs(sourceLum[index] - right) + Math.abs(sourceLum[index] - up) + Math.abs(sourceLum[index] - down)) * 0.25;
  const imageEdge = Math.min(1, Math.hypot(right - left, down - up) * 1.8);
  const maskEdge = Math.min(1, Math.abs(alpha[index] - Math.min(alpha[y * width + Math.max(0, x - 1)], alpha[y * width + Math.min(width - 1, x + 1)], alpha[Math.max(0, y - 1) * width + x], alpha[Math.min(height - 1, y + 1) * width + x])) / 180);
  const vertical = (y - minY) / personHeight;
  const shoulderBottomFade = vertical > 0.62 ? 1 - 0.55 * smoothstep(0.62, 1, vertical) : 1;
  const weight = (0.025 + contrast * 3.5 + imageEdge * 2.7 + maskEdge * 4.2) * (alpha[index] / 255) * shoulderBottomFade;
  if (weight <= 0) continue;
  totalWeight += weight;
  candidates.push({ x, y, index });
  cumulative.push(totalWeight);
}
if (candidates.length < 100 || !totalWeight) throw new Error('Person mask did not contain enough sampleable pixels.');

let randomState = 0x4f1bbcdc;
const random = () => {
  randomState = (randomState * 1664525 + 1013904223) >>> 0;
  return randomState / 0x100000000;
};
const pointCount = 45_000;
const output = new Float32Array(pointCount * 3);
for (let i = 0; i < pointCount; i++) {
  const target = random() * totalWeight;
  let low = 0, high = cumulative.length - 1;
  while (low < high) { const mid = (low + high) >> 1; if (cumulative[mid] < target) low = mid + 1; else high = mid; }
  const pixel = candidates[low];
  const x = pixel.x + random() - 0.5;
  const y = pixel.y + random() - 0.5;
  const vertical = Math.max(0, Math.min(1, (y - minY) / personHeight));
  const zFalloff = vertical > 0.58 ? 1 - 0.68 * smoothstep(0.58, 1, vertical) : 1;
  const z = smoothDepth[pixel.index] - 0.5;
  output[i * 3] = (x - centerX) / personHeight;
  output[i * 3 + 1] = 0.5 - (y - minY) / personHeight;
  output[i * 3 + 2] = z * 0.25 * zFalloff;
}

const preview = new PNG({ width: 1024, height: 1024 });
for (let i = 0; i < preview.data.length; i += 4) {
  preview.data[i] = 38; preview.data[i + 1] = 38; preview.data[i + 2] = 43; preview.data[i + 3] = 255;
}
for (let i = 0; i < output.length; i += 3) {
  const px = Math.round(512 + output[i] * 850);
  const py = Math.round(512 - output[i + 1] * 850);
  if (px < 1 || px >= 1023 || py < 1 || py >= 1023) continue;
  const value = Math.round(145 + Math.min(0.11, Math.abs(output[i + 2])) * 900);
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    if (ox * ox + oy * oy > 1) continue;
    const p = ((py + oy) * preview.width + px + ox) * 4;
    preview.data[p] = Math.max(preview.data[p], value);
    preview.data[p + 1] = Math.max(preview.data[p + 1], value);
    preview.data[p + 2] = Math.max(preview.data[p + 2], value);
  }
}

await mkdir(path.dirname(outPath), { recursive: true });
await mkdir(path.dirname(previewPath), { recursive: true });
await writeFile(outPath, Buffer.from(output.buffer));
await writeFile(previewPath, PNG.sync.write(preview));
console.log(`Wrote ${pointCount.toLocaleString()} photo-derived head-and-shoulders points to public/shapes/face.bin`);
console.log(`Wrote front projection preview to debug/face-preview.png`);

function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
