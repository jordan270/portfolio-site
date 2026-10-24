# SPEC: Particle Morph Portfolio

## Concept
A single-page scroll experience. One cloud of ~60,000 white particles
morphs between shapes as the user scrolls. Each shape matches the text
beside it. Monochrome, minimal, cinematic.

## Design tokens
- Background: #26262b
- Particles/text: white, opacity 0.35 to 1.0 (varied per particle)
- Font: Inter (weights 300/400), tight letter-spacing (-0.02em)
- Text size: clamp(1.25rem, 2.2vw, 2rem). Max 3 lines per block.
- One accent only: a glowing white comet that follows the cursor
  with eased motion and a tapering trail.
- No colors, no gradients, no UI chrome. Generous empty space.

## Sections (each is 100vh+ and has data-shape)
1. hero    data-shape="sphere"  text: placeholder name + role, centered
2. place   data-shape="map"     text: "Based in [Place]", left of shape
3. craft   data-shape="helix"   text: short paragraph, right-aligned
4. more    data-shape="galaxy"  text: "And still working on more.", left

## Folder ownership (DO NOT edit the other agent's folders)
- CODEX owns:       src/engine/**
- ANTIGRAVITY owns: index.html, src/style.css, src/ui/**, src/main.ts

Codex must not edit main.ts. It provides src/engine/demo.ts for isolated testing.

## The contract (public API of src/engine)

```ts
// src/engine/index.ts
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

export function createEngine(opts?: { count?: number }): ParticleEngine;
```

The UI side must only ever use this API. The engine must not touch the DOM
outside its own container.

## Performance
- 60fps on a mid laptop, count auto-reduced on mobile (e.g. 20k)
- DPR capped at 2, pause rendering when tab hidden
- Respect prefers-reduced-motion (static shape, no morph animation)
