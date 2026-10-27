import type { ParticleEngine } from './engineStub';

/** Start the opening scatter and assemble it into the hero on first paint. */
export function initIntro(engine: Pick<ParticleEngine, 'setIntro'>): () => void {
  const params = new URLSearchParams(location.search);
  let seen = false;
  try { seen = sessionStorage.getItem('introSeen') === '1'; } catch { /* Storage can be unavailable in private contexts. */ }
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  const forceFast = params.get('fast') === '1';
  const slow = params.get('slow') === '1' || (!forceFast && (navigator.hardwareConcurrency <= 4 ||
    ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? Infinity) <= 4 ||
    connection?.saveData === true || ['slow-2g', '2g', '3g'].includes(connection?.effectiveType ?? '')));
  const scatterHold = 900;
  const duration = slow ? 2000 : seen ? 1800 : 2500;
  const main = document.querySelector<HTMLElement>('main');
  const comet = document.querySelector<HTMLCanvasElement>('#comet-canvas');
  const mainVisibility = main?.style.visibility ?? '';
  const cometVisibility = comet?.style.visibility ?? '';
  if (main) main.style.visibility = 'hidden';
  if (comet) comet.style.visibility = 'hidden';
  const reveal = () => {
    if (main) main.style.visibility = mainVisibility;
    if (comet) comet.style.visibility = cometVisibility;
  };

  engine.setIntro(0);
  const startedAt = performance.now();
  const introDebug = params.get('debug') === '1' ? { startedAt, duration, progress: 0, slow, seen } : null;
  if (introDebug) (window as Window & { __introDebug?: typeof introDebug }).__introDebug = introDebug;
  let frame = 0;
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    const progress = Math.max(0, Math.min(1, (performance.now() - startedAt - scatterHold) / (duration - scatterHold)));
    if (introDebug) introDebug.progress = progress;
    engine.setIntro(progress);
    if (progress >= 1) {
      reveal();
      try { sessionStorage.setItem('introSeen', '1'); } catch { /* Storage can be unavailable in private contexts. */ }
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => { stopped = true; cancelAnimationFrame(frame); reveal(); };
}
