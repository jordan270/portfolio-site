import * as THREE from 'three';
import { generate as sphere } from './shapes/sphere.ts';
import { generate as map, getMapSourceVersion } from './shapes/map.ts';
import { generate as helix } from './shapes/helix.ts';
import { generate as galaxy } from './shapes/galaxy.ts';
export { setMapSource } from './shapes/map.ts';

export type ShapeName = 'sphere' | 'map' | 'helix' | 'galaxy';
export interface ParticleEngine {
  mount(container: HTMLElement): void;
  setMorph(from: ShapeName, to: ShapeName, t: number): void;
  setEnergy(value: number): void;
  resize(): void;
  dispose(): void;
}

const generators: Record<ShapeName, (count: number) => Float32Array> = { sphere, map, helix, galaxy };

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
varying float vSeed;
varying float vEdge;
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
  gl_PointSize = aSize * (300.0 / max(1.0, -mvPosition.z));
  vSeed = aSeed;
  vEdge = 1.0 - smoothstep(0.0, 0.38, abs(length(p) - 0.82));
}`;

const fragmentShader = `
uniform float uOpacity;
varying float vSeed;
varying float vEdge;
void main() {
  vec2 q = gl_PointCoord - vec2(0.5);
  float r = length(q) * 2.0;
  float alpha = 1.0 - smoothstep(0.55, 1.0, r);
  float variation = mix(0.35, 1.0, fract(vSeed * 43758.5453));
  float brightness = mix(0.72, 1.25, vEdge);
  gl_FragColor = vec4(vec3(brightness), alpha * variation * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createEngine(opts: { count?: number } = {}): ParticleEngine {
  const mobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches;
  const count = Math.max(1000, Math.floor(opts.count ?? (mobile ? 20_000 : 60_000)));
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
  let fromName: ShapeName = 'sphere';
  let toName: ShapeName = 'sphere';
  let installedMapVersion = getMapSourceVersion();
  let pointerX = 0, pointerY = 0, smoothX = 0, smoothY = 0;
  const clock = new THREE.Clock();
  const shapeCache = new Map<ShapeName, Float32Array>();
  const getShape = (name: ShapeName) => {
    let value = shapeCache.get(name);
    if (!value) { value = generators[name](count); shapeCache.set(name, value); }
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
  const render = () => {
    if (!renderer || !scene || !camera || !material || disposed || document.hidden) return;
    raf = requestAnimationFrame(render);
    const dt = Math.min(clock.getDelta(), 0.05);
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
      geometry.setAttribute('positionA', new THREE.BufferAttribute(getShape('sphere'), 3));
      geometry.setAttribute('positionB', new THREE.BufferAttribute(getShape('sphere'), 3));
      const seeds = new Float32Array(count), sizes = new Float32Array(count);
      for (let i = 0; i < count; i++) { seeds[i] = Math.random(); sizes[i] = 1.2 + Math.random() * 2.1; }
      geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
      geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
      material = new THREE.ShaderMaterial({
        vertexShader, fragmentShader, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uMorph: { value: 0 }, uTime: { value: 0 }, uEnergy: { value: 1 }, uBreath: { value: 1 }, uParallax: { value: 0 }, uOpacity: { value: 0.9 } },
      });
      points = new THREE.Points(geometry, material);
      scene.add(points);
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x26262b, 1);
      renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;';
      target.appendChild(renderer.domElement);
      this.resize();
      observer = new ResizeObserver(() => this.resize());
      observer.observe(target);
      window.addEventListener('pointermove', onPointer, { passive: true });
      document.addEventListener('visibilitychange', onVisibility);
      raf = requestAnimationFrame(render);
    },
    setMorph(from, to, t) {
      const mapChanged = installedMapVersion !== getMapSourceVersion() && (from === 'map' || to === 'map');
      if (from !== fromName || to !== toName || mapChanged) {
        if (mapChanged) shapeCache.delete('map');
        fromName = from; toName = to; installShapes(from, to); installedMapVersion = getMapSourceVersion();
      }
      targetMorph = reducedMotion ? 0 : THREE.MathUtils.clamp(t, 0, 1);
    },
    setEnergy(value) { energy = Number.isFinite(value) ? Math.max(0, value) : 1; },
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
