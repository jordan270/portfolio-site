import { AdditiveBlending, BufferAttribute, BufferGeometry, Clock, InterleavedBuffer, InterleavedBufferAttribute, MathUtils, PerspectiveCamera, Points, Scene, ShaderMaterial, Vector2, Vector3, WebGLRenderer } from 'three';
import { generate as face, getFaceFrameMetrics, loadFaceMaskData } from './shapes/face.ts';
import { generate as india, loadIndiaData } from './shapes/india.ts';
import { generate as lens } from './shapes/lens.ts';
import { generate as f1, loadSource as loadF1Source } from './shapes/f1.ts';
import { generate as python, loadPythonData } from './shapes/python.ts';
import { generate as flags, loadFlagsData } from './shapes/flags.ts';
import { generate as dust } from './shapes/dust.ts';
import { generate as contactDust } from './shapes/contactDust.ts';

export type ShapeName = 'face' | 'india' | 'python' | 'lens' | 'flags' | 'f1' | 'dust';
export interface FrameRect { x: number; y: number; w: number; h: number; }
type LegacyShapeName = 'sphere' | 'map' | 'helix' | 'galaxy';
export interface ParticleEngine {
  mount(container: HTMLElement): void;
  setIntro(progress: number): void;
  setIntroReady(ready: boolean): void;
  prepareIntro(onMilestone: (milestone: 'hero-data' | 'shader-warmup' | 'calibration') => void): Promise<void>;
  getQualityTier(): 'high' | 'medium' | 'low';
  setMorph(from: ShapeName | LegacyShapeName, to: ShapeName | LegacyShapeName, t: number): void;
  setFrame(rect: FrameRect, shape?: ShapeName): void;
  setEnergy(value: number): void;
  setQuality(quality: 'high' | 'medium' | 'low' | 'auto'): void;
  setGlow(options: { radius?: number; dim?: number; boost?: number }): void;
  setDebugScales(size: number, alpha: number): void;
  resize(): void;
  dispose(): void;
}

const generators: Record<ShapeName, (count: number, seeds?: Float32Array) => Float32Array> = { face, india, python, lens, flags, f1, dust };

// Particle visibility tuning. Alpha values multiply the shader's particle alpha.
const PARTICLE_VISIBILITY = {
  IDLE_ALPHA: 1,
  IDLE_ALPHA_BY_SHAPE: { india: 1, python: 0.97, lens: 0.9, flags: 0.97, f1: 0.97, dust: 0.55 },
  IDLE_ALPHA_BY_SHAPE_MOBILE: { india: 1, dust: 1 },
  INDIA_IDLE_DIM: 1,
  GLOW_BOOST: 1,
  BASE_DIM: 0.45,
  INDIA_EDGE_SHARE: 0.55,
  CONTACT_DUST_KEEP: 0.75,
  CONTACT_DUST_TIER_CUTOFFS: { faint: 0.85, medium: 0.97 },
  CONTACT_DUST_ALPHA_TIERS: { faint: 1.1, medium: 1.5, star: 2.2 },
  CONTACT_DUST_SIZE_TIERS: { faint: 0.55, medium: 0.9, star: 1.6 },
} as const;

interface ShapeBounds { minX: number; maxX: number; minY: number; maxY: number; maxAbsZ: number; }
interface FrameTransform { rect: FrameRect; centerX: number; centerY: number; sourceX: number; sourceY: number; scale: number; scaleX: number; screenBounds: FrameRect; }

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
attribute vec3 positionScatter;
attribute float aSeed;
attribute float aSize;
uniform float uMorph;
uniform float uMorphActive;
uniform float uIntroActive;
uniform float uIntroProgress;
uniform float uIntroReady;
uniform float uPositionScaleA;
uniform float uPositionScaleB;
uniform float uPositionScaleScatter;
uniform float uTime;
uniform float uEnergy;
uniform float uBreath;
uniform vec2 uFrameCenterFrom;
uniform vec2 uFrameCenterTo;
uniform vec2 uShapeCenterFrom;
uniform vec2 uShapeCenterTo;
uniform float uFrameScaleFrom;
uniform float uFrameScaleTo;
uniform float uFrameScaleXFrom;
uniform float uFrameScaleXTo;
uniform float uPixelRatio;
uniform float uSizeScale;
uniform float uShapeScaleFrom;
uniform float uShapeScaleTo;
uniform float uShapeAlphaFrom;
uniform float uShapeAlphaTo;
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
uniform vec3 uGlowTrail[4];
uniform float uGlowActive;
uniform vec3 uContactDustSizeTiers;
uniform vec2 uContactDustTierCutoffs;
varying float vSeed;
varying float vFaceWeight;
varying float vIndiaGlow;
varying float vIndiaRing;
varying float vIndiaWeight;
varying float vDustWeight;
varying float vGlow;
varying float vShapeScale;
varying float vShapeAlpha;
void main() {
  float t = clamp((uMorph - aSeed * 0.16) / (1.0 - 0.16), 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  vShapeScale = mix(uShapeScaleFrom, uShapeScaleTo, t);
  vShapeAlpha = mix(uShapeAlphaFrom, uShapeAlphaTo, t);
  vec3 fromPosition = positionA * uPositionScaleA;
  vec3 toPosition = positionB * uPositionScaleB;
  float dustWeight = mix(uDustFrom, uDustTo, t);
  fromPosition.x *= mix(1.0, uDustAspect, uDustFrom);
  toPosition.x *= mix(1.0, uDustAspect, uDustTo);
  fromPosition.x = (fromPosition.x - uShapeCenterFrom.x) * uFrameScaleFrom * uFrameScaleXFrom + uFrameCenterFrom.x;
  fromPosition.y = (fromPosition.y - uShapeCenterFrom.y) * uFrameScaleFrom + uFrameCenterFrom.y;
  toPosition.x = (toPosition.x - uShapeCenterTo.x) * uFrameScaleTo * uFrameScaleXTo + uFrameCenterTo.x;
  toPosition.y = (toPosition.y - uShapeCenterTo.y) * uFrameScaleTo + uFrameCenterTo.y;
  fromPosition.z *= uFrameScaleFrom;
  toPosition.z *= uFrameScaleTo;
  vec3 p;
  if (uIntroActive > 0.5) {
    float introT = clamp((uIntroProgress - aSeed * 0.45) / 0.55, 0.0, 1.0);
    introT = introT * introT * (3.0 - 2.0 * introT);
    if (uIntroReady < 0.5) {
      p = positionScatter * uPositionScaleScatter;
      p.xy += vec2(sin(uTime * 0.08 + aSeed * 12.0), cos(uTime * 0.07 + aSeed * 17.0)) * 0.003;
    } else {
      p = mix(positionScatter * uPositionScaleScatter, toPosition, introT);
      float introSwirl = sin(introT * 3.14159265);
      float introPhase = uTime * 0.55 + aSeed * 31.0;
      p += vec3(sin(p.y * 5.0 + introPhase), sin(p.z * 4.0 + introPhase * 1.13), cos(p.x * 4.5 + introPhase)) * (0.25 * introSwirl);
    }
  } else {
    p = mix(fromPosition, toPosition, t);
    if (uMorphActive > 0.5) {
      p.xy += vec2(sin(uTime * 0.12 + aSeed * 12.0), cos(uTime * 0.09 + aSeed * 17.0)) * (0.012 * dustWeight);
      float transition = sin(t * 3.14159265);
      float phase = uTime * 0.55 + aSeed * 31.0;
      p += vec3(sin(p.y * 5.0 + phase), sin(p.z * 4.0 + phase * 1.13), cos(p.x * 4.5 + phase)) * (0.018 * transition);
    }
  }
  if (uIntroActive < 0.5 || uIntroReady > 0.5) p *= uBreath;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  vec4 clipPosition = projectionMatrix * mvPosition;
  gl_Position = clipPosition;
  vec2 ndc = clipPosition.xy / max(0.0001, clipPosition.w);
  vec2 screenPixels = vec2((ndc.x * 0.5 + 0.5) * uGlowResolution.x, (0.5 - ndc.y * 0.5) * uGlowResolution.y);
  float glow = 0.0;
  if (uGlowActive > 0.5) {
    for (int i = 0; i < 4; i++) {
      vec3 trailPoint = uGlowTrail[i];
      float distanceToCursor = distance(screenPixels, trailPoint.xy);
      glow += (1.0 - smoothstep(0.0, uGlowRadius, distanceToCursor)) * trailPoint.z;
    }
  }
  glow = clamp(glow * uGlowBoost, 0.0, 1.0);
  vSeed = aSeed;
  vFaceWeight = mix(uFaceFrom, uFaceTo, t);
  vIndiaGlow = smoothstep(0.035, 0.047, p.z) * mix(uIndiaFrom, uIndiaTo, t);
  vIndiaRing = smoothstep(0.064, 0.07, p.z) * (1.0 - smoothstep(0.075, 0.08, p.z)) * mix(uIndiaFrom, uIndiaTo, t);
  vIndiaWeight = mix(uIndiaFrom, uIndiaTo, t);
  vDustWeight = dustWeight;
  vGlow = glow;
  float faceSize = mix(1.0, 1.9, fract(aSeed * 21739.319));
  float faceSizeCap = mix(3.0, mix(1.9, 2.85, glow * uGlowSizeEnabled), vFaceWeight) * uSizeScale;
  float dustTier = fract(aSeed * 43758.5453);
  float dustSize = dustTier < uContactDustTierCutoffs.x ? uContactDustSizeTiers.x : dustTier < uContactDustTierCutoffs.y ? uContactDustSizeTiers.y : uContactDustSizeTiers.z;
  float contactSize = mix(1.0, dustSize, vDustWeight);
  gl_PointSize = clamp(mix(aSize * contactSize, faceSize, vFaceWeight) * uPixelRatio * (4.5 / max(0.1, -mvPosition.z)) * uSizeScale * vShapeScale * (1.0 + 0.5 * glow * uGlowSizeEnabled), 1.0, faceSizeCap * vShapeScale);
}`;

const fragmentShader = `
uniform float uOpacity;
uniform float uAlphaScale;
uniform float uBaseDim;
uniform float uTime;
uniform float uIndiaIdleDim;
uniform vec3 uContactDustAlphaTiers;
uniform vec2 uContactDustTierCutoffs;
varying float vSeed;
varying float vFaceWeight;
varying float vIndiaGlow;
varying float vIndiaRing;
varying float vIndiaWeight;
varying float vDustWeight;
varying float vGlow;
varying float vShapeAlpha;
varying float vShapeScale;
void main() {
  vec2 q = gl_PointCoord - vec2(0.5);
  float r = length(q);
  if (r > 0.5) discard;
  float falloff = 1.0 - smoothstep(0.12, 0.5, r);
  float ordinaryVariation = mix(0.18, 0.5, fract(vSeed * 43758.5453));
  float faceVariation = mix(1.0, 1.5, fract(vSeed * 31817.171));
  float variation = mix(ordinaryVariation, faceVariation, vFaceWeight);
  float dustTier = fract(vSeed * 43758.5453);
  float dustAlpha = dustTier < uContactDustTierCutoffs.x ? uContactDustAlphaTiers.x : dustTier < uContactDustTierCutoffs.y ? uContactDustAlphaTiers.y : uContactDustAlphaTiers.z;
  variation *= mix(1.0, dustAlpha, vDustWeight);
  float faceDim = mix(1.0, 0.9, vFaceWeight);
  float indiaAlphaScale = mix(uAlphaScale, 1.1, smoothstep(0.5, 1.0, vIndiaWeight));
  float alphaScale = mix(uAlphaScale, indiaAlphaScale, smoothstep(0.5, 1.0, vIndiaWeight));
  float idleDim = mix(uBaseDim, uIndiaIdleDim, vIndiaWeight);
  float baseAlpha = variation * uOpacity * alphaScale * vShapeAlpha * mix(1.0, 0.6, vDustWeight) * idleDim * faceDim;
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
  const qualityCounts = { high: 55_000, medium: 30_000, low: 12_000 } as const;
  let quality: 'high' | 'medium' | 'low' | 'auto' = 'auto';
  let count = Math.max(1000, Math.floor(opts.count ?? (preferMedium ? qualityCounts.medium : qualityCounts.high)));
  const customCount = opts.count !== undefined;
  let frameAverage = 16.7;
  let slowP95Since = 0;
  let qualityTier: 'high' | 'medium' | 'low' = preferMedium ? 'medium' : 'high';
  const pointScaleForTier = (tier: 'high' | 'medium' | 'low') => mobile
    ? tier === 'high' ? 1.15 : tier === 'medium' ? 0.4 : 0.65
    : tier === 'high' ? 1.15 : tier === 'medium' ? 1 : 0.65;
  const alphaScaleForTier = (tier: 'high' | 'medium' | 'low') => mobile
    ? tier === 'high' ? 1.1 : tier === 'medium' ? 0.3 : 0.48
    : tier === 'high' ? 1.1 : 1.1;
  const shapePointScale: Record<ShapeName, number> = mobile
    ? { face: 1, india: 1, python: 1, lens: 1, flags: 1, f1: 1, dust: 1 }
    : { face: 1.23, india: 0.66, python: 0.97, lens: 0.82, flags: 0.97, f1: 0.97, dust: 0.72 };
  const shapeAlphaScale: Record<ShapeName, number> = {
    face: PARTICLE_VISIBILITY.IDLE_ALPHA, india: mobile ? PARTICLE_VISIBILITY.IDLE_ALPHA_BY_SHAPE_MOBILE.india : PARTICLE_VISIBILITY.IDLE_ALPHA_BY_SHAPE.india,
    python: PARTICLE_VISIBILITY.IDLE_ALPHA_BY_SHAPE.python, lens: PARTICLE_VISIBILITY.IDLE_ALPHA_BY_SHAPE.lens,
    flags: PARTICLE_VISIBILITY.IDLE_ALPHA_BY_SHAPE.flags, f1: PARTICLE_VISIBILITY.IDLE_ALPHA_BY_SHAPE.f1,
    dust: mobile ? PARTICLE_VISIBILITY.IDLE_ALPHA_BY_SHAPE_MOBILE.dust : PARTICLE_VISIBILITY.IDLE_ALPHA_BY_SHAPE.dust,
  };
  const slowSamples = new Uint8Array(120);
  let slowSamplesUsed = 0, slowSamplesCount = 0, slowSampleCursor = 0;
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let container: HTMLElement | null = null;
  let renderer: WebGLRenderer | null = null;
  let scene: Scene | null = null;
  let camera: PerspectiveCamera | null = null;
  let points: Points | null = null;
  let material: ShaderMaterial | null = null;
  let geometry: BufferGeometry | null = null;
  let observer: ResizeObserver | null = null;
  let raf = 0;
  let idleTimer = 0;
  let lastScrollAt = performance.now();
  let lastPointerAt = 0;
  let disposed = false;
  let energy = 1;
  let introActive = false;
  let introProgress = 1;
  let introReady = true;
  let targetMorph = 0;
  let fromName: ShapeName = 'face';
  let toName: ShapeName = 'face';
  let pointerX = 0, smoothX = 0;
  let cursorX = 0, cursorY = 0, smoothCursorX = 0, smoothCursorY = 0;
  let pointerActive = false, pointerType = 'mouse', touchFadeRemaining = 0, trailElapsed = 0, trailHead = 0;
  let glowRadius = 140, glowDim: number = PARTICLE_VISIBILITY.BASE_DIM, glowBoost: number = PARTICLE_VISIBILITY.GLOW_BOOST;
  const debugPerf = new URLSearchParams(location.search).has('debugPerf') ? { updateMs: 0, renderMs: 0, renderAverageMs: 0, frameMs: 0, frameAverageMs: 0, particleCount: 0, quality: '', rendererInfo: { calls: 0, points: 0, geometries: 0, textures: 0 } } : null;
  if (debugPerf) (window as Window & { __particleEnginePerf?: NonNullable<typeof debugPerf> }).__particleEnginePerf = debugPerf;
  const trailX = new Float32Array(4), trailY = new Float32Array(4), trailAge = new Float32Array(4);
  trailAge.fill(10);
  const glowTrailUniforms: Vector3[] = [];
  for (let i = 0; i < 4; i++) glowTrailUniforms.push(new Vector3());
  let seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) seeds[i] = Math.random();
  const makeScatterPositions = () => {
    const scatter = new Float32Array(count * 3);
    if (!camera) return scatter;
    const aspect = Math.max(0.1, camera.aspect);
    const columns = Math.ceil(Math.sqrt(count * aspect));
    const rows = Math.ceil(count / columns);
    for (let i = 0; i < count; i++) {
      const seed = seeds[i] ?? Math.random();
      const fract = (value: number) => value - Math.floor(value);
      const jitterX = fract(Math.sin((i + 1) * 127.1 + seed * 311.7) * 43758.5453);
      const jitterY = fract(Math.sin((i + 1) * 269.5 + seed * 183.3) * 24634.6345);
      const depth = seed * 1.2 - 0.6;
      const halfHeight = (camera.position.z - depth) * Math.tan(MathUtils.degToRad(camera.fov / 2));
      const halfWidth = halfHeight * aspect;
      const x = ((i % columns + jitterX) / columns * 2 - 1) * halfWidth * 1.1;
      const y = ((Math.floor(i / columns) + jitterY) / rows * 2 - 1) * halfHeight * 1.1;
      scatter[i * 3] = x;
      scatter[i * 3 + 1] = y;
      scatter[i * 3 + 2] = depth;
    }
    return scatter;
  };
  const packPosition = (source: Float32Array) => {
    let scale = 0;
    for (let i = 0; i < source.length; i++) scale = Math.max(scale, Math.abs(source[i]));
    scale = Math.max(scale, 1e-6);
    const packed = new Int16Array(source.length);
    for (let i = 0; i < source.length; i++) packed[i] = Math.round(source[i] / scale * 32767);
    return { attribute: new BufferAttribute(packed, 3, true), scale };
  };
  const makeSeedSizeAttributes = () => {
    const values = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      values[i * 2] = seeds[i];
      values[i * 2 + 1] = Math.random() < 0.03 ? 3.0 + Math.random() * 0.6 : 1.2 + Math.random() * 1.25;
    }
    const seedSizeBuffer = new InterleavedBuffer(values, 2);
    return {
      seed: new InterleavedBufferAttribute(seedSizeBuffer, 1, 0),
      size: new InterleavedBufferAttribute(seedSizeBuffer, 1, 1),
    };
  };
  const clock = new Clock();
  const shapeCache = new Map<ShapeName, Float32Array>();
  let heroDataReady: Promise<void> = Promise.resolve();
  const shapeBoundsCache = new Map<ShapeName, ShapeBounds>();
  const shapeFrames = new Map<ShapeName, FrameRect>();
  if (new URLSearchParams(location.search).has('debugFrames')) (window as Window & { __particleFrameDebug?: Record<string, { rect: FrameRect; projected: FrameRect }> }).__particleFrameDebug = {};
  const getShape = (name: ShapeName) => {
    let value = shapeCache.get(name);
    if (!value) {
      value = name === 'dust' ? contactDust(count, seeds, PARTICLE_VISIBILITY.CONTACT_DUST_KEEP)
        : name === 'india' ? india(count, seeds, PARTICLE_VISIBILITY.INDIA_EDGE_SHARE)
          : generators[name](count, seeds);
      shapeCache.set(name, value);
    }
    return value;
  };
  const getShapeBounds = (name: ShapeName): ShapeBounds => {
    let bounds = shapeBoundsCache.get(name);
    if (bounds) return bounds;
    const data = getShape(name);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, maxAbsZ = 0;
    const dustAspect = name === 'dust' ? window.innerWidth / Math.max(1, window.innerHeight) / 1.6 : 1;
    for (let i = 0; i < data.length; i += 3) {
      const x = data[i] * dustAspect, y = data[i + 1], z = Math.abs(data[i + 2]);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); maxAbsZ = Math.max(maxAbsZ, z);
    }
    bounds = { minX, maxX, minY, maxY, maxAbsZ };
    shapeBoundsCache.set(name, bounds);
    return bounds;
  };
  const fitShapeToFrame = (name: ShapeName, rect: FrameRect): FrameTransform => {
    const cameraZ = camera?.position.z ?? 4.2;
    const height = Math.max(1, container?.clientHeight ?? window.innerHeight);
    const unitsPerPixel = 2 * cameraZ * Math.tan(MathUtils.degToRad(45 / 2)) / height;
    if (name === 'dust') {
      return { rect, centerX: 0, centerY: 0, sourceX: 0, sourceY: 0, scale: 1, scaleX: 1, screenBounds: { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight } };
    }
    if (name === 'face') {
      const bounds = getShapeBounds(name), spanY = Math.max(1e-4, bounds.maxY - bounds.minY);
      const metrics = getFaceFrameMetrics();
      const narrow = window.innerWidth / Math.max(1, window.innerHeight) < 0.7;
      const imageHeight = window.innerHeight * (narrow ? 1 : 1.12);
      const imageTop = window.innerHeight * (narrow ? 0.08 : 0.06);
      const screenH = imageHeight * metrics.alphaHeight;
      const top = imageTop + imageHeight * metrics.alphaTop;
      let scale = screenH * unitsPerPixel / spanY;
      for (let i = 0; i < 4; i++) {
        const perspective = cameraZ / Math.max(0.5, cameraZ - bounds.maxAbsZ * scale);
        scale *= screenH * unitsPerPixel / (spanY * scale * perspective);
      }
      const perspective = cameraZ / Math.max(0.5, cameraZ - bounds.maxAbsZ * scale);
      const projectedHeight = spanY * scale * perspective / unitsPerPixel;
      const projectedWidth = (bounds.maxX - bounds.minX) * scale * perspective / unitsPerPixel;
      const scaleX = 1;
      const imageWidth = imageHeight * metrics.imageAspect;
      return {
        rect: { x: window.innerWidth / 2 - imageWidth / 2, y: imageTop, w: imageWidth, h: imageHeight },
        centerX: 0,
        centerY: (window.innerHeight / 2 - top - projectedHeight / 2) * unitsPerPixel,
        sourceX: (bounds.minX + bounds.maxX) / 2,
        sourceY: (bounds.minY + bounds.maxY) / 2,
        scale,
        scaleX,
        screenBounds: { x: window.innerWidth / 2 - projectedWidth * scaleX / 2, y: top, w: projectedWidth * scaleX, h: projectedHeight },
      };
    }
    if (name === 'india') {
      return { rect, centerX: 0, centerY: 0, sourceX: 0, sourceY: 0, scale: 1, scaleX: 1, screenBounds: { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight } };
    }
    const bounds = getShapeBounds(name);
    const spanX = Math.max(1e-4, bounds.maxX - bounds.minX), spanY = Math.max(1e-4, bounds.maxY - bounds.minY);
    const availableWidth = Math.max(1, rect.w) * unitsPerPixel, availableHeight = Math.max(1, rect.h) * unitsPerPixel;
    let scale = Math.min(availableWidth / spanX, availableHeight / spanY);
    for (let i = 0; i < 3; i++) {
      const perspective = cameraZ / Math.max(0.5, cameraZ - bounds.maxAbsZ * scale);
      scale *= Math.min(1, availableWidth / (spanX * scale * perspective), availableHeight / (spanY * scale * perspective));
    }
    scale *= 0.92;
    const sourceX = (bounds.minX + bounds.maxX) / 2, sourceY = (bounds.minY + bounds.maxY) / 2;
    const centerX = (rect.x + rect.w / 2 - window.innerWidth / 2) * unitsPerPixel;
    const perspective = cameraZ / Math.max(0.5, cameraZ - bounds.maxAbsZ * scale);
    const screenW = spanX * scale * perspective / unitsPerPixel, screenH = spanY * scale * perspective / unitsPerPixel;
    const centerY = (window.innerHeight / 2 - (rect.y + rect.h / 2)) * unitsPerPixel;
    const screenBounds = { x: rect.x + rect.w / 2 - screenW / 2, y: rect.y + rect.h / 2 - screenH / 2, w: screenW, h: screenH };
    return { rect, centerX, centerY, sourceX, sourceY, scale, scaleX: 1, screenBounds };
  };
  const applyFrameUniform = (name: ShapeName, transform: FrameTransform, endpoint: 'From' | 'To') => {
    if (!material) return;
    (material.uniforms[`uFrameCenter${endpoint}`].value as Vector2).set(transform.centerX, transform.centerY);
    (material.uniforms[`uShapeCenter${endpoint}`].value as Vector2).set(transform.sourceX, transform.sourceY);
    material.uniforms[`uFrameScale${endpoint}`].value = transform.scale;
    material.uniforms[`uFrameScaleX${endpoint}`].value = transform.scaleX;
    const debugFrames = (window as Window & { __particleFrameDebug?: Record<string, { rect: FrameRect; projected: FrameRect }> }).__particleFrameDebug;
    if (debugFrames) debugFrames[name] = { rect: transform.rect, projected: transform.screenBounds };
  };
  const updateFrameUniforms = () => {
    const full = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
    const fromRect = shapeFrames.get(fromName) ?? full, toRect = shapeFrames.get(toName) ?? full;
    applyFrameUniform(fromName, fitShapeToFrame(fromName, fromRect), 'From');
    applyFrameUniform(toName, fitShapeToFrame(toName, toRect), 'To');
  };
  const onPointer = (event: PointerEvent) => {
    pointerX = MathUtils.clamp((event.clientX / Math.max(1, window.innerWidth) * 2 - 1), -1, 1);
    cursorX = event.clientX; cursorY = event.clientY;
    pointerType = event.pointerType || 'mouse'; pointerActive = true; touchFadeRemaining = 0;
    lastPointerAt = performance.now();
    requestActiveFrame();
  };
  const onPointerRelease = (event: PointerEvent) => {
    if (event.pointerType === 'touch') { pointerActive = false; touchFadeRemaining = 0.6; }
  };
  const onPointerLeave = () => { if (pointerType !== 'touch') pointerActive = false; };
  const loadRemainingShapes = async () => {
    await loadIndiaData();
    await loadPythonData();
    await loadFlagsData();
    await loadF1Source();
    if (disposed) return;
    for (const shape of ['india', 'python', 'flags', 'f1'] as const) shapeCache.delete(shape);
  };
  const onVisibility = () => {
    if (document.hidden) { cancelAnimationFrame(raf); window.clearTimeout(idleTimer); raf = 0; idleTimer = 0; }
    else if (!disposed && renderer) { clock.getDelta(); requestActiveFrame(); }
  };
  const isIdle = () => performance.now() - lastScrollAt > 400 && performance.now() - lastPointerAt > 1500 && !introActive && Math.abs(targetMorph - (material?.uniforms.uMorph.value as number ?? 0)) < 0.002;
  const scheduleNextFrame = () => {
    if (disposed || document.hidden) return;
    if (isIdle()) idleTimer = window.setTimeout(() => { idleTimer = 0; raf = requestAnimationFrame(render); }, 33);
    else raf = requestAnimationFrame(render);
  };
  const requestActiveFrame = () => {
    if (disposed || document.hidden || !renderer) return;
    window.clearTimeout(idleTimer); idleTimer = 0;
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(render);
  };
  const setCount = (nextCount: number) => {
    if (count === nextCount) return;
    count = nextCount;
    qualityTier = count >= qualityCounts.high ? 'high' : count >= qualityCounts.medium ? 'medium' : 'low';
    if (debugPerf) Object.assign(debugPerf, { chosenTier: qualityTier, particleCount: count });
    shapeCache.clear(); shapeBoundsCache.clear();
    seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) seeds[i] = Math.random();
    if (!geometry) return;
    const seedSize = makeSeedSizeAttributes();
    geometry.setAttribute('aSeed', seedSize.seed);
    geometry.setAttribute('aSize', seedSize.size);
    const scatter = packPosition(makeScatterPositions());
    geometry.setAttribute('positionScatter', scatter.attribute);
    if (material) material.uniforms.uPositionScaleScatter.value = scatter.scale;
    installShapes(fromName, toName);
    updateFrameUniforms();
    if (renderer) {
      const dpr = Math.min(window.devicePixelRatio || 1, qualityTier === 'high' ? 1.5 : qualityTier === 'medium' ? 1.25 : 1);
      renderer.setPixelRatio(dpr);
      renderer.setSize(container?.clientWidth ?? window.innerWidth, container?.clientHeight ?? window.innerHeight, false);
      if (material) {
        material.uniforms.uPixelRatio.value = dpr;
        (material.uniforms.uGlowResolution.value as Vector2).set((container?.clientWidth ?? window.innerWidth) * dpr, (container?.clientHeight ?? window.innerHeight) * dpr);
        material.uniforms.uAlphaScale.value = alphaScaleForTier(qualityTier);
        material.uniforms.uSizeScale.value = pointScaleForTier(qualityTier);
      }
    }
  };
  const render = () => {
    if (!renderer || !scene || !camera || !material || disposed || document.hidden) return;
    raf = 0;
    const frameStarted = debugPerf ? performance.now() : 0;
    if (debugPerf) performance.mark('particle-update-start');
    const dt = Math.min(clock.getDelta(), 0.05);
    frameAverage += (dt * 1000 - frameAverage) * 0.08;
    if (debugPerf) { debugPerf.frameMs = dt * 1000; debugPerf.frameAverageMs = frameAverage; debugPerf.particleCount = count; debugPerf.quality = quality; }
    const isSlowSample = dt * 1000 > 28 ? 1 : 0;
    if (slowSamplesUsed === slowSamples.length) slowSamplesCount -= slowSamples[slowSampleCursor];
    else slowSamplesUsed++;
    slowSamples[slowSampleCursor] = isSlowSample;
    slowSamplesCount += isSlowSample;
    slowSampleCursor = (slowSampleCursor + 1) % slowSamples.length;
    if (quality === 'auto' && !customCount) {
      const slowP95 = slowSamplesUsed === slowSamples.length && slowSamplesCount > 6;
      if (slowP95 && !slowP95Since) slowP95Since = performance.now();
      if (!slowP95) slowP95Since = 0;
      if (slowP95Since && performance.now() - slowP95Since >= 2000 && qualityTier !== 'low') {
        setCount(qualityTier === 'high' ? qualityCounts.medium : qualityCounts.low);
        slowP95Since = 0;
      }
    }
    const current = material.uniforms.uMorph.value as number;
    material.uniforms.uMorph.value = reducedMotion ? 0 : MathUtils.damp(current, targetMorph, 5, dt);
    material.uniforms.uMorphActive.value = Math.abs(targetMorph - current) > 0.002 ? 1 : 0;
    material.uniforms.uIntroActive.value = introActive ? 1 : 0;
    material.uniforms.uIntroProgress.value = introProgress;
    material.uniforms.uIntroReady.value = introReady ? 1 : 0;
    const elapsed = clock.elapsedTime;
    material.uniforms.uTime.value = reducedMotion ? 0 : elapsed * Math.max(0, energy);
    material.uniforms.uEnergy.value = energy;
    material.uniforms.uBreath.value = reducedMotion ? 1 : 1 + Math.sin(elapsed * 0.65) * 0.012 * Math.max(0, energy);
    smoothX += (pointerX - smoothX) * 0.035;
    smoothCursorX += (cursorX - smoothCursorX) * 0.22;
    smoothCursorY += (cursorY - smoothCursorY) * 0.22;
    const glowActivity = pointerActive ? 1 : touchFadeRemaining > 0 ? touchFadeRemaining / 0.6 : 0;
    material.uniforms.uGlowActive.value = !introActive && glowActivity > 0 ? 1 : 0;
    touchFadeRemaining = Math.max(0, touchFadeRemaining - dt);
    const dpr = renderer.getPixelRatio();
    trailElapsed += dt;
    if (!reducedMotion && glowActivity > 0 && trailElapsed >= 0.05) {
      trailHead = (trailHead + 1) % 4;
      trailX[trailHead] = smoothCursorX; trailY[trailHead] = smoothCursorY; trailAge[trailHead] = 0;
      trailElapsed = 0;
    }
    const trailUniforms = material.uniforms.uGlowTrail.value as Vector3[];
    if (reducedMotion) {
      trailUniforms[0].set(smoothCursorX * dpr, smoothCursorY * dpr, glowActivity);
      for (let i = 1; i < 4; i++) trailUniforms[i].set(0, 0, 0);
    } else {
      for (let i = 0; i < 4; i++) {
        trailAge[i] += dt;
        trailUniforms[i].set(trailX[i] * dpr, trailY[i] * dpr, Math.exp(-trailAge[i] * 3) * glowActivity);
      }
    }
    if (points) {
      const idleYaw = reducedMotion ? 0 : Math.sin(elapsed * 0.24) * MathUtils.degToRad(4);
      const mouseYaw = reducedMotion ? 0 : smoothX * MathUtils.degToRad(4);
      const targetYaw = introActive ? 0 : idleYaw + mouseYaw;
      points.rotation.x += (0 - points.rotation.x) * 0.025;
      points.rotation.y += (targetYaw - points.rotation.y) * 0.025;
    }
    const renderStarted = debugPerf ? performance.now() : 0;
    if (debugPerf) performance.mark('particle-submit-start');
    renderer.render(scene, camera);
    if (debugPerf) {
      performance.mark('particle-submit-end');
      performance.measure('particle-update', 'particle-update-start', 'particle-submit-start');
      performance.measure('particle-render-submit', 'particle-submit-start', 'particle-submit-end');
      debugPerf.updateMs = renderStarted - frameStarted;
      debugPerf.renderMs = performance.now() - renderStarted;
      debugPerf.renderAverageMs += (debugPerf.renderMs - debugPerf.renderAverageMs) * 0.08;
      Object.assign(debugPerf, { rendererInfo: { ...renderer.info.render, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures } });
      performance.clearMarks('particle-update-start'); performance.clearMarks('particle-submit-start'); performance.clearMarks('particle-submit-end');
      performance.clearMeasures('particle-update'); performance.clearMeasures('particle-render-submit');
    }
    scheduleNextFrame();
  };
  const installShapes = (from: ShapeName, to: ShapeName) => {
    if (!geometry) return;
    const a = packPosition(getShape(from)), b = from === to ? a : packPosition(getShape(to));
    geometry.setAttribute('position', a.attribute);
    geometry.setAttribute('positionA', a.attribute);
    geometry.setAttribute('positionB', b.attribute);
    geometry.attributes.positionA.needsUpdate = true;
    geometry.attributes.positionB.needsUpdate = true;
    if (material) {
      material.uniforms.uPositionScaleA.value = a.scale;
      material.uniforms.uPositionScaleB.value = b.scale;
    }
  };
  return {
    mount(target) {
      if (disposed) throw new Error('Cannot mount a disposed ParticleEngine');
      if (renderer) return;
      container = target;
      scene = new Scene();
      camera = new PerspectiveCamera(45, 1, 0.1, 100);
      camera.position.z = 4.2;
      geometry = new BufferGeometry();
      const initialFace = packPosition(getShape('face'));
      const initialScatter = packPosition(makeScatterPositions());
      const seedSize = makeSeedSizeAttributes();
      geometry.setAttribute('position', initialFace.attribute);
      geometry.setAttribute('positionA', initialFace.attribute);
      geometry.setAttribute('positionB', initialFace.attribute);
      geometry.setAttribute('positionScatter', initialScatter.attribute);
      geometry.setAttribute('aSeed', seedSize.seed);
      geometry.setAttribute('aSize', seedSize.size);
      material = new ShaderMaterial({
        vertexShader, fragmentShader, transparent: true, depthTest: false, depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uMorph: { value: 0 }, uMorphActive: { value: 0 }, uIntroActive: { value: 0 }, uIntroProgress: { value: 1 }, uIntroReady: { value: 1 }, uGlowActive: { value: 0 }, uPositionScaleA: { value: initialFace.scale }, uPositionScaleB: { value: initialFace.scale }, uPositionScaleScatter: { value: initialScatter.scale }, uShapeScaleFrom: { value: shapePointScale.face }, uShapeScaleTo: { value: shapePointScale.face }, uShapeAlphaFrom: { value: shapeAlphaScale.face }, uShapeAlphaTo: { value: shapeAlphaScale.face }, uTime: { value: 0 }, uEnergy: { value: 1 }, uBreath: { value: 1 }, uFrameCenterFrom: { value: new Vector2() }, uFrameCenterTo: { value: new Vector2() }, uShapeCenterFrom: { value: new Vector2() }, uShapeCenterTo: { value: new Vector2() }, uFrameScaleFrom: { value: 1 }, uFrameScaleTo: { value: 1 }, uFrameScaleXFrom: { value: 1 }, uFrameScaleXTo: { value: 1 }, uOpacity: { value: 1 }, uBaseDim: { value: glowDim }, uGlowResolution: { value: new Vector2(1, 1) }, uGlowRadius: { value: glowRadius }, uGlowBoost: { value: glowBoost }, uGlowSizeEnabled: { value: reducedMotion ? 0 : 1 }, uGlowTrail: { value: glowTrailUniforms }, uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, qualityTier === 'high' ? 1.5 : qualityTier === 'medium' ? 1.25 : 1) }, uSizeScale: { value: pointScaleForTier(qualityTier) }, uAlphaScale: { value: alphaScaleForTier(qualityTier) }, uFaceFrom: { value: 1 }, uFaceTo: { value: 1 }, uIndiaFrom: { value: 0 }, uIndiaTo: { value: 0 }, uDustFrom: { value: 0 }, uDustTo: { value: 0 }, uDustAspect: { value: window.innerWidth / Math.max(1, window.innerHeight) / 1.6 } },
      });
      material.uniforms.uIndiaIdleDim = { value: PARTICLE_VISIBILITY.INDIA_IDLE_DIM };
      material.uniforms.uContactDustAlphaTiers = { value: new Vector3(PARTICLE_VISIBILITY.CONTACT_DUST_ALPHA_TIERS.faint, PARTICLE_VISIBILITY.CONTACT_DUST_ALPHA_TIERS.medium, PARTICLE_VISIBILITY.CONTACT_DUST_ALPHA_TIERS.star) };
      material.uniforms.uContactDustSizeTiers = { value: new Vector3(PARTICLE_VISIBILITY.CONTACT_DUST_SIZE_TIERS.faint, PARTICLE_VISIBILITY.CONTACT_DUST_SIZE_TIERS.medium, PARTICLE_VISIBILITY.CONTACT_DUST_SIZE_TIERS.star) };
      material.uniforms.uContactDustTierCutoffs = { value: new Vector2(PARTICLE_VISIBILITY.CONTACT_DUST_TIER_CUTOFFS.faint, PARTICLE_VISIBILITY.CONTACT_DUST_TIER_CUTOFFS.medium) };
      points = new Points(geometry, material);
      points.frustumCulled = false;
      scene.add(points);
      renderer = new WebGLRenderer({ alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
      const gl = renderer.getContext();
      const rendererInfo = gl.getExtension('WEBGL_debug_renderer_info');
      const gpuName = rendererInfo ? String(gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL)) : '';
      if (/intel.*(graphics|uhd|iris)|mali|adreno|apple m\d/i.test(gpuName) && !preferMedium) {
        preferMedium = true;
        if (quality === 'auto' && !customCount) setCount(qualityCounts.medium);
      }
      const pixelRatio = Math.min(window.devicePixelRatio || 1, count >= qualityCounts.high ? 1.5 : count >= qualityCounts.medium ? 1.25 : 1);
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
      heroDataReady = loadFaceMaskData().then(() => {
        if (disposed || !geometry) return;
        shapeCache.delete('face');
        shapeBoundsCache.delete('face');
        if (fromName === 'face' || toName === 'face') installShapes(fromName, toName);
        updateFrameUniforms();
      });
      const scheduleIdle = (callback: () => void) => {
        const idle = (window as Window & { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
        if (idle) idle(callback, { timeout: 4000 }); else window.setTimeout(callback, 250);
      };
      scheduleIdle(() => { void loadRemainingShapes(); });
      requestActiveFrame();
    },
    setIntro(progress) {
      if (!Number.isFinite(progress)) return;
      introProgress = MathUtils.clamp(progress, 0, 1);
      introActive = introProgress < 1;
      if (introActive && (fromName !== 'face' || toName !== 'face')) {
        fromName = 'face'; toName = 'face'; targetMorph = 0;
        installShapes(fromName, toName);
        updateFrameUniforms();
      }
      if (material) {
        material.uniforms.uIntroActive.value = introActive ? 1 : 0;
        material.uniforms.uIntroProgress.value = introProgress;
      }
      requestActiveFrame();
    },
    setIntroReady(ready) {
      introReady = ready;
      if (material) material.uniforms.uIntroReady.value = ready ? 1 : 0;
      requestActiveFrame();
    },
    async prepareIntro(onMilestone) {
      await heroDataReady;
      onMilestone('hero-data');
      if (!renderer || !scene || !camera || !material) throw new Error('Renderer was not ready for intro preparation');
      renderer.compile(scene, camera);
      const opacity = material.uniforms.uOpacity.value as number;
      material.uniforms.uIntroActive.value = 0;
      material.uniforms.uOpacity.value = 0;
      renderer.render(scene, camera);
      material.uniforms.uOpacity.value = opacity;
      material.uniforms.uIntroActive.value = introActive ? 1 : 0;
      onMilestone('shader-warmup');
      const measureThirtyFrames = async () => {
        let previous = 0, total = 0, frames = 0;
        for (let i = 0; i < 30; i++) {
          const now = await new Promise<number>((resolve) => requestAnimationFrame(resolve));
          if (previous) { total += now - previous; frames++; }
          previous = now;
        }
        return total / Math.max(1, frames);
      };
      let average = await measureThirtyFrames();
      while (average > 22 && qualityTier !== 'low') {
        setCount(qualityTier === 'high' ? qualityCounts.medium : qualityCounts.low);
        average = await measureThirtyFrames();
      }
      if (debugPerf) Object.assign(debugPerf, { chosenTier: qualityTier, calibrationAverageMs: average });
      if (import.meta.env.DEV) console.info(`[ParticleEngine] calibrated ${qualityTier} tier (${average.toFixed(1)} ms/frame)`);
      onMilestone('calibration');
    },
    getQualityTier() { return qualityTier; },
    setMorph(from, to, t) {
      if (introActive) return;
      lastScrollAt = performance.now();
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
          material.uniforms.uShapeScaleFrom.value = shapePointScale[from];
          material.uniforms.uShapeScaleTo.value = shapePointScale[to];
          material.uniforms.uShapeAlphaFrom.value = shapeAlphaScale[from];
          material.uniforms.uShapeAlphaTo.value = shapeAlphaScale[to];
          updateFrameUniforms();
        }
      }
      targetMorph = reducedMotion ? 0 : MathUtils.clamp(t, 0, 1);
      requestActiveFrame();
    },
    setFrame(rect, shape = toName) {
      if (![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) || rect.w <= 0 || rect.h <= 0) return;
      shapeFrames.set(shape, { x: rect.x, y: rect.y, w: rect.w, h: rect.h });
      updateFrameUniforms();
      requestActiveFrame();
    },
    setEnergy(value) { energy = Number.isFinite(value) ? Math.max(0, value) : 1; },
    setDebugScales(size, alpha) {
      if (!material) return;
      material.uniforms.uSizeScale.value = MathUtils.clamp(size, 0.25, 2.5);
      material.uniforms.uAlphaScale.value = MathUtils.clamp(alpha, 0, 2);
    },
    setGlow(options) {
      if (Number.isFinite(options.radius)) glowRadius = MathUtils.clamp(options.radius!, 1, 1000);
      if (Number.isFinite(options.dim)) glowDim = MathUtils.clamp(options.dim!, 0.05, 1);
      if (Number.isFinite(options.boost)) glowBoost = MathUtils.clamp(options.boost!, 0, 4);
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
      qualityTier = count >= qualityCounts.high ? 'high' : count >= qualityCounts.medium ? 'medium' : 'low';
      if (debugPerf) Object.assign(debugPerf, { chosenTier: qualityTier });
      if (renderer && material) {
        const dpr = Math.min(window.devicePixelRatio || 1, qualityTier === 'high' ? 1.5 : qualityTier === 'medium' ? 1.25 : 1);
        renderer.setPixelRatio(dpr);
        material.uniforms.uPixelRatio.value = dpr;
        material.uniforms.uSizeScale.value = pointScaleForTier(qualityTier);
        material.uniforms.uAlphaScale.value = alphaScaleForTier(qualityTier);
      }
      slowP95Since = 0;
    },
    resize() {
      if (!container || !renderer || !camera) return;
      const width = Math.max(1, container.clientWidth), height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      if (geometry?.getAttribute('positionScatter')) {
        const scatter = packPosition(makeScatterPositions());
        geometry.setAttribute('positionScatter', scatter.attribute);
        if (material) material.uniforms.uPositionScaleScatter.value = scatter.scale;
      }
      if (material) {
        material.uniforms.uDustAspect.value = width / Math.max(1, height) / 1.6;
        const dpr = renderer.getPixelRatio();
        (material.uniforms.uGlowResolution.value as Vector2).set(width * dpr, height * dpr);
        material.uniforms.uGlowRadius.value = glowRadius * dpr;
      }
      shapeBoundsCache.clear();
      updateFrameUniforms();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(idleTimer);
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

