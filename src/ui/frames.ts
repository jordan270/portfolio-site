import type { FrameRect, ParticleEngine, ShapeName } from '../engine/index.ts';

const cardShapes = new Set<ShapeName>(['python', 'lens', 'flags', 'f1']);

function measuredCardFrame(section: HTMLElement): FrameRect {
  const width = window.innerWidth, height = window.innerHeight;
  if (width <= 900) return { x: width * 0.04, y: height * 0.04, w: width * 0.92, h: height * 0.36 };

  const card = section.querySelector<HTMLElement>('.project-card');
  const bounds = card?.getBoundingClientRect();
  const gap = width * 0.03, padding = width * 0.04;
  let x = padding, w = width - padding * 2;
  if (bounds && section.matches('.section--autopilot, .section--sentiment')) {
    x = bounds.right + gap;
    w = Math.max(1, width - padding - x);
  } else if (bounds) {
    w = Math.max(1, bounds.left - gap - padding);
  }
  return { x, y: height * 0.08, w, h: height * 0.84 };
}

/** Cards alone receive measured particle frames; hero, map, and contact stay full-screen. */
export function initParticleFrames(engine: Pick<ParticleEngine, 'setFrame'>): () => void {
  const sections = Array.from(document.querySelectorAll<HTMLElement>(`section[data-shape]`))
    .filter((section) => cardShapes.has(section.dataset.shape as ShapeName));
  const lastFrames = new Map<ShapeName, FrameRect>();
  const observers: ResizeObserver[] = [];
  let disposed = false;

  const refresh = () => {
    if (disposed) return;
    for (const section of sections) {
      const shape = section.dataset.shape as ShapeName;
      const frame = measuredCardFrame(section), previous = lastFrames.get(shape);
      if (previous && Math.abs(previous.x - frame.x) < 0.25 && Math.abs(previous.y - frame.y) < 0.25 && Math.abs(previous.w - frame.w) < 0.25 && Math.abs(previous.h - frame.h) < 0.25) continue;
      lastFrames.set(shape, frame);
      engine.setFrame(frame, shape);
    }
  };

  refresh();
  for (const section of sections) {
    const observer = new ResizeObserver(refresh);
    observer.observe(section);
    const card = section.querySelector<HTMLElement>('.project-card');
    if (card) observer.observe(card);
    observers.push(observer);
  }
  window.addEventListener('resize', refresh, { passive: true });
  void document.fonts?.ready.then(refresh);

  return () => {
    disposed = true;
    window.removeEventListener('resize', refresh);
    observers.forEach((observer) => observer.disconnect());
  };
}
