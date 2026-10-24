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

await page.goto(`${baseUrl}/src/engine/demo.html`, { waitUntil: 'networkidle' });
await page.locator('#shape-step').evaluate((el, value) => { el.value = String(value); el.dispatchEvent(new Event('input', { bubbles: true })); }, 0);
await page.waitForTimeout(1500);
const demo0 = await screenshot('demo-0.png');
await page.locator('#shape-step').evaluate((el, value) => { el.value = String(value); el.dispatchEvent(new Event('input', { bubbles: true })); }, 0.5);
await page.waitForTimeout(1000);
const demo05aBytes = await page.screenshot({ path: fileURLToPath(new URL('demo-0.5-a.png', outDir)) });
const demo05a = pixelStats(demo05aBytes);
await page.waitForTimeout(1000);
const demo05bBytes = await page.screenshot({ path: fileURLToPath(new URL('demo-0.5-b.png', outDir)) });
const demo05b = pixelStats(demo05bBytes);
const a = PNG.sync.read(demo05aBytes), b = PNG.sync.read(demo05bBytes);
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
  demo: { 0: demo0, '0.5': demo05a },
  main: mainScreenshots,
  animationDifference,
  errors,
};
console.log(JSON.stringify(results, null, 2));
const metricPass = [demo0, demo05a, ...mainScreenshots].every((m) => m.saturation < 0.12 && m.coverage >= 0.02 && m.coverage <= 0.4);
if (errors.length || !metricPass || animationDifference < 0.002) process.exitCode = 1;
