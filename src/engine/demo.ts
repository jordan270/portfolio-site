import { createEngine, type ShapeName } from './index.ts';

const names: ShapeName[] = ['sphere', 'map', 'helix', 'galaxy'];
const root = document.querySelector<HTMLElement>('#demo');
const slider = document.querySelector<HTMLInputElement>('#shape-step');
const label = document.querySelector<HTMLElement>('#shape-name');
if (!root || !slider || !label) throw new Error('Particle demo markup is incomplete');

const engine = createEngine();
engine.mount(root);
function update() {
  const step = Number(slider!.value);
  const fromIndex = Math.min(names.length - 1, Math.floor(step));
  const toIndex = Math.min(names.length - 1, fromIndex + 1);
  engine.setMorph(names[fromIndex], names[toIndex], step - fromIndex);
  label!.textContent = fromIndex === toIndex ? names[fromIndex] : `${names[fromIndex]} → ${names[toIndex]}`;
}
slider.addEventListener('input', update);
update();
window.addEventListener('pagehide', () => engine.dispose(), { once: true });
