const sampleCount = 400;
const samples: string[] = [];
for (let i = 0; i < sampleCount; i++) {
  const t = (i / sampleCount) * Math.PI * 2;
  const x = 300 + 280 * Math.sin(t);
  const y = 150 + 140 * Math.sin(2 * t);
  samples.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`);
}
const pathData = `${samples.join(' ')} Z`;

export function initInfinity(): void {
  const section = document.querySelector<HTMLElement>('#contact');
  const content = section?.querySelector<HTMLElement>('.content-block');
  if (!section || !content || content.querySelector('.contact-infinity')) return;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('contact-infinity');
  svg.setAttribute('viewBox', '0 0 600 300');
  svg.setAttribute('role', 'presentation');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <path class="infinity-static-glow" d="${pathData}" />
    <path class="infinity-track" pathLength="1000" d="${pathData}" />
    <path class="infinity-trail" pathLength="1000" d="${pathData}" />
    <path class="infinity-runner" pathLength="1000" d="${pathData}" />`;
  content.prepend(svg);

  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
  svg.classList.add('is-visible');
      observer.disconnect();
    }
  }, { threshold: 0.3 });
  observer.observe(section);
}
