import gsap from 'gsap';
import type { ParticleEngine } from './engineStub';

type IntroMilestone = 'hero-data' | 'shader-warmup' | 'calibration';
type LoaderPhase = 'spinner' | 'contract' | 'burst' | 'gather' | 'face' | 'crossfade';

/** Drive the WebGL particle loader, then reveal the hero and unlock scrolling. */
export function initIntro(
  engine: Pick<ParticleEngine, 'setIntro' | 'setIntroReady' | 'setLoaderPhase' | 'setMorphStyle' | 'prepareIntro' | 'getQualityTier'>,
  onComplete?: () => void,
): () => void {
  const params = new URLSearchParams(location.search);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const main = document.getElementById('main');
  const heroName = document.querySelector<HTMLElement>('#hero .hero-name-group');
  const heroRole = document.querySelector<HTMLElement>('#hero .hero-role-group');
  const start = performance.now();
  const milestones: Record<string, boolean> = { engine: true, fonts: false, 'hero-data': false, 'shader-warmup': false, calibration: false };
  let stopped = false;
  let clockRaf = 0;
  let phaseRaf = 0;
  let phase: LoaderPhase = 'spinner';
  let progress = 0;
  const debug = params.get('debug') === '1'
    ? ((window as Window & { __introDebug?: Record<string, unknown> }).__introDebug = { startedAt: start, reducedMotion, milestones, setIntroStarted: true, phase, progress, completed: false })
    : undefined;
  const updateDebug = () => {
    if (debug) Object.assign(debug, { milestones: { ...milestones }, phase, progress, tier: engine.getQualityTier() });
  };
  const mainReady = () => {
    if (stopped) return;
    if (phase === 'spinner') progress = Math.min(1, (performance.now() - start) / 2200);
    engine.setLoaderPhase(phase, progress, reducedMotion ? 0 : (performance.now() - start) / 1000);
    updateDebug();
    clockRaf = requestAnimationFrame(mainReady);
  };
  const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
  const runPhase = (next: LoaderPhase, duration: number) => new Promise<void>((resolve) => {
    phase = next;
    progress = 0;
    const phaseStart = performance.now();
    const tick = (now: number) => {
      if (stopped) { resolve(); return; }
      progress = Math.min(1, (now - phaseStart) / duration);
      updateDebug();
      if (progress < 1) phaseRaf = requestAnimationFrame(tick);
      else resolve();
    };
    phaseRaf = requestAnimationFrame(tick);
  });

  main?.style.setProperty('visibility', 'hidden');
  document.documentElement.classList.add('is-loading', 'intro-pending');
  gsap.set([heroName, heroRole].filter(Boolean), { autoAlpha: 0, y: 18 });
  engine.setMorphStyle('hologram');
  engine.setIntro(0);
  engine.setIntroReady(false);
  engine.setLoaderPhase('spinner', 0, 0);
  clockRaf = requestAnimationFrame(mainReady);

  const preparation = engine.prepareIntro((milestone: IntroMilestone) => {
    milestones[milestone] = true;
    updateDebug();
  }).then(() => 'ready' as const).catch((error: unknown) => {
    console.error('[intro] preparation failed; continuing with the face fallback', error);
    return 'failed' as const;
  });
  let timeoutId = 0;
  const timeout = new Promise<'timeout'>((resolve) => { timeoutId = window.setTimeout(() => resolve('timeout'), 8000); });

  const assemble = async () => {
    const outcome = await Promise.race([preparation, timeout]);
    window.clearTimeout(timeoutId);
    if (stopped) return;
    if (outcome === 'timeout') console.warn(`[intro] 8 second readiness limit reached; continuing at ${engine.getQualityTier()} tier`);
    // Let the scattered field settle into the ring before beginning the sequence.
    const elapsed = performance.now() - start;
    if (elapsed < 2200) await wait(2200 - elapsed);
    if (stopped) return;
    engine.setIntroReady(true);

    if (reducedMotion) {
      await runPhase('crossfade', 600);
    } else {
      const lowTier = engine.getQualityTier() === 'low';
      const timings = lowTier ? [200, 330, 330, 340] : [300, 500, 500, 500];
      await runPhase('contract', timings[0]);
      await runPhase('burst', timings[1]);
      await runPhase('gather', timings[2]);
      await runPhase('face', timings[3]);
    }
    if (stopped) return;

    phase = 'face';
    progress = 1;
    engine.setLoaderPhase('face', 1, reducedMotion ? 0 : (performance.now() - start) / 1000);
    engine.setIntro(1);
    engine.setMorphStyle('standard');
    main?.style.removeProperty('visibility');
    document.documentElement.classList.remove('is-loading');

    if (heroName) await new Promise<void>((resolve) => gsap.to(heroName, { autoAlpha: 1, y: 0, duration: reducedMotion ? 0 : 0.42, ease: 'power2.out', onComplete: resolve }));
    await wait(reducedMotion ? 0 : 300);
    if (heroRole) await new Promise<void>((resolve) => gsap.to(heroRole, { autoAlpha: 1, y: 0, duration: reducedMotion ? 0 : 0.42, ease: 'power2.out', onComplete: resolve }));
    if (stopped) return;
    document.documentElement.classList.remove('intro-pending');
    if (debug) Object.assign(debug, { completed: true, completedAt: performance.now() - start, phase: 'face', progress: 1 });
    onComplete?.();
    cancelAnimationFrame(clockRaf);
  };
  void assemble();
  return () => {
    stopped = true;
    cancelAnimationFrame(clockRaf);
    cancelAnimationFrame(phaseRaf);
    window.clearTimeout(timeoutId);
    gsap.killTweensOf([heroName, heroRole].filter(Boolean));
  };
}
