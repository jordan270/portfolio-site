import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export interface RevealController {
  destroy: () => void;
}

/**
 * Splits the text content of an element into visual lines based on word offsetTop.
 * No paid plugins required.
 */
function splitElementIntoLines(element: HTMLElement): HTMLElement[] {
  const originalText = element.textContent?.trim() || '';
  if (!originalText) return [];

  const words = originalText.split(/\s+/);
  element.innerHTML = '';

  // Wrap each word in a temporary inline-block span to measure line breaks
  const wordSpans: HTMLSpanElement[] = words.map((word, idx) => {
    const span = document.createElement('span');
    span.textContent = idx < words.length - 1 ? word + ' ' : word;
    span.style.display = 'inline-block';
    element.appendChild(span);
    return span;
  });

  // Group words into lines by comparing offsetTop
  const linesMap: HTMLSpanElement[][] = [];
  let currentLine: HTMLSpanElement[] = [];
  let lastTop: number | null = null;

  wordSpans.forEach((span) => {
    const top = span.offsetTop;
    if (lastTop === null || Math.abs(top - lastTop) > 4) {
      if (currentLine.length > 0) {
        linesMap.push(currentLine);
      }
      currentLine = [span];
      lastTop = top;
    } else {
      currentLine.push(span);
    }
  });

  if (currentLine.length > 0) {
    linesMap.push(currentLine);
  }

  // Rebuild the element DOM with line wrappers
  element.innerHTML = '';
  const lineInnerElements: HTMLElement[] = [];

  linesMap.forEach((lineWords) => {
    const lineWrap = document.createElement('span');
    lineWrap.className = 'reveal-line-wrap';
    lineWrap.style.display = 'block';
    lineWrap.style.overflow = 'hidden';

    const lineInner = document.createElement('span');
    lineInner.className = 'reveal-line';
    lineInner.style.display = 'inline-block';
    lineInner.style.willChange = 'transform, opacity';
    lineInner.textContent = lineWords.map((w) => w.textContent).join('');

    lineWrap.appendChild(lineInner);
    element.appendChild(lineWrap);
    lineInnerElements.push(lineInner);
  });

  return lineInnerElements;
}

export function initReveal(): RevealController {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const blocks = Array.from(document.querySelectorAll<HTMLElement>('.content-block'));
  const triggers: ScrollTrigger[] = [];

  blocks.forEach((block) => {
    const textEls = Array.from(block.querySelectorAll<HTMLElement>('.reveal-text'));
    const allLines: HTMLElement[] = [];

    textEls.forEach((el) => {
      const lines = splitElementIntoLines(el);
      allLines.push(...lines);
    });

    if (allLines.length === 0) return;

    if (prefersReduced) {
      gsap.set(allLines, { opacity: 1, y: 0 });
      return;
    }

    // Set initial hidden state (faded and slightly lowered)
    gsap.set(allLines, {
      opacity: 0,
      y: 22,
    });

    const trigger = ScrollTrigger.create({
      trigger: block,
      start: 'top 85%',
      once: true,
      onEnter: () => {
        gsap.to(allLines, {
          y: 0,
          opacity: 1,
          duration: 0.85,
          stagger: 0.08,
          ease: 'power2.out',
        });
      },
    });

    triggers.push(trigger);
  });

  return {
    destroy() {
      triggers.forEach((st) => st.kill());
    },
  };
}
