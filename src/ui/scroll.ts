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

  let triggers: ScrollTrigger[] = [];
  let midpoints: number[] = [];
  let refreshQueued = false;

  const measureMidpoints = () => {
    midpoints = sectionElements.map((element) => element.offsetTop + element.offsetHeight / 2);
  };

  const updateMidpointProgress = () => {
    if (sectionElements.length < 2) return;

    const scrollY = window.scrollY;
    const viewportCenter = scrollY + window.innerHeight / 2;

    // Calculate midpoints of all sections in page coordinates
    // Check where viewportCenter falls relative to adjacent midpoints
    if (viewportCenter <= midpoints[0]) {
      const from = (sectionElements[0].dataset.shape || 'face') as ShapeName;
      const to = (sectionElements[1].dataset.shape || 'india') as ShapeName;
      onProgress(from, to, 0);
      return;
    }

    const lastIdx = midpoints.length - 1;
    if (viewportCenter >= midpoints[lastIdx]) {
      const from = (sectionElements[lastIdx - 1].dataset.shape || 'f1') as ShapeName;
      const to = (sectionElements[lastIdx].dataset.shape || 'dust') as ShapeName;
      onProgress(from, to, 1);
      return;
    }

    for (let i = 0; i < lastIdx; i++) {
      const midA = midpoints[i];
      const midB = midpoints[i + 1];

      if (viewportCenter >= midA && viewportCenter <= midB) {
        const from = (sectionElements[i].dataset.shape || 'face') as ShapeName;
        const to = (sectionElements[i + 1].dataset.shape || 'india') as ShapeName;
        const t = (viewportCenter - midA) / (midB - midA);
        onProgress(from, to, Math.max(0, Math.min(1, t)));
        return;
      }
    }
  };

  const rebuildTriggers = () => {
    triggers.forEach((trigger) => trigger.kill());
    triggers = [];
    for (let i = 0; i < sectionElements.length - 1; i++) {
      const current = sectionElements[i], next = sectionElements[i + 1];
      const fromShape = (current.dataset.shape || 'face') as ShapeName;
      const toShape = (next.dataset.shape || 'india') as ShapeName;
      triggers.push(ScrollTrigger.create({
        trigger: current, start: 'center center', endTrigger: next, end: 'center center', scrub: true,
        onUpdate: (self) => { if (self.isActive) onProgress(fromShape, toShape, self.progress); },
      }));
    }
  };
  measureMidpoints();
  rebuildTriggers();

  // Update on Lenis scroll and refresh
  lenis.on('scroll', updateMidpointProgress);

  const refreshLayout = () => {
    refreshQueued = false;
    measureMidpoints();
    rebuildTriggers();
    ScrollTrigger.refresh();
    updateMidpointProgress();
  };
  const scheduleRefresh = () => {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(refreshLayout);
  };
  const resizeObserver = new ResizeObserver(scheduleRefresh);
  sectionElements.forEach((section) => resizeObserver.observe(section));
  const handleResize = () => scheduleRefresh();
  window.addEventListener('resize', handleResize);
  void document.fonts?.ready.then(scheduleRefresh);

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
      resizeObserver.disconnect();
      lenis.destroy();
      gsap.ticker.remove(tickerCallback);
      triggers.forEach((st) => st.kill());
    },
  };
}
