import type { FrameRect, ParticleEngine, ShapeName } from '../engine/index.ts';

const sidePadding = 0.04;

function measuredFrame(section: HTMLElement): FrameRect {
  const width = window.innerWidth, height = window.innerHeight;
  if (section.id === 'hero') {
    const columnWidth = width <= 900 ? 0.92 : 0.56;
    return { x: (1 - columnWidth) * width / 2, y: height * (width <= 900 ? 0.18 : 0.1), w: width * columnWidth, h: height * 1.15 };
  }
  if (section.id === 'contact') return { x: width * sidePadding, y: height * 0.02, w: width * (1 - sidePadding * 2), h: height * 0.55 };
  if (width <= 900) return { x: width * sidePadding, y: height * 0.08, w: width * (1 - sidePadding * 2), h: height * 0.36 };

  const gap = width * 0.03, padding = width * sidePadding;
  const content = section.querySelector<HTMLElement>('.content-block');
  const card = section.querySelector<HTMLElement>('.project-card');
  const rect = (card ?? content)?.getBoundingClientRect();
  let left = padding, right = width - padding;
  if (rect && section.matches('.section--autopilot, .section--sentiment')) left = rect.right + gap;
  else if (rect && section.matches('.section--lens, .section--analyzer')) right = rect.left - gap;
  else if (rect && section.id === 'location') left = padding, right = rect.left - gap;
  left = Math.max(padding, Math.min(width - padding - 1, left));
  right = Math.max(left + 1, Math.min(width - padding, right));
  return { x: left, y: height * 0.08, w: right - left, h: height * 0.84 };
}

export function initParticleFrames(engine: Pick<ParticleEngine, 'setFrame'>): () => void {
  const sections = Array.from(document.querySelectorAll<HTMLElement>('section[data-shape]'));
  const lastFrames = new Map<ShapeName, FrameRect>();
  const observers: ResizeObserver[] = [];
  let disposed = false;

  const refresh = () => {
    if (disposed) return;
    for (const section of sections) {
      const shape = section.dataset.shape as ShapeName;
      if (!shape) continue;
      const frame = measuredFrame(section), previous = lastFrames.get(shape);
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
