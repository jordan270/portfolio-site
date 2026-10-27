import type { ParticleEngine } from './engineStub';

type IntroMilestone = 'hero-data' | 'shader-warmup' | 'calibration';

/** Keep the boot scatter visible until every required first-frame resource is ready. */
export function initIntro(engine: Pick<ParticleEngine, 'setIntro' | 'setIntroReady' | 'prepareIntro' | 'getQualityTier'>, onComplete?: () => void): () => void {
  const params = new URLSearchParams(location.search);
  let seen = false;
  try { seen = sessionStorage.getItem('introSeen') === '1'; } catch { /* Storage can be unavailable in private contexts. */ }
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  const forceFast = params.get('fast') === '1';
  const slow = params.get('slow') === '1' || (!forceFast && (navigator.hardwareConcurrency <= 4 ||
    ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? Infinity) <= 4 ||
    connection?.saveData === true || ['slow-2g', '2g', '3g'].includes(connection?.effectiveType ?? '')));
  const loader = document.getElementById('boot-loader');
  const canvas = document.getElementById('boot-canvas');
  const label = document.getElementById('boot-label');
  const percent = document.getElementById('boot-percent');
  const progressLine = document.getElementById('boot-progress');
  const main = document.getElementById('main');
  const start = performance.now();
  const milestones: Record<string, boolean> = { engine: true, fonts: false, 'hero-data': false, 'shader-warmup': false, calibration: false };
  let stopped = false;
  let raf = 0;
  let progressInterval = 0;
  let progress = 0;
  const weights: Record<string, number> = { engine: 25, fonts: 10, 'hero-data': 25, 'shader-warmup': 15, calibration: 15 };
  const updateProgress = () => {
    const readyWeight = Object.entries(weights).reduce((total, [name, weight]) => total + (milestones[name] ? weight : 0), 0);
    const minRamp = Math.min(10, Math.max(0, (performance.now() - start) / 900 * 10));
    progress = Math.min(100, readyWeight + minRamp);
    if (percent) percent.textContent = `${Math.floor(progress)}%`;
    if (progressLine instanceof HTMLElement) progressLine.style.transform = `scaleX(${progress / 100})`;
    const debug = (window as Window & { __introDebug?: Record<string, unknown> }).__introDebug;
    if (debug) Object.assign(debug, { progress: progress / 100, milestones: { ...milestones }, tier: engine.getQualityTier() });
  };
  engine.setIntro(0);
  engine.setIntroReady(false);
  if (main) main.style.visibility = 'hidden';
  document.documentElement.classList.add('is-loading');
  if (params.get('debug') === '1') (window as Window & { __introDebug?: Record<string, unknown> }).__introDebug = { startedAt: start, slow, seen, milestones: { ...milestones }, tier: engine.getQualityTier() };
  if (loader) loader.hidden = false;

  void document.fonts.ready.then(() => { milestones.fonts = true; updateProgress(); });
  const preparation = engine.prepareIntro((milestone: IntroMilestone) => { milestones[milestone] = true; updateProgress(); });
  const timeout = new Promise<'timeout'>((resolve) => window.setTimeout(() => resolve('timeout'), 8000));
  const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

  const assemble = async () => {
    const outcome = await Promise.race([preparation.then(() => 'ready' as const), timeout]);
    if (stopped) return;
    if (outcome === 'timeout') {
      console.warn(`[intro] 8 second readiness limit reached; continuing at ${engine.getQualityTier()} tier`, Object.keys(milestones).filter((name) => !milestones[name]));
    }
    updateProgress();
    if (outcome === 'timeout') progress = 100;
    if (percent) percent.textContent = '100%';
    if (progressLine instanceof HTMLElement) progressLine.style.transform = 'scaleX(1)';
    const elapsed = performance.now() - start;
    if (elapsed < 900) await wait(900 - elapsed);
    if (stopped) return;
    window.clearInterval(progressInterval);
    label?.classList.add('is-fading');
    canvas?.classList.add('is-fading');
    await wait(500); // 300 ms label fade, then 200 ms before assembly.
    if (stopped) return;
    engine.setIntroReady(true);
    const duration = slow ? 2200 : seen ? 1100 : 1600;
    const assembleAt = performance.now();
    const tick = () => {
      if (stopped) return;
      const t = Math.min(1, (performance.now() - assembleAt) / duration);
      engine.setIntro(t);
      if (t < 1) raf = requestAnimationFrame(tick);
      else {
        try { sessionStorage.setItem('introSeen', '1'); } catch { /* Storage can be unavailable in private contexts. */ }
        main?.style.removeProperty('visibility');
        document.documentElement.classList.remove('is-loading');
        if (loader) loader.hidden = true;
        (window as Window & { __bootStop?: () => void }).__bootStop?.();
        onComplete?.();
      }
    };
    tick();
  };
  updateProgress();
  progressInterval = window.setInterval(updateProgress, 50);
  void assemble();
  return () => { stopped = true; cancelAnimationFrame(raf); window.clearInterval(progressInterval); };
}
