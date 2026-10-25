export type ShapeName = 'face' | 'india' | 'python' | 'lens' | 'flags' | 'f1' | 'dust';
export type FrameRect = { x: number; y: number; w: number; h: number };
type LegacyShapeName = 'sphere' | 'map' | 'helix' | 'galaxy';

export interface ParticleEngine {
  /** Create canvas inside container, start render loop */
  mount(container: HTMLElement): void;
  /** Morph between two shapes. t is 0..1. Called every frame by scroll. */
  setMorph(from: ShapeName | LegacyShapeName, to: ShapeName | LegacyShapeName, t: number): void;
  setFrame(rect: FrameRect, shape?: ShapeName): void;
  /** Slow idle rotation/drift multiplier, default 1 */
  setEnergy(value: number): void;
  /** Adaptive particle density quality */
  setQuality(quality: 'high' | 'medium' | 'low' | 'auto'): void;
  setGlow(options: { radius?: number; dim?: number; boost?: number }): void;
  resize(): void;
  dispose(): void;
}

interface Point3D {
  x: number;
  y: number;
  z: number;
  alpha: number;
  size: number;
}

function normalizeShape(name: ShapeName | LegacyShapeName): ShapeName {
  if (name === 'sphere') return 'face';
  if (name === 'map') return 'india';
  if (name === 'helix') return 'lens';
  if (name === 'galaxy') return 'dust';
  return name;
}

export function createEngineStub(opts?: { count?: number }): ParticleEngine {
  const dotCount = Math.min(opts?.count ?? 300, 500);
  console.log(`[engineStub] Initialized with count: ${dotCount}`);

  let containerEl: HTMLElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let rafId: number | null = null;

  let currentFrom: ShapeName = 'face';
  let currentTo: ShapeName = 'face';  let morphT = 0;
  let energy = 1;
  let idleAngle = 0;

  // Generate shape base models normalized to [-1, 1]
  const generateShapePoints = (shape: ShapeName, count: number): Point3D[] => {
    const points: Point3D[] = [];
    for (let i = 0; i < count; i++) {
      const u = i / count;
      let x = 0;
      let y = 0;
      let z = 0;

      if (shape === 'face') {
        // Holographic face profile
        const theta = u * Math.PI * 2;
        const phi = (i % 20) / 20 * Math.PI;
        x = Math.sin(phi) * Math.cos(theta) * 0.75;
        y = (Math.cos(phi) * 1.1) + Math.sin(x * 3) * 0.1;
        z = Math.sin(phi) * Math.sin(theta) * 0.6;
      } else if (shape === 'python') {
        const snake = i % 2 ? -1 : 1;
        const t = (i % Math.ceil(count / 2)) / Math.ceil(count / 2);
        const angle = t * Math.PI * 2;
        const radius = 0.29 + (i % 4 < 2 ? 0.08 : 0);
        x = snake * 0.25 + Math.cos(angle) * radius;
        y = snake * -0.22 + Math.sin(angle) * radius;
        z = (Math.random() - 0.5) * 0.06;
      } else if (shape === 'india') {
        // India representation for stub-only UI previews; production uses the engine mask.
        if (i < count * 0.3) {
          // Base range rings
          const r = 0.5 + (i % 2) * 0.4;
          const a = (i / (count * 0.3)) * Math.PI * 2;
          x = Math.cos(a) * r;
          y = -0.9;
          z = Math.sin(a) * r;
        } else {
          // India shape cylinder
          const tH = (i - count * 0.3) / (count * 0.7);
          const a = tH * Math.PI * 14;
          const r = 0.38;
          x = Math.cos(a) * r;
          y = (tH - 0.5) * 1.6;
          z = Math.sin(a) * r;
        }
      } else if (shape === 'lens') {
        // Magnifying glass: ring + handle at 45 deg
        if (i < count * 0.75) {
          const a = (i / (count * 0.75)) * Math.PI * 2;
          const r = 0.65;
          x = Math.cos(a) * r;
          y = Math.sin(a) * r;
          z = (Math.random() - 0.5) * 0.1;
        } else {
          // Handle at 45 deg
          const hP = (i - count * 0.75) / (count * 0.25);
          x = 0.45 + hP * 0.6;
          y = -0.45 - hP * 0.6;
          z = 0;
        }
      } else if (shape === 'flags') {
        const flag = i % 2 ? -1 : 1;
        const a = u * Math.PI * 8;
        x = flag * 0.36 + Math.cos(a) * 0.38;
        y = 0.22 + Math.sin(a) * 0.27;
        if (u > 0.72) { x = (u - 0.72) * 1.2 * (i % 2 ? -1 : 1); y = -0.2 - (u - 0.72) * 1.8; }
        z = flag * x * 0.05 + (Math.random() - 0.5) * 0.06;
      } else if (shape === 'f1') {
        // Elongated F1 car silhouette
        x = (u - 0.5) * 2.2;
        const bodyY = Math.sin(u * Math.PI) * 0.3;
        y = bodyY - 0.3;
        z = (Math.sin(u * 12) * 0.35) * (1 - Math.abs(u - 0.5));
      } else {
        // Dust: a wide field of sparse particles with no central figure.
        x = (Math.random() * 2 - 1) * 3.2;
        y = (Math.random() * 2 - 1) * 2.05;
        if (Math.random() > 0.27) x += 100;
        z = (Math.random() - 0.5) * 0.12;
      }

      const alpha = 0.35 + (i * 17 % 65) / 100;
      const size = 1.2 + (i * 7 % 18) / 10;
      points.push({ x, y, z, alpha, size });
    }
    return points;
  };

  const shapes: Record<ShapeName, Point3D[]> = {
    face: generateShapePoints('face', dotCount),
    india: generateShapePoints('india', dotCount),
    python: generateShapePoints('python', dotCount),
    lens: generateShapePoints('lens', dotCount),
    flags: generateShapePoints('flags', dotCount),
    f1: generateShapePoints('f1', dotCount),
    dust: generateShapePoints('dust', dotCount),
  };

  const resize = () => {
    if (!containerEl || !canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = containerEl.clientWidth || window.innerWidth;
    const height = containerEl.clientHeight || window.innerHeight;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.resetTransform?.();
    ctx.scale(dpr, dpr);
    console.log(`[engineStub] resize: ${width}x${height} (dpr: ${dpr})`);
  };

  const render = () => {
    if (!ctx || !canvas) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    ctx.clearRect(0, 0, width, height);

    idleAngle += 0.005 * energy;
    const scale = Math.min(width, height) * 0.38;
    const cx = width / 2;
    const cy = height / 2;

    const fromPts = shapes[currentFrom];
    const toPts = shapes[currentTo];

    for (let i = 0; i < dotCount; i++) {
      const pA = fromPts[i];
      const pB = toPts[i];

      const px = pA.x + (pB.x - pA.x) * morphT;
      const py = pA.y + (pB.y - pA.y) * morphT;
      const pz = pA.z + (pB.z - pA.z) * morphT;

      const cosA = Math.cos(idleAngle);
      const sinA = Math.sin(idleAngle);
      const rx = px * cosA - pz * sinA;
      const rz = px * sinA + pz * cosA;

      const fov = 2.5;
      const zDist = fov / (fov + rz * 0.6);
      const screenX = cx + rx * scale * zDist;
      const screenY = cy + py * scale * zDist;

      const dustWeight = (currentFrom === 'dust' ? 1 - morphT : 0) + (currentTo === 'dust' ? morphT : 0);
      const alpha = (pA.alpha + (pB.alpha - pA.alpha) * morphT) * Math.min(1, Math.max(0.2, zDist)) * (1 - 0.4 * dustWeight);
      const size = pA.size * zDist;

      ctx.beginPath();
      ctx.arc(screenX, screenY, Math.max(0.6, size), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
      ctx.fill();
    }

    rafId = requestAnimationFrame(render);
  };

  return {
    mount(container: HTMLElement) {
      containerEl = container;
      canvas = document.createElement('canvas');
      canvas.className = 'engine-stub-canvas';
      canvas.style.display = 'block';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      container.appendChild(canvas);
      ctx = canvas.getContext('2d');

      resize();
      rafId = requestAnimationFrame(render);
      console.log('[engineStub] Mounted in container');
    },

    setMorph(from, to, t) {
      currentFrom = normalizeShape(from);
      currentTo = normalizeShape(to);
      morphT = Math.max(0, Math.min(1, t));
      console.log(`[engineStub] setMorph: ${currentFrom} -> ${currentTo} (t: ${morphT.toFixed(3)})`);
    },
    setFrame(_rect, _shape) {},

    setEnergy(value: number) {
      energy = value;
      console.log(`[engineStub] setEnergy: ${value}`);
    },

    setQuality(quality: 'high' | 'medium' | 'low' | 'auto') {
      console.log(`[engineStub] setQuality: ${quality}`);
    },

    setGlow(options) {
      console.log(`[engineStub] setGlow: ${JSON.stringify(options)}`);
    },

    resize,

    dispose() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (canvas && canvas.parentElement) {
        canvas.parentElement.removeChild(canvas);
      }
      canvas = null;
      ctx = null;
      containerEl = null;
      console.log('[engineStub] Disposed');
    },
  };
}

export const createEngine = createEngineStub;
export default createEngineStub;
