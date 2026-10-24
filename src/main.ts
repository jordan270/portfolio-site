import './style.css';

// Switch between the stub and the real engine using one constant, USE_STUB, at the top of main.ts
export const USE_STUB = true;

import { createEngine } from './engine/index.ts';
import { createEngineStub } from './ui/engineStub';
import { initScroll } from './ui/scroll';
import { initComet } from './ui/comet';
import { initReveal } from './ui/reveal';

function initApp(): void {
  const stage = document.getElementById('stage');
  if (!stage) {
    console.error('[App] Stage element #stage not found');
    return;
  }

  // 1. Initialize Engine (stub or real)
  const factory = USE_STUB ? createEngineStub : createEngine;
  const engine = factory();
  engine.mount(stage);

  // 2. Handle window resize
  window.addEventListener('resize', () => {
    engine.resize();
  });

  // 3. Tab visibility handling (pause/resume energy per SPEC.md)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      engine.setEnergy(0);
    } else {
      engine.setEnergy(1);
    }
  });

  // 4. Initialize Comet 2D canvas overlay
  initComet('#comet-canvas');

  // 5. Initialize per-line text reveals
  initReveal();

  // 6. Initialize Lenis + GSAP ScrollTrigger morph syncing
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    engine.setEnergy(0);
  }

  initScroll((from, to, t) => {
    if (prefersReduced) {
      // Static shape per SPEC in reduced motion
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
