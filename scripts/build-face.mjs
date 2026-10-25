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
const personHeight = maxY - minY + 1, centerX = (minX + maxX + 1) / 2;

// Distance layers put the thin outline sample 2–3 source pixels inside the mask.
const edgeDistance = new Uint8Array(length); head = 0; tail = 0;
for (const i of inside) {
  const x = i % width;
  if (x === 0 || x === width - 1 || i < width || i >= length - width || !component[i - 1] || !component[i + 1] || !component[i - width] || !component[i + width]) {
    edgeDistance[i] = 1; queue[tail++] = i;
  }
}
while (head < tail) {
  const i = queue[head++], nextDistance = Math.min(255, edgeDistance[i] + 1), x = i % width;
  for (const next of [i - width, i + width, x > 0 ? i - 1 : -1, x + 1 < width ? i + 1 : -1]) {
    if (next >= 0 && next < length && component[next] && !edgeDistance[next]) { edgeDistance[next] = nextDistance; queue[tail++] = next; }
  }
}
const rim = inside.filter((i) => edgeDistance[i] === 2 || edgeDistance[i] === 3);
if (!rim.length) throw new Error('Person mask has no usable 2–3 pixel inner rim.');

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

let seed = 0x4f1bbcdc;
const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; };
const pointCount = 70_000, rimCount = Math.round(pointCount * 0.08), uniformCount = pointCount - rimCount;
const output = new Float32Array(pointCount * 3), isRim = new Uint8Array(pointCount);
function sampleFrom(pool, index, pointIndex, rimPoint) {
  let pixel;
  for (;;) {
    pixel = pool[Math.floor(random() * pool.length)];
    const y = Math.floor(pixel / width), vertical = (y - minY + 0.5) / personHeight;
    const fade = 1 - smoothstep(0.97, 1, vertical);
    if (random() <= fade) break;
  }
  const x = pixel % width, y = Math.floor(pixel / width);
  output[index] = ((x + 0.5) - centerX) / personHeight;
  output[index + 1] = 0.5 - ((y - minY + 0.5) / personHeight) - 0.0625;
  output[index + 2] = (smoothDepth[pixel] - 0.5) * 0.15;
  if (rimPoint) isRim[pointIndex] = 1;
}
for (let i = 0; i < uniformCount; i++) sampleFrom(inside, i * 3, i, false);
for (let i = uniformCount; i < pointCount; i++) sampleFrom(rim, i * 3, i, true);

const preview = new PNG({ width: 1024, height: 1024 });
for (let i = 0; i < preview.data.length; i += 4) { preview.data[i] = 38; preview.data[i + 1] = 38; preview.data[i + 2] = 43; preview.data[i + 3] = 255; }
for (let i = 0; i < pointCount; i++) {
  const x = Math.round(512 + output[i * 3] * 3.2 / 3.48 * 1024);
  const y = Math.round(512 - output[i * 3 + 1] * 3.2 / 3.48 * 1024);
  const radius = isRim[i] ? 1 : 0, value = isRim[i] ? 150 : 90;
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
console.log(`Sampled ${uniformCount.toLocaleString()} uniform area points and ${rimCount.toLocaleString()} inner-rim points; depth span 0.15 figure heights.`);
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
