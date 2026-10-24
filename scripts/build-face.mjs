import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const photoPath = path.join(root, 'private', 'face.jpg');
const outPath = path.join(root, 'public', 'shapes', 'face.bin');
if (!existsSync(photoPath)) throw new Error('Photo not found. Put a front-facing image at private/face.jpg, then rerun this script.');

const require = createRequire(import.meta.url);
let visionEntry;
try { visionEntry = require.resolve('@mediapipe/tasks-vision'); }
catch { throw new Error('MediaPipe is not installed. Run `npm install --no-save @mediapipe/tasks-vision` once, then rerun `node scripts/build-face.mjs`.'); }
const visionDir = path.dirname(visionEntry);
const wasmDir = path.join(visionDir, 'wasm');
const modelPath = path.join(os.tmpdir(), 'particle-site-face-landmarker.task');
const modelUrl = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
if (!existsSync(modelPath)) {
  const response = await fetch(modelUrl);
  if (!response.ok) throw new Error(`Could not download Face Landmarker model (${response.status})`);
  await writeFile(modelPath, Buffer.from(await response.arrayBuffer()));
}
const photo = await readFile(photoPath);

const html = `<!doctype html><meta charset="utf-8"><img id="photo" src="/face.jpg" style="display:none"><script type="module">
import { FilesetResolver, FaceLandmarker } from '/vision_bundle.mjs';
try {
  const files = await FilesetResolver.forVisionTasks('/wasm');
  const landmarker = await FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: '/model.task' }, runningMode: 'IMAGE', numFaces: 1 });
  const image = document.querySelector('#photo');
  if (!image.complete || !image.naturalWidth) await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
  const result = landmarker.detect(image);
  if (!result.faceLandmarks?.length) throw new Error('No face detected. Use a clear, front-facing photo.');
  const landmarks = result.faceLandmarks[0].slice(0, 468).map(({ x, y, z }) => ({ x, y, z }));
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
  window.__faceResult = { landmarks, width: canvas.width, height: canvas.height, rgba: Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data) };
} catch (error) { window.__faceError = error?.stack || String(error); }
</script>`;

const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); }
    else if (pathname === '/face.jpg') { res.writeHead(200, { 'content-type': 'image/jpeg' }); res.end(photo); }
    else if (pathname === '/model.task') { res.writeHead(200, { 'content-type': 'application/octet-stream' }); res.end(await readFile(modelPath)); }
    else if (pathname === '/vision_bundle.mjs') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(await readFile(visionEntry)); }
    else if (pathname.startsWith('/wasm/')) {
      const filename = path.basename(pathname.slice('/wasm/'.length));
      const contentType = filename.endsWith('.wasm') ? 'application/wasm' : 'text/javascript';
      res.writeHead(200, { 'content-type': contentType }); res.end(await readFile(path.join(wasmDir, filename)));
    } else { res.writeHead(404); res.end('Not found'); }
  } catch (error) { res.writeHead(500); res.end(String(error)); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${address.port}/`);
await page.waitForFunction(() => window.__faceResult || window.__faceError, null, { timeout: 120_000 });
const result = await page.evaluate(() => ({ result: window.__faceResult, error: window.__faceError }));
await browser.close();
await new Promise((resolve) => server.close(resolve));
if (result.error) throw new Error(result.error);

const { landmarks, width, height, rgba } = result.result;
const oval = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const polygon = oval.map((index) => landmarks[index]);
const minX = Math.min(...polygon.map((p) => p.x)), maxX = Math.max(...polygon.map((p) => p.x));
const chinY = Math.max(...polygon.map((p) => p.y));
const pointInPolygon = (x, y) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if (((a.y > y) !== (b.y > y)) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y + 1e-12) + a.x) inside = !inside;
  }
  return inside;
};

// Bowyer-Watson Delaunay triangulation of the Face Landmarker mesh.
const vertices = [...landmarks];
const span = Math.max(maxX - minX, chinY - Math.min(...polygon.map((p) => p.y)));
for (let row = 1; row <= 5; row++) for (let col = 0; col <= 8; col++) {
  vertices.push({ x: minX + (maxX - minX) * col / 8, y: chinY + span * 0.2 * row / 5, z: (landmarks[152].z || 0) * (1 - row / 8) });
}
const coords = vertices.map((p) => [p.x, p.y]);
const allX = coords.map((p) => p[0]), allY = coords.map((p) => p[1]);
const loX = Math.min(...allX), hiX = Math.max(...allX), loY = Math.min(...allY), hiY = Math.max(...allY);
const d = Math.max(hiX - loX, hiY - loY) * 20;
const centerX = (loX + hiX) / 2, centerY = (loY + hiY) / 2;
const realCount = coords.length;
coords.push([centerX - d, centerY - d], [centerX, centerY + d], [centerX + d, centerY - d]);
let triangles = [[realCount, realCount + 1, realCount + 2]];
const circumcircleContains = (tri, p) => {
  const [a, b, c] = tri.map((i) => coords[i]);
  const ax = a[0] - p[0], ay = a[1] - p[1], bx = b[0] - p[0], by = b[1] - p[1], cx = c[0] - p[0], cy = c[1] - p[1];
  const det = (ax*ax+ay*ay)*(bx*cy-by*cx) - (bx*bx+by*by)*(ax*cy-ay*cx) + (cx*cx+cy*cy)*(ax*by-ay*bx);
  const orient = (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]);
  return orient > 0 ? det > 0 : det < 0;
};
for (let p = 0; p < realCount; p++) {
  const bad = [], edges = new Map();
  for (let t = 0; t < triangles.length; t++) if (circumcircleContains(triangles[t], coords[p])) bad.push(t);
  for (const t of bad) for (const [a, b] of [[triangles[t][0],triangles[t][1]],[triangles[t][1],triangles[t][2]],[triangles[t][2],triangles[t][0]]]) {
    const key = a < b ? `${a},${b}` : `${b},${a}`; const edge = edges.get(key);
    if (edge) edge.count++; else edges.set(key, { a, b, count: 1 });
  }
  const badSet = new Set(bad); triangles = triangles.filter((_, index) => !badSet.has(index));
  for (const edge of edges.values()) if (edge.count === 1) triangles.push([edge.a, edge.b, p]);
}
triangles = triangles.filter((tri) => tri.every((i) => i < realCount));

const grayAndEdge = (p) => {
  const px = Math.max(1, Math.min(width - 2, Math.round(p.x * width))), py = Math.max(1, Math.min(height - 2, Math.round(p.y * height)));
  const lum = (x, y) => { const i = (y * width + x) * 4; return (0.2126*rgba[i] + 0.7152*rgba[i+1] + 0.0722*rgba[i+2]) / 255; };
  const value = lum(px, py), edge = Math.min(1, (Math.abs(lum(px+1,py)-lum(px-1,py)) + Math.abs(lum(px,py+1)-lum(px,py-1))) * 3.2);
  return { feature: 0.14 + (1 - value) * 0.68 + edge * 0.95, edge };
};
const weighted = [];
let cumulative = 0;
for (const tri of triangles) {
  const points = tri.map((index) => vertices[index]);
  const cx = points.reduce((sum,p)=>sum+p.x,0)/3, cy = points.reduce((sum,p)=>sum+p.y,0)/3;
  const inFace = pointInPolygon(cx, cy);
  const inNeck = cx >= minX && cx <= maxX && cy > chinY && cy < chinY + span * 0.2;
  if (!inFace && !inNeck) continue;
  const area = Math.abs((points[1].x-points[0].x)*(points[2].y-points[0].y) - (points[1].y-points[0].y)*(points[2].x-points[0].x)) / 2;
  if (area < 1e-9) continue;
  const feature = points.reduce((sum,p)=>sum+grayAndEdge(p).feature,0)/3;
  const neckFade = inNeck ? Math.max(0.04, 1 - (cy - chinY) / (span * 0.2)) ** 2 : 1;
  cumulative += area * feature * neckFade;
  weighted.push({ tri: points, cumulative });
}
if (!weighted.length || cumulative <= 0) throw new Error('Could not triangulate the detected face region.');
const output = new Float32Array(40_000 * 3);
for (let i = 0; i < 40_000; i++) {
  const target = Math.random() * cumulative;
  let low = 0, high = weighted.length - 1;
  while (low < high) { const mid = (low + high) >> 1; if (weighted[mid].cumulative < target) low = mid + 1; else high = mid; }
  const [a,b,c] = weighted[low].tri;
  const root = Math.sqrt(Math.random()), v = Math.random();
  const wa = 1-root, wb = root*(1-v), wc = root*v;
  output[i*3] = wa*a.x + wb*b.x + wc*c.x;
  output[i*3+1] = wa*a.y + wb*b.y + wc*c.y;
  output[i*3+2] = wa*a.z + wb*b.z + wc*c.z;
}
let min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
for (let i=0;i<output.length;i+=3) for (let axis=0;axis<3;axis++) { min[axis]=Math.min(min[axis],output[i+axis]); max[axis]=Math.max(max[axis],output[i+axis]); }
const center = min.map((value,axis)=>(value+max[axis])/2), scale = Math.max(...max.map((value,axis)=>value-min[axis]));
for (let i=0;i<output.length;i+=3) {
  output[i]=(output[i]-center[0])/scale;
  output[i+1]=-(output[i+1]-center[1])/scale;
  output[i+2]=(output[i+2]-center[2])/scale;
}
await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, Buffer.from(output.buffer));
console.log(`Wrote ${output.length/3} face points to public/shapes/face.bin`);
