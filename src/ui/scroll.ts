import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { ShapeName } from './engineStub';

gsap.registerPlugin(ScrollTrigger);

export type ScrollProgressCallback = (from: ShapeName, to: ShapeName, t: number) => void;

export interface ScrollController {
  lenis: Lenis;
  destroy: () => void;
  update: () => void;
}

export function initScroll(onProgress: ScrollProgressCallback): ScrollController {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Initialize Lenis smooth scroll
  const lenis = new Lenis({
    lerp: prefersReduced ? 1 : 0.1,
    smoothWheel: !prefersReduced,
    syncTouch: false,
  });

  // Synchronize Lenis with GSAP ScrollTrigger
  lenis.on('scroll', ScrollTrigger.update);

  const tickerCallback = (time: number) => {
    lenis.raf(time * 1000);
  };

  gsap.ticker.add(tickerCallback);
  gsap.ticker.lagSmoothing(0);

  // Collect sections with data-shape attributes
  const sectionElements = Array.from(
    document.querySelectorAll<HTMLElement>('section[data-shape]')
  );

  const triggers: ScrollTrigger[] = [];

  const updateMidpointProgress = () => {
    if (sectionElements.length < 2) return;

    const scrollY = window.scrollY;
    const viewportCenter = scrollY + window.innerHeight / 2;

    // Calculate midpoints of all sections in page coordinates
    const midpoints = sectionElements.map((el) => {
      const rect = el.getBoundingClientRect();
      return scrollY + rect.top + rect.height / 2;
    });

    // Check where viewportCenter falls relative to adjacent midpoints
    if (viewportCenter <= midpoints[0]) {
      const from = (sectionElements[0].dataset.shape || 'sphere') as ShapeName;
      const to = (sectionElements[1].dataset.shape || 'map') as ShapeName;
      onProgress(from, to, 0);
      return;
    }

    const lastIdx = midpoints.length - 1;
    if (viewportCenter >= midpoints[lastIdx]) {
      const from = (sectionElements[lastIdx - 1].dataset.shape || 'helix') as ShapeName;
      const to = (sectionElements[lastIdx].dataset.shape || 'galaxy') as ShapeName;
      onProgress(from, to, 1);
      return;
    }

    for (let i = 0; i < lastIdx; i++) {
      const midA = midpoints[i];
      const midB = midpoints[i + 1];

      if (viewportCenter >= midA && viewportCenter <= midB) {
        const from = (sectionElements[i].dataset.shape || 'sphere') as ShapeName;
        const to = (sectionElements[i + 1].dataset.shape || 'map') as ShapeName;
        const t = (viewportCenter - midA) / (midB - midA);
        onProgress(from, to, Math.max(0, Math.min(1, t)));
        return;
      }
    }
  };

  // Create ScrollTrigger instances for each adjacent section pair
  for (let i = 0; i < sectionElements.length - 1; i++) {
    const current = sectionElements[i];
    const next = sectionElements[i + 1];
    const fromShape = (current.dataset.shape || 'sphere') as ShapeName;
    const toShape = (next.dataset.shape || 'map') as ShapeName;

    const st = ScrollTrigger.create({
      trigger: current,
      start: 'center center',
      endTrigger: next,
      end: 'center center',
      scrub: true,
      onUpdate: (self) => {
        if (self.isActive) {
          onProgress(fromShape, toShape, self.progress);
        }
      },
    });

    triggers.push(st);
  }

  // Update on Lenis scroll and refresh
  lenis.on('scroll', updateMidpointProgress);

  const handleResize = () => {
    ScrollTrigger.refresh();
    updateMidpointProgress();
  };
  window.addEventListener('resize', handleResize);

  // Initial calculation
  requestAnimationFrame(() => {
    ScrollTrigger.refresh();
    updateMidpointProgress();
  });

  return {
    lenis,
    update: updateMidpointProgress,
    destroy() {
      window.removeEventListener('resize', handleResize);
      lenis.destroy();
      gsap.ticker.remove(tickerCallback);
      triggers.forEach((st) => st.kill());
    },
  };
}
