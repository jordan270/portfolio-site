import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const baseUrl = process.argv[2] || 'http://localhost:5173';
const outDir = new URL('../debug/', import.meta.url);
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
await page.route('https://fonts.gstatic.com/**', (route) => route.fulfill({ status: 200, contentType: 'font/woff2', body: Buffer.alloc(0) }));

function pixelStats(bytes) {
  const png = PNG.sync.read(bytes);
  const background = (0.2126 * 38 + 0.7152 * 38 + 0.0722 * 43);
  let saturated = 0, covered = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const luminance = 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2];
    if (luminance > 200) saturated++;
    if (luminance > background + 20) covered++;
  }
  const total = png.width * png.height;
  return { saturation: saturated / total, coverage: covered / total, width: png.width, height: png.height };
}

async function screenshot(name) {
  const bytes = await page.screenshot({ path: fileURLToPath(new URL(name, outDir)), animations: 'disabled' });
  return pixelStats(bytes);
}

await page.goto(`${baseUrl}/src/engine/demo.html?quality=high`, { waitUntil: 'networkidle' });
const shapeNames = ['face', 'tower', 'lens', 'f1', 'dust'];
const demo = {};
for (let i = 0; i < shapeNames.length; i++) {
  await page.locator('#shape-step').evaluate((el, value) => { el.value = String(value); el.dispatchEvent(new Event('input', { bubbles: true })); }, i);
  await page.waitForTimeout(900);
  demo[shapeNames[i]] = await screenshot(`demo-${shapeNames[i]}.png`);
}
await page.locator('#shape-step').evaluate((el) => { el.value = '0'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await page.waitForTimeout(500);
const demoFrameABytes = await page.screenshot({ path: fileURLToPath(new URL('demo-face-a.png', outDir)) });
await page.waitForTimeout(1000);
const demoFrameBBytes = await page.screenshot({ path: fileURLToPath(new URL('demo-face-b.png', outDir)) });
const a = PNG.sync.read(demoFrameABytes), b = PNG.sync.read(demoFrameBBytes);
let changedPixels = 0;
for (let i = 0; i < a.data.length; i += 4) {
  if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > 8) changedPixels++;
}
const animationDifference = changedPixels / (a.width * a.height);

await page.goto(baseUrl, { waitUntil: 'networkidle' });
const maxScroll = await page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - innerHeight));
const mainScreenshots = [];
for (const fraction of [0, 0.25, 0.5, 0.75]) {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), maxScroll * fraction);
  await page.waitForTimeout(350);
  mainScreenshots.push({ position: fraction, ...(await screenshot(`main-${fraction}.png`)) });
}

await browser.close();
const results = {
  baseUrl,
  demo,
  main: mainScreenshots,
  animationDifference,
  errors,
};
console.log(JSON.stringify(results, null, 2));
const metricPass = [...Object.values(demo), ...mainScreenshots].every((m) => m.saturation < 0.12 && m.coverage >= 0.02 && m.coverage <= 0.4);
if (errors.length || !metricPass || animationDifference < 0.002) process.exitCode = 1;
