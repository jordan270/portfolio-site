import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const baseUrl = process.argv[2] || 'http://localhost:5173';
const outDir = new URL('../debug/', import.meta.url);
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
await page.route('https://fonts.gstatic.com/**', (route) => route.fulfill({ status: 200, contentType: 'font/woff2', body: Buffer.alloc(0) }));

function pixelStats(bytes) {
  const png = PNG.sync.read(bytes);
  let bright = 0, covered = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const lum = 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2];
    if (lum > 200) bright++;
    if (lum > 58) covered++;
  }
  const total = png.width * png.height;
  return { saturation: bright / total, coverage: covered / total, width: png.width, height: png.height };
}
async function screenshot(name, allowAnimations = false) {
  const options = { path: fileURLToPath(new URL(name, outDir)) };
  if (!allowAnimations) options.animations = 'disabled';
  const bytes = await page.screenshot(options);
  return { bytes, ...pixelStats(bytes) };
}

const shapeNames = ['face', 'india', 'tower', 'lens', 'bubble', 'f1', 'dust'];
await page.goto(`${baseUrl}/src/engine/demo.html?quality=high&debugMasks=1`, { waitUntil: 'networkidle' });
const demo = {};
for (let i = 0; i < shapeNames.length; i++) {
  await page.locator('#shape-step').evaluate((el, value) => { el.value = String(value); el.dispatchEvent(new Event('input', { bubbles: true })); }, i);
  await page.waitForTimeout(700);
  demo[shapeNames[i]] = await screenshot(`demo-${shapeNames[i]}.png`);
  delete demo[shapeNames[i]].bytes;
}
const maskDebug = await page.evaluate(() => window.__shapeMaskDebug ?? {});
let f1MaskWidthRatio = 0;
for (const [shape, mask] of Object.entries(maskDebug)) {
  if (mask?.dataUrl) await writeFile(fileURLToPath(new URL(`mask-${shape}.png`, outDir)), Buffer.from(mask.dataUrl.split(',')[1], 'base64'));
  if (shape === 'f1') f1MaskWidthRatio = mask?.bboxWidthRatio ?? 0;
}

await page.goto(baseUrl, { waitUntil: 'networkidle' });
const viewports = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];
const sectionIds = ['hero', 'location', 'autopilot', 'lens', 'sentiment', 'analyzer', 'contact'];
const sectionShapes = ['face', 'india', 'tower', 'lens', 'bubble', 'f1', 'dust'];
const slides = [];
const contactChecks = [];
let contactAnimationDifference = 0;
let firstContactFrame;

for (const viewport of viewports) {
  await page.setViewportSize(viewport);
  await page.waitForTimeout(250);
  for (const [index, id] of sectionIds.entries()) {
    const shape = sectionShapes[index];
    const element = page.locator(`#${id}`);
    await element.evaluate((el) => window.scrollTo(0, el.offsetTop + Math.max(0, (el.offsetHeight - innerHeight) / 2)));
    await page.waitForTimeout(1100);
    const visual = await screenshot(`slide-${viewport.width}-${id}.png`);
    const check = await page.evaluate(({ id, shape }) => {
      const section = document.getElementById(id);
      const content = section?.querySelector('.content-block');
      if (!section || !content) return { missing: true };
      const rect = content.getBoundingClientRect();
      const minDimension = Math.min(innerWidth, innerHeight);
      const radiusX = minDimension * (shape === 'tower' ? 0.21 : shape === 'india' ? 0.19 : 0.19);
      const scale = innerWidth <= 768 ? (innerWidth <= 500 ? 0.6 : 0.75) : 1;
      const radiusY = innerHeight * (shape === 'tower' ? 0.28 : 0.21) * scale;
      const side = ['face', 'tower', 'bubble'].includes(shape) ? 1 : -1;
      const desktopOffset = innerWidth > 768 ? side * minDimension * 0.2484 : 0;
      const centerX = innerWidth / 2 + desktopOffset;
      const centerY = innerHeight / 2 - (innerWidth <= 768 ? (innerWidth <= 500 ? 0.9 : 0.4) : 0) * innerHeight * 0.276;
      const overlaps = shape === 'dust' ? false : rect.left < centerX + radiusX && rect.right > centerX - radiusX && rect.top < centerY + radiusY && rect.bottom > centerY - radiusY;
      return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, overlaps, scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth };
    }, { id, shape });
    slides.push({ viewport: viewport.width, id, ...visual, ...check });
    delete slides[slides.length - 1].bytes;

    if (id === 'contact') {
      const capture = await screenshot(`contact-${viewport.width}.png`, true);
      if (viewport.width === 1440) {
        firstContactFrame = capture.bytes;
        await page.waitForTimeout(1500);
        const second = await screenshot('contact-1440-after-1_5s.png', true);
        const a = PNG.sync.read(firstContactFrame), b = PNG.sync.read(second.bytes);
        const box = await page.locator('.contact-infinity').boundingBox();
        let movedBrightPixels = 0;
        if (box) for (let y = Math.max(0, Math.floor(box.y)); y < Math.min(a.height, Math.ceil(box.y + box.height)); y++) {
          for (let x = Math.max(0, Math.floor(box.x)); x < Math.min(a.width, Math.ceil(box.x + box.width)); x++) {
            const i = (y * a.width + x) * 4;
            const lumA = 0.2126 * a.data[i] + 0.7152 * a.data[i + 1] + 0.0722 * a.data[i + 2];
            const lumB = 0.2126 * b.data[i] + 0.7152 * b.data[i + 1] + 0.0722 * b.data[i + 2];
            if ((lumA > 130 || lumB > 130) && Math.abs(lumA - lumB) > 22) movedBrightPixels++;
          }
        }
        contactAnimationDifference = movedBrightPixels / Math.max(1, Math.round(box?.width ?? 1) * Math.round(box?.height ?? 1));
      }
      const bounds = await page.evaluate(() => {
        const section = document.querySelector('#contact');
        const svg = section?.querySelector('.contact-infinity');
        if (!section || !svg) return { missing: true };
        const svgRect = svg.getBoundingClientRect();
        const textElements = Array.from(section.querySelectorAll('.section-label, .contact-lead, .contact-links, .cs50-footer'));
        const svgOverlapsText = textElements.some((el) => {
          const r = el.getBoundingClientRect();
          return r.left < svgRect.right && r.right > svgRect.left && r.top < svgRect.bottom && r.bottom > svgRect.top;
        });
        const textOverflow = [];
        const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          if (!node.textContent?.trim() || node.parentElement?.closest('svg')) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const r of Array.from(range.getClientRects())) if (r.left < -0.5 || r.right > innerWidth + 0.5) textOverflow.push(node.textContent.trim());
        }
        return { svgOverlapsText, textOverflow, svg: { x: svgRect.x, y: svgRect.y, width: svgRect.width, height: svgRect.height }, scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), viewportWidth: innerWidth };
      });
      contactChecks.push({ viewport: viewport.width, ...bounds });
    }
  }
}

await browser.close();
const metricPass = [...Object.values(demo), ...slides].every((m) => m.saturation < 0.12 && m.coverage >= 0.002 && m.coverage <= 0.45);
const overflowPass = slides.every((item) => item.scrollWidth <= item.viewportWidth);
const overlapFailures = slides.filter((item) => item.overlaps || item.missing);
const contactFailures = contactChecks.filter((item) => item.missing || item.svgOverlapsText || item.textOverflow?.length || item.scrollWidth > item.viewportWidth);
const animationPass = contactAnimationDifference > 0.00008;
const results = { baseUrl, demo, slides, contactChecks, contactAnimationDifference, f1MaskWidthRatio, overlapFailures, contactFailures, overflowPass, animationPass, errors };
console.log(JSON.stringify(results, null, 2));
if (errors.length || !metricPass || !animationPass || f1MaskWidthRatio < 0.6 || !overflowPass || overlapFailures.length || contactFailures.length) process.exitCode = 1;
