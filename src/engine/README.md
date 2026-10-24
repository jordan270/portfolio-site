# Particle engine

`createEngine(opts?)` creates an engine; call `mount(container)` once to append its renderer canvas. The public interface is `mount`, `setMorph(from, to, t)`, `setEnergy(value)`, `resize`, and `dispose`. `setMorph` clamps `t` to 0–1, replaces shape buffers only when the requested pair changes, and eases the uniform toward the latest value on render frames. `setEnergy` scales idle rotation and breathing. `resize` updates the camera and renderer; a `ResizeObserver` also calls it automatically. `dispose` stops rendering, removes listeners and its canvas, and releases GPU buffers.

The default quality is `auto`: it starts at 60,000 particles, or 30,000 when the viewport is at most 700px wide. Auto mode steps down after sustained frame times above 24ms and can step back up after sustained fast frames. Call `setQuality('high' | 'medium' | 'low' | 'auto')` to choose 60,000, 30,000, 12,000, or adaptive quality. Pass `{ count }` to pin a custom count and disable adaptive resizing. DPR is capped at 2. Rendering pauses while the document is hidden. With `prefers-reduced-motion: reduce`, transition, rotation, breathing, and noise are disabled and the source shape stays visible.

The engine uses one `THREE.Points` object and a custom shader. Position A/B, seed, and size are geometry attributes; morphing and transition displacement happen in the vertex shader. Point size is depth attenuated, DPR scaled, and clamped to 1–5 device pixels; 3% of particles use the larger sparkle range. The fragment shader clips soft white additive sprites to a circle, keeps alpha capped at 0.7, varies opacity by seed, and brightens the sphere silhouette. The renderer clears to `#26262b`.

## Tuning the look

- In `index.ts`, adjust the `aSize` range and `uOpacity` for density and apparent particle size. The demo's size and alpha sliders change `uSizeScale` and `uAlphaScale` live.
- Change the alpha smoothstep in the fragment shader to sharpen or soften each sprite; adjust its `variation` range for opacity contrast.
- The vertex shader's `0.16` delay spread and `0.018` displacement set the transition character. `uBreath` and the rotation increment control idle motion.
- In each shape file, adjust its unit-scale geometry and sampling proportions. Shape generators return `count` XYZ triplets.
- `setMapSource(svgPathOrImageUrl)` is exported from `shapes/map.ts`. It accepts SVG path data in a 0–100 coordinate view or an image URL; after it resolves, future generated map buffers sample that mask. The default placeholder is a rounded blob.

Open `demo.html` through Vite (for example `/src/engine/demo.html`) to step through the four shapes with the slider.
