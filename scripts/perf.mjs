import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.argv[2] || 'http://127.0.0.1:4173/';
const scenarios = [{ name: 'normal', query: '?debugPerf=1&fast=1' }, { name: 'slow', query: '?debugPerf=1&slow=1' }];
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const after = [];
for (const scenario of scenarios) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window), callbackCounts = new Map(), callbackWork = new Map(), frames = [];
    window.requestAnimationFrame = (callback) => raf((time) => {
      callbackCounts.set(time, (callbackCounts.get(time) || 0) + 1);
      const started = performance.now(); callback(time);
      callbackWork.set(time, (callbackWork.get(time) || 0) + performance.now() - started);
      frames.push({ time, engine: window.__particleEnginePerf ? { ...window.__particleEnginePerf } : null });
      if (frames.length > 50000) frames.splice(0, 10000);
    });
    window.__perfFrames = frames; window.__perfCallbackCounts = callbackCounts; window.__perfCallbackWork = callbackWork;
    window.__perfLongTasks = [];
    try { new PerformanceObserver((list) => window.__perfLongTasks.push(...list.getEntries().map(({ duration, startTime }) => ({ duration, startTime })))).observe({ type: 'longtask', buffered: true }); } catch {}
  });
  await page.goto(new URL(scenario.query, baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  await page.waitForFunction(() => !document.documentElement.classList.contains('is-loading'), null, { timeout: 9000 });
  const initial = await cdp.send('Performance.getMetrics');
  const initialMetrics = Object.fromEntries(initial.metrics.map(({ name, value }) => [name, value]));
  await page.evaluate(() => { window.__perfFrames.length = 0; window.__perfLongTasks.length = 0; window.__perfCallbackCounts.clear(); window.__perfCallbackWork.clear(); });
  for (let loop = 0; loop < 5; loop++) {
    const maxY = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight), steps = 22;
    for (let step = 0; step <= steps; step++) { await page.mouse.wheel(0, Math.ceil(maxY / steps)); await page.waitForTimeout(65); }
    for (let step = 0; step <= steps; step++) { await page.mouse.wheel(0, -Math.ceil(maxY / steps)); await page.waitForTimeout(65); }
  }
  await page.waitForTimeout(400);
  const final = await cdp.send('Performance.getMetrics');
  const finalMetrics = Object.fromEntries(final.metrics.map(({ name, value }) => [name, value]));
  const sample = await page.evaluate(() => {
    const frames = window.__perfFrames, engine = frames.map((x) => x.engine).filter(Boolean);
    const updateAndSubmit = engine.map((x) => (x.updateMs ?? 0) + (x.renderMs ?? 0)).filter(Number.isFinite).sort((a, b) => a - b);
    const allJs = [...window.__perfCallbackWork.values()].sort((a, b) => a - b);
    const times = [...new Set(frames.map((x) => x.time))], intervals = times.slice(1).map((time, i) => time - times[i]).filter((x) => x > 0 && x < 1000).sort((a, b) => a - b);
    const pct = (values, fraction) => values.length ? values[Math.min(values.length - 1, Math.floor(values.length * fraction))] : 0;
    const counts = [...window.__perfCallbackCounts.values()], current = engine.at(-1) ?? {};
    return {
      jsMean: allJs.reduce((a, b) => a + b, 0) / Math.max(1, allJs.length), jsP95: pct(allJs, .95),
      engineMean: updateAndSubmit.reduce((a, b) => a + b, 0) / Math.max(1, updateAndSubmit.length), engineP95: pct(updateAndSubmit, .95),
      fps: 1000 * intervals.length / Math.max(1, intervals.reduce((a, b) => a + b, 0)), frameP95: pct(intervals, .95),
      raf: counts.reduce((a, b) => a + b, 0) / Math.max(1, counts.length),
      renderer: current.rendererInfo ?? {}, particleCount: current.particleCount ?? 0, tier: current.chosenTier ?? current.quality ?? 'unknown',
      longTaskCount: window.__perfLongTasks.length, longestTask: Math.max(0, ...window.__perfLongTasks.map((x) => x.duration)),
    };
  });
  const metric = (name) => finalMetrics[name];
  after.push({ path: scenario.name, jsFrameMeanP95Ms: `${sample.jsMean.toFixed(2)} / ${sample.jsP95.toFixed(2)}`, engineUpdateSubmitMeanP95Ms: `${sample.engineMean.toFixed(2)} / ${sample.engineP95.toFixed(2)}`, scrollFPS: sample.fps.toFixed(1), longTasks: `${sample.longTaskCount} / ${sample.longestTask.toFixed(0)} ms`, drawCalls: sample.renderer.calls ?? 'n/a', points: sample.renderer.points ?? sample.particleCount, geometries: sample.renderer.geometries ?? 'n/a', textures: sample.renderer.textures ?? 'n/a', heapGrowthPct: (((metric('JSHeapUsedSize') - initialMetrics.JSHeapUsedSize) / Math.max(1, initialMetrics.JSHeapUsedSize)) * 100).toFixed(2), nodes: `${initialMetrics.Nodes} → ${metric('Nodes')}`, listeners: `${initialMetrics.JSEventListeners} → ${metric('JSEventListeners')}`, rafCallbacksPerFrame: sample.raf.toFixed(2), tier: sample.tier });
  await context.close();
}
await browser.close();
await mkdir('debug', { recursive: true });
await writeFile('debug/perf-after.json', JSON.stringify(after, null, 2));
let before = [];
try { before = JSON.parse((await readFile(new URL('./perf-baseline.json', import.meta.url), 'utf8')).replace(/^\uFEFF/, '')); } catch {}
const report = after.map((row) => ({
  path: row.path,
  beforeJSFrame: before.find((x) => x.path === row.path)?.jsFrameMeanP95Ms ?? 'see baseline notes', afterJSFrame: row.jsFrameMeanP95Ms,
  beforeEngine: before.find((x) => x.path === row.path)?.engineUpdateSubmitMeanP95Ms ?? 'n/a', afterEngine: row.engineUpdateSubmitMeanP95Ms,
  beforeFPS: before.find((x) => x.path === row.path)?.scrollFPS ?? 'n/a', afterFPS: row.scrollFPS,
  beforeTasks: before.find((x) => x.path === row.path)?.longTasks ?? 'n/a', afterTasks: row.longTasks,
  beforeCalls: before.find((x) => x.path === row.path)?.drawCalls ?? 'n/a', afterCalls: row.drawCalls,
  beforePoints: before.find((x) => x.path === row.path)?.points ?? 'n/a', afterPoints: row.points,
  beforeMemory: before.find((x) => x.path === row.path)?.heapGrowthPct ?? 'n/a', afterMemory: row.heapGrowthPct,
  beforeListeners: before.find((x) => x.path === row.path)?.listeners ?? 'n/a', afterListeners: row.listeners,
  beforeRaf: before.find((x) => x.path === row.path)?.rafCallbacksPerFrame ?? 'n/a', afterRaf: row.rafCallbacksPerFrame,
  chosenTier: row.tier,
}));
console.log('Before / after (4× CPU throttle, production preview, five full down/up scroll loops)');
console.table(report);
console.log(JSON.stringify({ before, after }, null, 2));
