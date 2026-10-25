import * as THREE from 'three';
import { generate as face, loadFaceData } from './shapes/face.ts';
import { generate as india, loadIndiaData } from './shapes/india.ts';
import { generate as lens } from './shapes/lens.ts';
import { generate as f1, loadSource as loadF1Source } from './shapes/f1.ts';
import { generate as tower } from './shapes/tower.ts';
import { generate as flags, loadFlagsData } from './shapes/flags.ts';
import { generate as dust } from './shapes/dust.ts';

export type ShapeName = 'face' | 'india' | 'tower' | 'lens' | 'flags' | 'f1' | 'dust';
type LegacyShapeName = 'sphere' | 'map' | 'helix' | 'galaxy';
export interface ParticleEngine {
  mount(container: HTMLElement): void;
  setMorph(from: ShapeName | LegacyShapeName, to: ShapeName | LegacyShapeName, t: number): void;
  setEnergy(value: number): void;
  setQuality(quality: 'high' | 'medium' | 'low' | 'auto'): void;
  setGlow(options: { radius?: number; dim?: number; boost?: number }): void;
  setDebugScales(size: number, alpha: number): void;
  resize(): void;
  dispose(): void;
}

const generators: Record<ShapeName, (count: number, seeds?: Float32Array) => Float32Array> = { face, india, tower, lens, flags, f1, dust };

function normalizeShape(name: ShapeName | LegacyShapeName): ShapeName {
  if (name === 'sphere') return 'face';
  if (name === 'map') return 'india';
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
uniform float uOffsetFrom;
uniform float uOffsetTo;
uniform float uOffsetYFrom;
uniform float uOffsetYTo;
uniform float uShapeScale;
uniform float uPixelRatio;
uniform float uSizeScale;
uniform float uFaceFrom;
uniform float uFaceTo;
uniform float uIndiaFrom;
uniform float uIndiaTo;
uniform float uDustFrom;
uniform float uDustTo;
uniform float uDustAspect;
uniform vec2 uGlowResolution;
uniform float uGlowRadius;
uniform float uGlowBoost;
uniform float uGlowSizeEnabled;
uniform vec3 uGlowTrail[8];
varying float vSeed;
varying float vFaceWeight;
varying float vIndiaGlow;
varying float vIndiaRing;
varying float vDustWeight;
varying float vGlow;
void main() {
  float t = clamp((uMorph - aSeed * 0.16) / (1.0 - 0.16), 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  vec3 p = mix(positionA, positionB, t);
  float dustWeight = mix(uDustFrom, uDustTo, t);
  p.x *= mix(1.0, uDustAspect, dustWeight);
  p.xy += vec2(sin(uTime * 0.12 + aSeed * 12.0), cos(uTime * 0.09 + aSeed * 17.0)) * (0.012 * dustWeight);
  p *= uShapeScale;
  p.x += mix(uOffsetFrom, uOffsetTo, t);
  p.y += mix(uOffsetYFrom, uOffsetYTo, t);
  float transition = sin(t * 3.14159265);
  float phase = uTime * 0.55 + aSeed * 31.0;
  p += vec3(sin(p.y * 5.0 + phase), sin(p.z * 4.0 + phase * 1.13), cos(p.x * 4.5 + phase)) * (0.018 * transition);
  p *= uBreath;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  vec4 clipPosition = projectionMatrix * mvPosition;
  gl_Position = clipPosition;
  vec2 ndc = clipPosition.xy / max(0.0001, clipPosition.w);
  vec2 screenPixels = vec2((ndc.x * 0.5 + 0.5) * uGlowResolution.x, (0.5 - ndc.y * 0.5) * uGlowResolution.y);
  float glow = 0.0;
  for (int i = 0; i < 8; i++) {
    vec3 trailPoint = uGlowTrail[i];
    float distanceToCursor = distance(screenPixels, trailPoint.xy);
    glow += (1.0 - smoothstep(0.0, uGlowRadius, distanceToCursor)) * trailPoint.z;
  }
  glow = clamp(glow * uGlowBoost, 0.0, 1.0);
  vSeed = aSeed;
  vFaceWeight = mix(uFaceFrom, uFaceTo, t);
  vIndiaGlow = smoothstep(0.035, 0.047, p.z) * mix(uIndiaFrom, uIndiaTo, t);
  vIndiaRing = smoothstep(0.064, 0.07, p.z) * (1.0 - smoothstep(0.075, 0.08, p.z)) * mix(uIndiaFrom, uIndiaTo, t);
  vDustWeight = dustWeight;
  vGlow = glow;
  float faceSizeCap = mix(3.0, mix(1.6, 2.4, glow * uGlowSizeEnabled), vFaceWeight);
  gl_PointSize = clamp(aSize * uPixelRatio * (4.5 / max(0.1, -mvPosition.z)) * uSizeScale * (1.0 + 0.5 * glow * uGlowSizeEnabled), 1.0, faceSizeCap);
}`;

const fragmentShader = `
uniform float uOpacity;
uniform float uAlphaScale;
uniform float uBaseDim;
uniform float uTime;
varying float vSeed;
varying float vFaceWeight;
varying float vIndiaGlow;
varying float vIndiaRing;
varying float vDustWeight;
varying float vGlow;
void main() {
  vec2 q = gl_PointCoord - vec2(0.5);
  float r = length(q);
  if (r > 0.5) discard;
  float falloff = 1.0 - smoothstep(0.12, 0.5, r);
  float variation = mix(0.18, 0.5, fract(vSeed * 43758.5453));
  float baseAlpha = variation * uOpacity * uAlphaScale * mix(1.0, 0.6, vDustWeight) * uBaseDim;
  float glowAlpha = baseAlpha * mix(1.0, 1.0 / max(0.05, uBaseDim), vGlow);
  float indiaPulse = 0.78 + 0.22 * sin(uTime * 1.4);
  float indiaRingAlpha = vIndiaRing * indiaPulse * 0.16;
  gl_FragColor = vec4(vec3(1.0), min(1.0, falloff * (clamp(glowAlpha, 0.0, 1.0) * mix(1.0, 1.2, vIndiaGlow) + indiaRingAlpha)));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createEngine(opts: { count?: number } = {}): ParticleEngine {
  const mobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches;
  const deviceMemory = typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory : undefined;
  let preferMedium = mobile || (typeof navigator !== 'undefined' && (navigator.hardwareConcurrency <= 4 || (deviceMemory !== undefined && deviceMemory <= 4)));
  const qualityCounts = { high: 60_000, medium: 5_000, low: 2_500 } as const;
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
  let pointerX = 0, smoothX = 0;
  let cursorX = 0, cursorY = 0, smoothCursorX = 0, smoothCursorY = 0;
  let pointerActive = false, pointerType = 'mouse', touchFadeRemaining = 0, trailElapsed = 0, trailHead = 0;
  let glowRadius = 140, glowDim = 0.45, glowBoost = 1;
  const debugPerf = new URLSearchParams(location.search).has('debugPerf') ? { renderMs: 0, renderAverageMs: 0, frameMs: 0, frameAverageMs: 0, particleCount: 0, quality: '' } : null;
  if (debugPerf) (window as Window & { __particleEnginePerf?: NonNullable<typeof debugPerf> }).__particleEnginePerf = debugPerf;
  const trailX = new Float32Array(8), trailY = new Float32Array(8), trailAge = new Float32Array(8);
  trailAge.fill(10);
  const glowTrailUniforms: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++) glowTrailUniforms.push(new THREE.Vector3());
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
    pointerX = THREE.MathUtils.clamp((event.clientX / Math.max(1, window.innerWidth) * 2 - 1), -1, 1);
    cursorX = event.clientX; cursorY = event.clientY;
    pointerType = event.pointerType || 'mouse'; pointerActive = true; touchFadeRemaining = 0;
  };
  const onPointerRelease = (event: PointerEvent) => {
    if (event.pointerType === 'touch') { pointerActive = false; touchFadeRemaining = 0.6; }
  };
  const onPointerLeave = () => { if (pointerType !== 'touch') pointerActive = false; };
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
    if (debugPerf) { debugPerf.frameMs = dt * 1000; debugPerf.frameAverageMs = frameAverage; debugPerf.particleCount = count; debugPerf.quality = quality; }
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
    smoothCursorX += (cursorX - smoothCursorX) * 0.22;
    smoothCursorY += (cursorY - smoothCursorY) * 0.22;
    const glowActivity = pointerActive ? 1 : touchFadeRemaining > 0 ? touchFadeRemaining / 0.6 : 0;
    touchFadeRemaining = Math.max(0, touchFadeRemaining - dt);
    const dpr = renderer.getPixelRatio();
    trailElapsed += dt;
    if (!reducedMotion && glowActivity > 0 && trailElapsed >= 0.05) {
      trailHead = (trailHead + 1) % 8;
      trailX[trailHead] = smoothCursorX; trailY[trailHead] = smoothCursorY; trailAge[trailHead] = 0;
      trailElapsed = 0;
    }
    const trailUniforms = material.uniforms.uGlowTrail.value as THREE.Vector3[];
    if (reducedMotion) {
      trailUniforms[0].set(smoothCursorX * dpr, smoothCursorY * dpr, glowActivity);
      for (let i = 1; i < 8; i++) trailUniforms[i].set(0, 0, 0);
    } else {
      for (let i = 0; i < 8; i++) {
        trailAge[i] += dt;
        trailUniforms[i].set(trailX[i] * dpr, trailY[i] * dpr, Math.exp(-trailAge[i] * 3) * glowActivity);
      }
    }
    const activeMorph = material.uniforms.uMorph.value as number;
    material.uniforms.uShapeScale.value = layoutScale(fromName) * (1 - activeMorph) + layoutScale(toName) * activeMorph;
    if (points) {
      const idleYaw = reducedMotion ? 0 : Math.sin(elapsed * 0.24) * THREE.MathUtils.degToRad(4);
      const mouseYaw = reducedMotion ? 0 : smoothX * THREE.MathUtils.degToRad(4);
      points.rotation.x += (0 - points.rotation.x) * 0.025;
      points.rotation.y += (idleYaw + mouseYaw - points.rotation.y) * 0.025;
    }
    const renderStarted = debugPerf ? performance.now() : 0;
    renderer.render(scene, camera);
    if (debugPerf) { debugPerf.renderMs = performance.now() - renderStarted; debugPerf.renderAverageMs += (debugPerf.renderMs - debugPerf.renderAverageMs) * 0.08; }
  };
  const installShapes = (from: ShapeName, to: ShapeName) => {
    if (!geometry) return;
    geometry.setAttribute('positionA', new THREE.BufferAttribute(getShape(from), 3));
    geometry.setAttribute('positionB', new THREE.BufferAttribute(getShape(to), 3));
    geometry.attributes.positionA.needsUpdate = true;
    geometry.attributes.positionB.needsUpdate = true;
  };
  const layoutOffsetX = (shape: ShapeName) => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) return 0;
    if (shape === 'dust') return 0;
    if (typeof window !== 'undefined' && window.innerWidth <= 1100) {
      if (shape === 'face') return 0;
      if (shape === 'india') return -1.5;
      if (shape === 'tower' || shape === 'flags') return 1.5;
      if (shape === 'lens') return -1.65;
      return -1.5;
    }
    if (shape === 'face') return 0;
    if (shape === 'india') return -1.5;
    if (shape === 'tower') return 2.0;
    if (shape === 'flags') return 1.65;
    return shape === 'lens' ? -1.9 : -2.0;
  };
  const layoutOffsetY = (shape: ShapeName) => {
    if (typeof window === 'undefined') return 0;
    const width = window.innerWidth;
    if (width <= 768) return shape === 'face' ? 0 : 1.0;
    return 0;
  };
  const layoutScale = (shape: ShapeName) => {
    if (typeof window === 'undefined' || window.innerWidth > 768) return 1;
    if (shape === 'dust') return 1;
    return shape === 'face' ? 0.88 : 0.25;
  };
  const updateLayoutOffsets = () => {
    if (!material) return;
    material.uniforms.uOffsetFrom.value = layoutOffsetX(fromName);
    material.uniforms.uOffsetTo.value = layoutOffsetX(toName);
    material.uniforms.uOffsetYFrom.value = layoutOffsetY(fromName);
    material.uniforms.uOffsetYTo.value = layoutOffsetY(toName);
    const morph = material.uniforms.uMorph.value as number;
    material.uniforms.uShapeScale.value = layoutScale(fromName) * (1 - morph) + layoutScale(toName) * morph;
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
        uniforms: { uMorph: { value: 0 }, uTime: { value: 0 }, uEnergy: { value: 1 }, uBreath: { value: 1 }, uOffsetFrom: { value: 0 }, uOffsetTo: { value: 0 }, uOffsetYFrom: { value: 0 }, uOffsetYTo: { value: 0 }, uShapeScale: { value: 1 }, uOpacity: { value: 1 }, uBaseDim: { value: glowDim }, uGlowResolution: { value: new THREE.Vector2(1, 1) }, uGlowRadius: { value: glowRadius }, uGlowBoost: { value: glowBoost }, uGlowSizeEnabled: { value: reducedMotion ? 0 : 1 }, uGlowTrail: { value: glowTrailUniforms }, uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) }, uSizeScale: { value: 1 }, uAlphaScale: { value: 1 }, uFaceFrom: { value: 1 }, uFaceTo: { value: 1 }, uIndiaFrom: { value: 0 }, uIndiaTo: { value: 0 }, uDustFrom: { value: 0 }, uDustTo: { value: 0 }, uDustAspect: { value: window.innerWidth / Math.max(1, window.innerHeight) / 1.6 } },
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
      window.addEventListener('pointerdown', onPointer, { passive: true });
      window.addEventListener('pointermove', onPointer, { passive: true });
      window.addEventListener('pointerup', onPointerRelease, { passive: true });
      window.addEventListener('pointercancel', onPointerRelease, { passive: true });
      window.addEventListener('pointerleave', onPointerLeave, { passive: true });
      document.addEventListener('visibilitychange', onVisibility);
      void Promise.all([loadFaceData(), loadIndiaData(), loadF1Source(), loadFlagsData()]).then(() => {
        if (disposed || !geometry) return;
        shapeCache.delete('face'); shapeCache.delete('india'); shapeCache.delete('f1'); shapeCache.delete('flags');
        if (fromName === 'face' || toName === 'face' || fromName === 'india' || toName === 'india' || fromName === 'f1' || toName === 'f1' || fromName === 'flags' || toName === 'flags') installShapes(fromName, toName);
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
          material.uniforms.uIndiaFrom.value = from === 'india' ? 1 : 0;
          material.uniforms.uIndiaTo.value = to === 'india' ? 1 : 0;
          material.uniforms.uDustFrom.value = from === 'dust' ? 1 : 0;
          material.uniforms.uDustTo.value = to === 'dust' ? 1 : 0;
          updateLayoutOffsets();
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
    setGlow(options) {
      if (Number.isFinite(options.radius)) glowRadius = THREE.MathUtils.clamp(options.radius!, 1, 1000);
      if (Number.isFinite(options.dim)) glowDim = THREE.MathUtils.clamp(options.dim!, 0.05, 1);
      if (Number.isFinite(options.boost)) glowBoost = THREE.MathUtils.clamp(options.boost!, 0, 4);
      if (!material) return;
      material.uniforms.uGlowRadius.value = glowRadius * renderer!.getPixelRatio();
      material.uniforms.uBaseDim.value = glowDim;
      material.uniforms.uGlowBoost.value = glowBoost;
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
      if (material) {
        material.uniforms.uDustAspect.value = width / Math.max(1, height) / 1.6;
        const dpr = renderer.getPixelRatio();
        (material.uniforms.uGlowResolution.value as THREE.Vector2).set(width * dpr, height * dpr);
        material.uniforms.uGlowRadius.value = glowRadius * dpr;
      }
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      updateLayoutOffsets();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      observer?.disconnect();
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerup', onPointerRelease);
      window.removeEventListener('pointercancel', onPointerRelease);
      window.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      geometry?.dispose(); material?.dispose(); renderer?.dispose();
      if (container && renderer?.domElement.parentElement === container) container.removeChild(renderer.domElement);
      renderer = null; points = null; material = null; geometry = null; camera = null; scene = null; container = null;
      shapeCache.clear();
    },
  };
}
