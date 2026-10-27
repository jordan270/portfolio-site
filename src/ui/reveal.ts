import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export interface RevealController {
  destroy: () => void;
}

/** Reveal each text block as a whole so the browser can wrap its text naturally. */
export function initReveal(): RevealController {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const blocks = Array.from(document.querySelectorAll<HTMLElement>('.content-block'));
  const triggers: ScrollTrigger[] = [];

  blocks.forEach((block) => {
    if (block.closest('#hero')) return;
    const textEls = Array.from(block.querySelectorAll<HTMLElement>('.reveal-text'));
    const wholeBlocks = Array.from(block.querySelectorAll<HTMLElement>('.reveal-block'));
    const targets = [...new Set([...textEls, ...wholeBlocks])];
    if (!targets.length) return;
    if (prefersReduced) {
      gsap.set(targets, { opacity: 1, y: 0 });
      return;
    }

    gsap.set(targets, { opacity: 0, y: 18 });
    triggers.push(ScrollTrigger.create({
      trigger: block,
      start: 'top 85%',
      once: true,
      onEnter: () => gsap.to(targets, {
        y: 0,
        opacity: 1,
        duration: 0.8,
        stagger: 0.045,
        ease: 'power2.out',
      }),
    }));
  });

  return { destroy: () => triggers.forEach((trigger) => trigger.kill()) };
}
