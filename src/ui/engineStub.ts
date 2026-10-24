export type ShapeName = 'sphere' | 'map' | 'helix' | 'galaxy';

export interface ParticleEngine {
  /** Create canvas inside container, start render loop */
  mount(container: HTMLElement): void;
  /** Morph between two shapes. t is 0..1. Called every frame by scroll. */
  setMorph(from: ShapeName, to: ShapeName, t: number): void;
  /** Slow idle rotation/drift multiplier, default 1 */
  setEnergy(value: number): void;
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

export function createEngineStub(opts?: { count?: number }): ParticleEngine {
  const dotCount = Math.min(opts?.count ?? 250, 400);
  console.log(`[engineStub] Initialized with count: ${dotCount}`);

  let containerEl: HTMLElement | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let rafId: number | null = null;

  let currentFrom: ShapeName = 'sphere';
  let currentTo: ShapeName = 'sphere';
  let morphT = 0;
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

      if (shape === 'sphere') {
        // Fibonacci sphere
        const phi = Math.acos(1 - 2 * (i + 0.5) / count);
        const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
        x = Math.sin(phi) * Math.cos(theta);
        y = Math.cos(phi);
        z = Math.sin(phi) * Math.sin(theta);
      } else if (shape === 'map') {
        // Planar grid with slight topographical waves
        const cols = Math.floor(Math.sqrt(count));
        const row = Math.floor(i / cols);
        const col = i % cols;
        x = (col / (cols - 1) - 0.5) * 1.8;
        y = (row / (cols - 1) - 0.5) * 1.2;
        z = Math.sin(x * 4) * Math.cos(y * 4) * 0.2;
      } else if (shape === 'helix') {
        // Double helix
        const strand = i % 2 === 0 ? 1 : -1;
        const angle = u * Math.PI * 8;
        x = Math.cos(angle) * 0.6 * strand;
        y = (u - 0.5) * 1.8;
        z = Math.sin(angle) * 0.6 * strand;
      } else {
        // Galaxy spiral
        const arms = 3;
        const armIndex = i % arms;
        const r = Math.pow(u, 0.6) * 1.0;
        const theta = (armIndex * 2 * Math.PI / arms) + r * 5;
        x = r * Math.cos(theta);
        y = (Math.random() - 0.5) * 0.15;
        z = r * Math.sin(theta);
      }

      // Varied opacities per SPEC (0.35 to 1.0)
      const alpha = 0.35 + (i * 13 % 65) / 100;
      const size = 1.2 + (i * 7 % 20) / 10;
      points.push({ x, y, z, alpha, size });
    }
    return points;
  };

  const shapes: Record<ShapeName, Point3D[]> = {
    sphere: generateShapePoints('sphere', dotCount),
    map: generateShapePoints('map', dotCount),
    helix: generateShapePoints('helix', dotCount),
    galaxy: generateShapePoints('galaxy', dotCount),
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

      // Interpolate position between from and to shapes
      const px = pA.x + (pB.x - pA.x) * morphT;
      const py = pA.y + (pB.y - pA.y) * morphT;
      const pz = pA.z + (pB.z - pA.z) * morphT;

      // Apply idle rotation around Y axis
      const cosA = Math.cos(idleAngle);
      const sinA = Math.sin(idleAngle);
      const rx = px * cosA - pz * sinA;
      const rz = px * sinA + pz * cosA;

      // Simple perspective projection
      const fov = 2.5;
      const zDist = fov / (fov + rz * 0.6);
      const screenX = cx + rx * scale * zDist;
      const screenY = cy + py * scale * zDist;

      const alpha = (pA.alpha + (pB.alpha - pA.alpha) * morphT) * Math.min(1, Math.max(0.2, zDist));
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

    setMorph(from: ShapeName, to: ShapeName, t: number) {
      currentFrom = from;
      currentTo = to;
      morphT = Math.max(0, Math.min(1, t));
      console.log(`[engineStub] setMorph: ${from} -> ${to} (t: ${morphT.toFixed(3)})`);
    },

    setEnergy(value: number) {
      energy = value;
      console.log(`[engineStub] setEnergy: ${value}`);
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
