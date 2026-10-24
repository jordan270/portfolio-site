# Particle engine

`createEngine(opts?)` creates an engine; call `mount(container)` once to append its renderer canvas. The public interface is `mount`, `setMorph(from, to, t)`, `setEnergy(value)`, `resize`, and `dispose`. `setMorph` clamps `t` to 0–1, replaces shape buffers only when the requested pair changes, and eases the uniform toward the latest value on render frames. `setEnergy` scales idle rotation and breathing. `resize` updates the camera and renderer; a `ResizeObserver` also calls it automatically. `dispose` stops rendering, removes listeners and its canvas, and releases GPU buffers.

The default count is 60,000, or 20,000 when the viewport is at most 700px wide. Pass `{ count }` to choose a different count. DPR is capped at 2. Rendering pauses while the document is hidden. With `prefers-reduced-motion: reduce`, transition, rotation, breathing, and noise are disabled and the source shape stays visible.

The engine uses one `THREE.Points` object and a custom shader. Position A/B, seed, and size are geometry attributes; morphing and transition displacement happen in the vertex shader. The fragment shader creates soft white additive sprites, varies opacity by seed, and brightens the sphere silhouette. The renderer clears to `#26262b`.

## Tuning the look

- In `index.ts`, adjust `uOpacity`, the `aSize` range, and `gl_PointSize` for density and apparent particle size.
- Change the alpha smoothstep in the fragment shader to sharpen or soften each sprite; adjust its `variation` range for opacity contrast.
- The vertex shader's `0.16` delay spread and `0.018` displacement set the transition character. `uBreath` and the rotation increment control idle motion.
- In each shape file, adjust its unit-scale geometry and sampling proportions. Shape generators return `count` XYZ triplets.
- `setMapSource(svgPathOrImageUrl)` is exported from `shapes/map.ts`. It accepts SVG path data in a 0–100 coordinate view or an image URL; after it resolves, future generated map buffers sample that mask. The default placeholder is a rounded blob.

Open `demo.html` through Vite (for example `/src/engine/demo.html`) to step through the four shapes with the slider.
