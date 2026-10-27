# OPTIMIZE.md: performance pass and loading gate

Builds on LOADING.md. Where they conflict, this file wins.

RULES (strict):
- Create a new branch from the current one: `git checkout -b perf`. Do not
  touch master.
- No visual regressions. Every slide, shape, card, the glow, the comet, the
  infinity line and the intro must look the same (compare before/after
  screenshots; the pixel coverage of each shape may differ by at most 5%).
- Measure first, then optimise, and report before/after numbers for every
  change. Do not stage private/.

## 1. Baseline (do this before changing anything)
Write scripts/perf.mjs (playwright + CDP) that, on the production build
(npm run build, npm run preview), with CPU throttling 4x, records for the
normal path and ?slow=1:
- JS time per frame (performance.mark around engine update + render submit,
  report mean and p95), long tasks (count, longest), frames per second while
  scrolling through all slides with wheel input, and renderer.info (draw
  calls, points drawn, geometries, textures).
- Performance.getMetrics before and after 5 full scroll loops: JSHeapUsedSize,
  Nodes, JSEventListeners, plus the number of requestAnimationFrame callbacks
  per frame (wrap window.requestAnimationFrame to count).
Print a table. Keep it as the "before" column.

## 2. Loading screen gate (scatter first, assemble only when ready)
The scattered particles ARE the loading screen. They stay scattered and calm
until everything the assemble needs is ready, then assemble.
- While gating: scattered particles drift slowly using only a cheap sine drift
  in the vertex shader (no swirl, no stagger, no glow). A small label in the
  bottom-left, same label style as the rest of the site: "LOADING" and a live
  percentage in tabular numerals, plus the existing 1 px progress line. When
  100% is reached the label fades out over 300 ms, wait 200 ms, then assemble.
- Gate conditions (all must be true): engine chunk loaded and renderer
  created; document.fonts.ready; hero buffers built and uploaded to the GPU;
  shaders compiled (renderer.compile) and one invisible warm-up frame of the
  hero pair rendered so the first real frame has no hitch; quality
  calibration finished (see section 3). The second shape (india) may keep
  preparing in idle time and must not block the gate.
- Progress weights: engine and JS 25, fonts 10, hero data 25, shader warm-up
  15, calibration 15, final ramp 10. Real milestones only, no fake timers.
- Minimum time on the loading screen 900 ms, maximum 8 s (then proceed with
  the best tier available, log why).
- All heavy work (decoding, uploads, compilation, calibration) happens during
  the gate, so the assemble animation is pure GPU work.

## 3. Calibration before assembling
During the gate, render about 30 frames of the scatter at the chosen tier
and measure the average frame time. If it is above 22 ms, step down one tier
(and lower the DPR cap) and measure again, down to the low tier. Then keep
the adaptive monitor running with hysteresis: if p95 frame time stays above
28 ms for 2 s, drop one tier; never step back up automatically. Log the chosen
tier in dev mode.

## 4. Engine and GPU
- Particle budgets per tier: high 55,000, medium 30,000, low 12,000 (the hero
  is currently about 90,000). Compensate perceived density with point size
  x1.15 and alpha x1.1 on the high tier. Compare screenshots before and after
  and keep the look.
- WebGLRenderer: antialias false, depth false, stencil false, alpha false (set
  the clear colour to #26262b), powerPreference 'high-performance',
  preserveDrawingBuffer false. Points material: depthTest false, depthWrite
  false, additive blending. DPR cap 1.5 on high, 1.25 on medium, 1 on low.
- Buffers: interleave attributes and store positions as normalised Int16 (with
  a scale uniform) to halve memory and bandwidth. Keep only the current and
  next shape on the GPU: rotate three buffers (A, B, next) so a pair change is
  a reference swap, not an upload, and upload the next shape in idle time
  before it is needed.
- Vertex shader: skip swirl and noise when the morph is idle (uniform flag
  with a branch; the branch is coherent, so it is cheap). Skip the glow loop
  unless the pointer was active in the last 1.5 s. Reduce the glow trail to
  4 points. Use mediump where precision allows. No per-frame allocation, and
  update uniforms only when the value changed.
- Render on demand: when there is no scroll for 400 ms, no pointer movement
  for 1.5 s, and no intro or morph running, render at 30 fps (the idle drift
  is slow). Render nothing while the tab is hidden. Resume at full rate on any
  input.
- Remove any shape that is generated at startup but not needed yet. Build
  non-hero shapes lazily in idle time, in scroll order, in chunks under 12 ms
  or in a Worker. If a hero build takes more than 150 ms, bake it with a
  script into public/shapes/*.bin (Int16, points in random order so the first
  N are a valid subsample) and fetch it with a preload hint.

## 4b. Main thread and DOM
- No getBoundingClientRect or other layout reads inside scroll or ticker
  callbacks. Cache rects, refresh them on resize via ResizeObserver and after
  fonts load. Batch reads then writes. Use gsap.quickSetter for per-frame style
  updates and skip writes when the value did not change.
- Scroll-linked tweens only for sections near the viewport. Kill and rebuild
  ScrollTrigger instances on resize without leaking tweens.
- Replace the CSS or SVG filter glow (drop-shadow, blur) on the animated
  infinity stroke with a second, wider, low-opacity static stroke underneath.
  No filter on any element that animates every frame.
- Use contain: layout paint and content-visibility: auto (with
  contain-intrinsic-size) on the offscreen sections. will-change only on
  elements that are animating right now (add and remove it). Transform and
  opacity only for motion.
- Comet canvas: DPR cap 1.5, trail of 16 points drawn in as few strokes as
  possible, and stop the loop entirely when the pointer is idle and the trail
  has faded.
- Images: width and height attributes, decoding="async", loading="lazy" for
  every card banner except the first, and call img.decode() before the reveal.
  Each banner should stay under about 160 KB.

## 5. Leak hunt ("it gets slower over time")
Using the scroll loops from section 1, find and fix anything that grows:
event listeners added on every resize or section change, GSAP tweens or
ScrollTriggers not killed, textures or geometries not disposed, arrays that
only grow (glow or comet trails), several requestAnimationFrame loops running
at once (including after the boot canvas hands over), and shape generation
being repeated. Targets after 5 loops: heap growth under 10%, Nodes and
JSEventListeners unchanged, at most 2 rAF callbacks per frame, and
ScrollTrigger.getAll().length unchanged after 10 resizes.

## 6. Bundle
- Import only what is used from three (named imports, no `import * as THREE`).
  Vite manualChunks for vendor-three and vendor-gsap. Load the engine chunk
  with a dynamic import after the boot loader has painted. Preload the fonts
  and the hero data. Self-host a subset Inter (weights 300 and 400 only,
  woff2) with font-display: swap.
- Targets: boot loader first paint under 100 ms, initial JS under 250 KB
  gzip (report the Vite size table).

## 7. Verify and report
Re-run scripts/perf.mjs and print before and after side by side: JS time per
frame (mean, p95), long tasks, scroll FPS, draw calls and points, heap growth,
listeners, rAF count, bundle sizes. Re-run scripts/check-render.mjs and
scripts/check-intro.mjs. Take before and after screenshots of every slide and
look at them yourself. Run npx tsc --noEmit.

## 8. Commit
Commit on the `perf` branch as "performance pass and loading gate". Tell me
the chosen tier on this machine, exactly how to test with `npm run build` and
`npm run preview`, and anything you could not measure headlessly (GPU time
needs a real GPU; say so).
