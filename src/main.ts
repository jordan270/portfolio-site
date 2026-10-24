import './style.css';

// ---------------------------------------------------------------------------
// USE_STUB: true  → use the 2D canvas stub (no real engine on this branch)
//           false → import the real engine from ./engine/index.ts
// ---------------------------------------------------------------------------
export const USE_STUB = true;

import { createEngine as createRealEngine } from './engine/index.ts';
import { createEngineStub, type ParticleEngine } from './ui/engineStub';
import { initScroll } from './ui/scroll';
import { initComet } from './ui/comet';
import { initReveal } from './ui/reveal';

function initApp(): void {
  const stage = document.getElementById('stage');
  if (!stage) {
    console.error('[App] Stage element #stage not found');
    return;
  }

  // 1. Initialize Engine (stub or real).
  //    The real engine still uses 'tower' until its branch is updated to 'india'.
  //    Both implement the same runtime interface; we cast to ParticleEngine for
  //    type-checking against our stub's updated ShapeName.
  const engine: ParticleEngine = USE_STUB
    ? createEngineStub()
    : (createRealEngine() as unknown as ParticleEngine);

  engine.mount(stage);

  // 2. Adaptive quality
  engine.setQuality('auto');

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

  // 6. Initialize per-line text reveals
  initReveal();

  // 7. Initialize Lenis + GSAP ScrollTrigger morph syncing
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    engine.setEnergy(0);
  }

  initScroll((from, to, t) => {
    if (prefersReduced) {
      // Static shape per SPEC under reduced motion — snap, no interpolation
      engine.setMorph(from, to, t < 0.5 ? 0 : 1);
    } else {
      engine.setMorph(from, to, t);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
