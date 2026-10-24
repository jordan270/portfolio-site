import * as THREE from 'three';
import { generate as face, loadFaceData } from './shapes/face.ts';
import { generate as tower } from './shapes/tower.ts';
import { generate as lens } from './shapes/lens.ts';
import { generate as f1, loadSource as loadF1Source } from './shapes/f1.ts';
import { generate as dust } from './shapes/dust.ts';

export type ShapeName = 'face' | 'tower' | 'lens' | 'f1' | 'dust';
type LegacyShapeName = 'sphere' | 'map' | 'helix' | 'galaxy';
export interface ParticleEngine {
  mount(container: HTMLElement): void;
  setMorph(from: ShapeName | LegacyShapeName, to: ShapeName | LegacyShapeName, t: number): void;
  setEnergy(value: number): void;
  setQuality(quality: 'high' | 'medium' | 'low' | 'auto'): void;
  setDebugScales(size: number, alpha: number): void;
  resize(): void;
  dispose(): void;
}

const generators: Record<ShapeName, (count: number, seeds?: Float32Array) => Float32Array> = { face, tower, lens, f1, dust };

function normalizeShape(name: ShapeName | LegacyShapeName): ShapeName {
  if (name === 'sphere') return 'face';
  if (name === 'map') return 'tower';
  if (name === 'helix') return 'lens';
  if (name === 'galaxy') return 'dust';
  return name;
}

const vertexShader = `
attribute vec3 positionA;
attribute vec3 positionB;
attribute float aSeed;
attribute float aSize;
uniform float uMorph;
uniform float uTime;
uniform float uEnergy;
uniform float uBreath;
uniform float uParallax;
uniform float uPixelRatio;
uniform float uSizeScale;
uniform float uFaceFrom;
uniform float uFaceTo;
varying float vSeed;
varying float vEdge;
varying float vFaceWeight;
varying float vWorldY;
void main() {
  float t = clamp((uMorph - aSeed * 0.16) / (1.0 - 0.16), 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  vec3 p = mix(positionA, positionB, t);
  float transition = sin(t * 3.14159265);
  float phase = uTime * 0.55 + aSeed * 31.0;
  p += vec3(sin(p.y * 5.0 + phase), sin(p.z * 4.0 + phase * 1.13), cos(p.x * 4.5 + phase)) * (0.018 * transition);
  p *= uBreath;
  p.x += uParallax * 0.12;
  p.y -= uParallax * 0.08;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float maxPointSize = mix(3.0, 5.0, step(2.5, aSize));
  gl_PointSize = clamp(aSize * uPixelRatio * (4.5 / max(0.1, -mvPosition.z)) * uSizeScale, 1.0, maxPointSize);
  vSeed = aSeed;
  vEdge = 1.0 - smoothstep(0.0, 0.38, abs(length(p) - 0.82));
  vFaceWeight = mix(uFaceFrom, uFaceTo, t);
  vWorldY = p.y;
}`;

const fragmentShader = `
uniform float uOpacity;
uniform float uAlphaScale;
uniform float uTime;
varying float vSeed;
varying float vEdge;
varying float vFaceWeight;
varying float vWorldY;
void main() {
  vec2 q = gl_PointCoord - vec2(0.5);
  float r = length(q);
  if (r > 0.5) discard;
  float falloff = 1.0 - smoothstep(0.12, 0.5, r);
  float variation = mix(0.18, 0.5, fract(vSeed * 43758.5453));
  float opacity = clamp(variation * uOpacity * uAlphaScale, 0.0, 0.5);
  float rim = mix(1.25, 2.0, vEdge);
  float scanlines = 0.975 + 0.025 * sin(vWorldY * 155.0 + uTime * 10.0);
  float flicker = 0.98 + 0.02 * sin(uTime * 17.0 + vSeed * 41.0);
  float scanY = mod(uTime * 0.12, 2.4) - 1.2;
  float scanBand = 1.0 + 0.32 * (1.0 - smoothstep(0.0, 0.026, abs(vWorldY - scanY)));
  float hologramAlpha = scanlines * flicker;
  float faceBrightness = mix(1.0, scanBand, vFaceWeight);
  float faceAlpha = mix(1.0, hologramAlpha, vFaceWeight);
  gl_FragColor = vec4(vec3(rim * faceBrightness), min(1.0, falloff * opacity * faceAlpha));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createEngine(opts: { count?: number } = {}): ParticleEngine {
  const mobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches;
  const deviceMemory = typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory : undefined;
  let preferMedium = mobile || (typeof navigator !== 'undefined' && (navigator.hardwareConcurrency <= 4 || (deviceMemory !== undefined && deviceMemory <= 4)));
  const qualityCounts = { high: 60_000, medium: 30_000, low: 12_000 } as const;
  let quality: 'high' | 'medium' | 'low' | 'auto' = 'auto';
  let count = Math.max(1000, Math.floor(opts.count ?? (preferMedium ? qualityCounts.medium : qualityCounts.high)));
  const customCount = opts.count !== undefined;
  let frameAverage = 16.7;
  let slowFrames = 0, fastFrames = 0;
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let container: HTMLElement | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let points: THREE.Points | null = null;
  let material: THREE.ShaderMaterial | null = null;
  let geometry: THREE.BufferGeometry | null = null;
  let observer: ResizeObserver | null = null;
  let raf = 0;
  let disposed = false;
  let energy = 1;
  let targetMorph = 0;
  let fromName: ShapeName = 'face';
  let toName: ShapeName = 'face';
  let pointerX = 0, pointerY = 0, smoothX = 0, smoothY = 0;
  let seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) seeds[i] = Math.random();
  const clock = new THREE.Clock();
  const shapeCache = new Map<ShapeName, Float32Array>();
  const getShape = (name: ShapeName) => {
    let value = shapeCache.get(name);
    if (!value) { value = generators[name](count, seeds); shapeCache.set(name, value); }
    return value;
  };
  const onPointer = (event: PointerEvent) => {
    pointerX = event.clientX / Math.max(1, window.innerWidth) * 2 - 1;
    pointerY = event.clientY / Math.max(1, window.innerHeight) * 2 - 1;
  };
  const onVisibility = () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else if (!disposed && renderer) { clock.getDelta(); raf = requestAnimationFrame(render); }
  };
  const setCount = (nextCount: number) => {
    if (count === nextCount) return;
    count = nextCount;
    shapeCache.clear();
    seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) seeds[i] = Math.random();
    if (!geometry) return;
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      sizes[i] = Math.random() < 0.03 ? 3.0 + Math.random() * 0.6 : 1.2 + Math.random() * 1.25;
    }
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    installShapes(fromName, toName);
  };
  const render = () => {
    if (!renderer || !scene || !camera || !material || disposed || document.hidden) return;
    raf = requestAnimationFrame(render);
    const dt = Math.min(clock.getDelta(), 0.05);
    frameAverage += (dt * 1000 - frameAverage) * 0.08;
    if (quality === 'auto' && !customCount) {
      slowFrames = frameAverage > 24 ? slowFrames + 1 : 0;
      fastFrames = frameAverage < 17 ? fastFrames + 1 : 0;
      if (slowFrames >= 30) {
        const currentTier = count >= qualityCounts.high ? 'high' : count >= qualityCounts.medium ? 'medium' : 'low';
        setCount(qualityCounts[currentTier === 'high' ? 'medium' : 'low']);
        slowFrames = 0; fastFrames = 0;
      } else if (fastFrames >= 600 && count < (preferMedium ? qualityCounts.medium : qualityCounts.high)) {
        setCount(Math.min(preferMedium ? qualityCounts.medium : qualityCounts.high, count === qualityCounts.low ? qualityCounts.medium : qualityCounts.high));
        slowFrames = 0; fastFrames = 0;
      }
    }
    const current = material.uniforms.uMorph.value as number;
    material.uniforms.uMorph.value = reducedMotion ? 0 : THREE.MathUtils.damp(current, targetMorph, 5, dt);
    const elapsed = clock.elapsedTime;
    material.uniforms.uTime.value = reducedMotion ? 0 : elapsed * Math.max(0, energy);
    material.uniforms.uEnergy.value = energy;
    material.uniforms.uBreath.value = reducedMotion ? 1 : 1 + Math.sin(elapsed * 0.65) * 0.012 * Math.max(0, energy);
    smoothX += (pointerX - smoothX) * 0.035;
    smoothY += (pointerY - smoothY) * 0.035;
    material.uniforms.uParallax.value = smoothX;
    if (points && !reducedMotion) {
      points.rotation.y += dt * 0.055 * energy;
      points.rotation.x += (smoothY * 0.035 - points.rotation.x) * 0.025;
    }
    renderer.render(scene, camera);
  };
  const installShapes = (from: ShapeName, to: ShapeName) => {
    if (!geometry) return;
    geometry.setAttribute('positionA', new THREE.BufferAttribute(getShape(from), 3));
    geometry.setAttribute('positionB', new THREE.BufferAttribute(getShape(to), 3));
    geometry.attributes.positionA.needsUpdate = true;
    geometry.attributes.positionB.needsUpdate = true;
  };

  return {
    mount(target) {
      if (disposed) throw new Error('Cannot mount a disposed ParticleEngine');
      if (renderer) return;
      container = target;
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      camera.position.z = 4.2;
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      const sizes = new Float32Array(count);
      for (let i = 0; i < count; i++) sizes[i] = Math.random() < 0.03 ? 3.0 + Math.random() * 0.6 : 1.2 + Math.random() * 1.25;
      geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
      geometry.setAttribute('positionA', new THREE.BufferAttribute(getShape('face'), 3));
      geometry.setAttribute('positionB', new THREE.BufferAttribute(getShape('face'), 3));
      geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
      material = new THREE.ShaderMaterial({
        vertexShader, fragmentShader, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uMorph: { value: 0 }, uTime: { value: 0 }, uEnergy: { value: 1 }, uBreath: { value: 1 }, uParallax: { value: 0 }, uOpacity: { value: 1 }, uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) }, uSizeScale: { value: 1 }, uAlphaScale: { value: 1 }, uFaceFrom: { value: 1 }, uFaceTo: { value: 1 } },
      });
      points = new THREE.Points(geometry, material);
      scene.add(points);
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
      const gl = renderer.getContext();
      const rendererInfo = gl.getExtension('WEBGL_debug_renderer_info');
      const gpuName = rendererInfo ? String(gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL)) : '';
      if (/intel.*(graphics|uhd|iris)|mali|adreno|apple m\d/i.test(gpuName) && !preferMedium) {
        preferMedium = true;
        if (quality === 'auto' && !customCount) setCount(qualityCounts.medium);
      }
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(pixelRatio);
      renderer.setClearColor(0x26262b, 1);
      renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;';
      target.appendChild(renderer.domElement);
      this.resize();
      observer = new ResizeObserver(() => this.resize());
      observer.observe(target);
      window.addEventListener('pointermove', onPointer, { passive: true });
      document.addEventListener('visibilitychange', onVisibility);
      void Promise.all([loadFaceData(), loadF1Source()]).then(() => {
        if (disposed || !geometry) return;
        shapeCache.delete('face'); shapeCache.delete('f1');
        if (fromName === 'face' || toName === 'face' || fromName === 'f1' || toName === 'f1') installShapes(fromName, toName);
      });
      raf = requestAnimationFrame(render);
    },
    setMorph(from, to, t) {
      from = normalizeShape(from); to = normalizeShape(to);
      if (from !== fromName || to !== toName) {
        fromName = from; toName = to; installShapes(from, to);
        if (material) {
          material.uniforms.uFaceFrom.value = from === 'face' ? 1 : 0;
          material.uniforms.uFaceTo.value = to === 'face' ? 1 : 0;
        }
      }
      targetMorph = reducedMotion ? 0 : THREE.MathUtils.clamp(t, 0, 1);
    },
    setEnergy(value) { energy = Number.isFinite(value) ? Math.max(0, value) : 1; },
    setDebugScales(size, alpha) {
      if (!material) return;
      material.uniforms.uSizeScale.value = THREE.MathUtils.clamp(size, 0.25, 2.5);
      material.uniforms.uAlphaScale.value = THREE.MathUtils.clamp(alpha, 0, 2);
    },
    setQuality(value) {
      quality = value;
      if (value === 'auto') {
        if (!customCount) setCount(preferMedium ? qualityCounts.medium : qualityCounts.high);
      } else setCount(qualityCounts[value]);
      slowFrames = 0; fastFrames = 0;
    },
    resize() {
      if (!container || !renderer || !camera) return;
      const width = Math.max(1, container.clientWidth), height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      observer?.disconnect();
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVisibility);
      geometry?.dispose(); material?.dispose(); renderer?.dispose();
      if (container && renderer?.domElement.parentElement === container) container.removeChild(renderer.domElement);
      renderer = null; points = null; material = null; geometry = null; camera = null; scene = null; container = null;
      shapeCache.clear();
    },
  };
}
