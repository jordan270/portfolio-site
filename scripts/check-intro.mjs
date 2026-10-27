import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const baseUrl = process.argv[2] || 'http://127.0.0.1:4173/';
const viewports = [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }];
const scenarios = [
  { name: 'normal', query: '?debug=1&fast=1' },
  { name: 'slow', query: '?debug=1&slow=1' },
  { name: 'repeat', query: '?debug=1&fast=1', repeat: true },
];
await mkdir('debug', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = [];
for (const scenario of scenarios) for (const viewport of viewports) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  if (scenario.repeat) await page.addInitScript(() => sessionStorage.setItem('introSeen', '1'));
  await page.goto(new URL(scenario.query, baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  const during = await page.evaluate(() => ({
    loaderVisible: !!document.querySelector('#boot-loader:not([hidden])'),
    bootCanvas: (() => { const canvas = document.querySelector('#boot-canvas'); return canvas ? { width: canvas.width, height: canvas.height, opacity: getComputedStyle(canvas).opacity } : null; })(),
    debug: window.__introDebug ?? null,
  }));
  const bootShot = await page.screenshot({ path: `debug/intro-boot-${scenario.name}-${viewport.width}.png` });
  const bootPng = PNG.sync.read(bootShot);
  await page.waitForFunction(() => {
    const debug = window.__introDebug;
    return !!debug && document.querySelector('#main')?.style.visibility !== 'hidden' && debug.progress === 1;
  }, { timeout: 11000 });
  const final = await page.evaluate(() => ({
    debug: window.__introDebug ?? null,
    loaderHidden: document.querySelector('#boot-loader')?.hasAttribute('hidden') ?? false,
    mainVisibility: getComputedStyle(document.querySelector('#main')).visibility,
    renderer: window.__particleEnginePerf ?? null,
  }));
  const endShot = await page.screenshot({ path: `debug/intro-hero-${scenario.name}-${viewport.width}.png` });
  results.push({ path: scenario.name, viewport, boot: { loaderVisible: during.loaderVisible, canvas: during.bootCanvas, screenshot: `${bootPng.width}x${bootPng.height}` }, final, errors });
  if (!during.loaderVisible || bootPng.width !== viewport.width || bootPng.height !== viewport.height) throw new Error(`Boot scatter was not full screen: ${scenario.name} ${viewport.width}`);
  if (!final.loaderHidden || final.mainVisibility !== 'visible' || errors.length) throw new Error(`Intro did not finish cleanly: ${scenario.name} ${viewport.width} ${JSON.stringify({ final, errors })}`);
  await context.close();
}
await browser.close();
console.table(results.map(({ path, viewport, boot, final, errors }) => ({ path, viewport: `${viewport.width}x${viewport.height}`, bootFullScreen: boot.screenshot, tier: final.debug?.tier, loaderHidden: final.loaderHidden, errors: errors.length })));
console.log(JSON.stringify(results, null, 2));
