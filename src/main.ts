import './style.css';

// ---------------------------------------------------------------------------
// USE_STUB: true  → use the 2D canvas stub (no real engine on this branch)
//           false → import the real engine from ./engine/index.ts
// ---------------------------------------------------------------------------
export const USE_STUB = false;

import type { ParticleEngine } from './ui/engineStub';
import { initScroll } from './ui/scroll';
import { initComet } from './ui/comet';
import { initReveal } from './ui/reveal';
import { initInfinity } from './ui/infinity';
import { initProjectCards } from './ui/projectCards';
import { initParticleFrames } from './ui/frames';
import { initIntro } from './ui/intro';

async function startApp(): Promise<void> {
  const stage = document.getElementById('stage');
  if (!stage) {
    console.error('[App] Stage element #stage not found');
    return;
  }

  // 1. Initialize Engine (stub or real). Both expose the same UI-facing API.
  const engine: ParticleEngine = USE_STUB
    ? (await import('./ui/engineStub')).createEngineStub()
    : (await import('./engine/index.ts')).createEngine() as unknown as ParticleEngine;

  engine.mount(stage);
  let scroll: ReturnType<typeof initScroll> | null = null;

  // 2. Adaptive quality
  engine.setQuality('auto');

  // 2a. Begin from a viewport-wide WebGL scatter before assembling the hero.
  initIntro(engine, () => {
    scroll?.lenis.start();
    scroll?.update();
  });

  // 3. Handle window resize
  window.addEventListener('resize', () => {
    engine.resize();
  });

  // 4. Tab visibility handling — pause/resume energy
  document.addEventListener('visibilitychange', () => {
    engine.setEnergy(document.hidden ? 0 : 1);
  });

  // 5. Initialize Comet 2D canvas overlay
  initComet('#comet-canvas');

  // 6. Initialize the contact illustration and text reveals
  initInfinity();
  initProjectCards();
  initParticleFrames(engine);
  initReveal();

  // 7. Initialize Lenis + GSAP ScrollTrigger morph syncing
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    engine.setEnergy(0);
  }

  scroll = initScroll((from, to, t) => {
    if (prefersReduced) {
      // Static shape per SPEC under reduced motion — snap, no interpolation
      engine.setMorph(from, to, t < 0.5 ? 0 : 1);
    } else {
      engine.setMorph(from, to, t);
    }
  });
  scroll.lenis.stop();
}

const boot = () => { requestAnimationFrame(() => { void startApp(); }); };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
