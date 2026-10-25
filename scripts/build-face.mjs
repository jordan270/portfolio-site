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
if (!photoPath || !existsSync(photoPath)) throw new Error(`Photo not found in ${path.join(root, 'private')}. Accepted files, checked in order: face.jpg, face.jpeg, face.png.`);

let pipeline;
try {
  ({ pipeline } = await import('@huggingface/transformers'));
} catch (error) {
  throw new Error(`Depth-estimation package is missing. Install it with: npm install --no-save --package-lock=false @imgly/background-removal-node @huggingface/transformers\n${String(error)}`);
}

console.log(`Using photo: ${path.relative(root, photoPath)}`);
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
  const mime = path.extname(photoPath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
  const dataUrl = `data:${mime};base64,${sourcePhoto.toString('base64')}`;
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
// Approximate head bounds from the upper mask rows. The face oval is centered
// in that head; all remaining head pixels and its silhouette go to HAIR.
const rowWidths = [];
for (let y = minY; y <= Math.min(maxY, minY + personHeight * 0.42); y++) {
  let left = width, right = -1;
  for (let x = minX; x <= maxX; x++) if (alpha[y * width + x] > 25) { left = Math.min(left, x); right = Math.max(right, x); }
  if (right >= left) rowWidths.push({ y, left, right, width: right - left + 1 });
}
const headRows = rowWidths.filter((row) => row.y < minY + personHeight * 0.34);
const headMinY = minY, headMaxY = Math.max(minY + 1, ...headRows.map((row) => row.y));
const faceRows = headRows.filter((row) => row.y > minY + (headMaxY - minY) * 0.22 && row.y < minY + (headMaxY - minY) * 0.82);
const headWidth = Math.max(2, ...faceRows.map((row) => row.width));
const faceCenterY = minY + (headMaxY - minY) * 0.53;
const faceRadiusX = headWidth * 0.39, faceRadiusY = (headMaxY - headMinY) * 0.35;
const faceBottom = faceCenterY + faceRadiusY;

// CLAHE-style tile equalization makes edges on softly lit skin measurable.
const equalized = clahe(sourceLum, width, height);
const blurred = gaussianBlur(sourceLum, width, height, 6);
const facePixels = [], hairPixels = [], bodyPixels = [];
for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
  const index = y * width + x;
  if (alpha[index] <= 25) continue;
  const inFace = ((x - centerX) / faceRadiusX) ** 2 + ((y - faceCenterY) / faceRadiusY) ** 2 <= 1 && y <= faceBottom;
  const left = sourceLum[y * width + Math.max(0, x - 1)], right = sourceLum[y * width + Math.min(width - 1, x + 1)];
  const up = sourceLum[Math.max(0, y - 1) * width + x], down = sourceLum[Math.min(height - 1, y + 1) * width + x];
  const eqEdge = Math.min(1, Math.hypot(equalized[y * width + Math.min(width - 1, x + 1)] - equalized[y * width + Math.max(0, x - 1)], equalized[Math.min(height - 1, y + 1) * width + x] - equalized[Math.max(0, y - 1) * width + x]) * 2.2);
  const smoothEdge = Math.min(1, Math.hypot(blurred[y * width + Math.min(width - 1, x + 1)] - blurred[y * width + Math.max(0, x - 1)], blurred[Math.min(height - 1, y + 1) * width + x] - blurred[Math.max(0, y - 1) * width + x]) * 3.4);
  const maskEdge = Math.min(1, Math.abs(alpha[index] - Math.min(alpha[y * width + Math.max(0, x - 1)], alpha[y * width + Math.min(width - 1, x + 1)], alpha[Math.max(0, y - 1) * width + x], alpha[Math.min(height - 1, y + 1) * width + x])) / 150);
  const vertical = (y - minY) / personHeight;
  const side = Math.abs((x - centerX) / Math.max(1, (maxX - minX) / 2));
  const fade = 1 - smoothstep(0.72, 1, Math.max(vertical, side));
  const aa = alpha[index] / 255;
  if (inFace) facePixels.push({ x, y, index, weight: (0.65 + eqEdge * 3.5) * aa });
  else if (y < faceBottom + personHeight * 0.025) hairPixels.push({ x, y, index, weight: (0.18 + eqEdge * 1.6 + maskEdge * 4) * aa });
  else if (y > faceBottom) bodyPixels.push({ x, y, index, weight: Math.min(0.26, (0.03 + smoothEdge * 1.3 + maskEdge * 2.2) * aa) * fade });
}
if (facePixels.length < 100 || hairPixels.length < 50 || bodyPixels.length < 100) throw new Error('Person mask did not contain enough pixels for face, hair, and body regions.');

function makeSampler(pixels, count) {
  const cumulative = []; let total = 0;
  for (const pixel of pixels) { total += pixel.weight; cumulative.push(total); }
  return { pixels, cumulative, total, count };
}
const samplers = [makeSampler(facePixels, 20_250), makeSampler(hairPixels, 9_000), makeSampler(bodyPixels, 15_750)];

let randomState = 0x4f1bbcdc;
const random = () => {
  randomState = (randomState * 1664525 + 1013904223) >>> 0;
  return randomState / 0x100000000;
};
const pointCount = 45_000;
const output = new Float32Array(pointCount * 3);
let out = 0;
for (const sampler of samplers) for (let n = 0; n < sampler.count; n++, out++) {
  const target = random() * sampler.total;
  let low = 0, high = sampler.cumulative.length - 1;
  while (low < high) { const mid = (low + high) >> 1; if (sampler.cumulative[mid] < target) low = mid + 1; else high = mid; }
  const pixel = sampler.pixels[low];
  const x = pixel.x + random() - 0.5, y = pixel.y + random() - 0.5;
  let z = smoothDepth[pixel.index] - 0.5;
  if (sampler === samplers[0]) {
    const nx = (x - centerX) / faceRadiusX, ny = (y - faceCenterY) / faceRadiusY;
    const ridge = Math.exp(-((Math.abs(nx) - 0.34) ** 2 / 0.012 + (ny + 0.12) ** 2 / 0.018)) * 0.12;
    const nose = Math.exp(-(nx ** 2 / 0.035 + (ny - 0.12) ** 2 / 0.06)) * 0.18;
    z += ridge + nose;
  }
  output[out * 3] = (x - centerX) / personHeight;
  output[out * 3 + 1] = 0.5 - (y - minY) / personHeight;
  output[out * 3 + 2] = z * 0.25;
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

async function findPhoto(argument) {
  if (argument) return path.resolve(argument);
  const dir = path.join(root, 'private');
  if (!existsSync(dir)) return null;
  const names = await readdir(dir);
  const match = ['face.jpg', 'face.jpeg', 'face.png'].find((name) => names.includes(name));
  return match ? path.join(dir, match) : null;
}

function clahe(input, w, h) {
  const tilesX = 8, tilesY = 8, maps = [];
  const tileW = Math.ceil(w / tilesX), tileH = Math.ceil(h / tilesY);
  for (let ty = 0; ty < tilesY; ty++) for (let tx = 0; tx < tilesX; tx++) {
    const hist = new Uint32Array(256); let n = 0;
    for (let y = ty * tileH; y < Math.min(h, (ty + 1) * tileH); y++) for (let x = tx * tileW; x < Math.min(w, (tx + 1) * tileW); x++) { hist[Math.round(input[y * w + x] * 255)]++; n++; }
    const limit = Math.max(1, Math.floor(n / 256 * 2)); let excess = 0;
    for (let i = 0; i < 256; i++) if (hist[i] > limit) { excess += hist[i] - limit; hist[i] = limit; }
    for (let i = 0; i < 256; i++) hist[i] += Math.floor(excess / 256);
    const lut = new Float32Array(256); let sum = 0;
    for (let i = 0; i < 256; i++) { sum += hist[i]; lut[i] = sum / Math.max(1, n); }
    maps.push(lut);
  }
  const out = new Float32Array(input.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const tx = Math.min(tilesX - 1, Math.floor(x / tileW)), ty = Math.min(tilesY - 1, Math.floor(y / tileH));
    out[y * w + x] = maps[ty * tilesX + tx][Math.round(input[y * w + x] * 255)];
  }
  return out;
}

function gaussianBlur(input, w, h, sigma) {
  const radius = Math.ceil(sigma * 3), kernel = [];
  let total = 0;
  for (let i = -radius; i <= radius; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); kernel.push(v); total += v; }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= total;
  const temp = new Float32Array(input.length), out = new Float32Array(input.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let k = -radius; k <= radius; k++) v += input[y * w + Math.max(0, Math.min(w - 1, x + k))] * kernel[k + radius]; temp[y * w + x] = v; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let k = -radius; k <= radius; k++) v += temp[Math.max(0, Math.min(h - 1, y + k)) * w + x] * kernel[k + radius]; out[y * w + x] = v; }
  return out;
}
