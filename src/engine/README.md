# Particle engine

`createEngine(opts?)` mounts one additive particle cloud. `setMorph(from, to, t)` blends between shapes using stable per-particle seeds; `setEnergy`, `setQuality`, `resize`, and `dispose` control motion, adaptive particle count, viewport sizing, and cleanup. The exported `ShapeName` is exactly `'face' | 'india' | 'tower' | 'lens' | 'flags' | 'f1' | 'dust'`. The engine accepts the old UI labels as temporary aliases (`sphere`→`face`, `map`→`india`, `helix`→`lens`, `galaxy`→`dust`) so existing callers keep working without changing UI-owned files.

## Shapes

- `flags`: samples only alpha-opaque pixels from `assets/flags.png`, weighting flag edges and poles so the crossed checker pattern stays legible.

- `india`: samples the supplied `assets/india.svg` mask, emphasizing the outline and a small Delhi NCR particle cluster. If the asset is absent it warns and uses dust. The outline is scaled to about 75% of desktop viewport height.
- `lens`: thin torus, sparse glass, upper-left highlight arc, and a 45° handle.
- `f1`: samples `/assets/f1.svg` first when present, then `/assets/f1.png`. PNG sampling uses alpha when meaningful, or detects foreground against the averaged corner colour, closes small holes, and retains the main logo components.
- `dust`: sparse, wide background field that fills the viewport, drifts slowly,
  and dims to 60% alpha when it is the target shape.
- `face`: samples the photo-derived `public/shapes/face.bin`. If the binary is absent it warns and uses dust. Scanlines, faint flicker, a slow vertical highlight band, and a faint base ring are weighted by the face morph value and fade out across adjacent transitions.

All shape arrays have one point per particle. Their sample order is driven by the geometry's persistent `aSeed` values, so a particle keeps its identity as it moves between distributions.

## Bake a face

Put a clear, front-facing photo at `private/face.jpg`. That directory is ignored by Git. Install the local background-removal and depth packages without changing the project manifest, then run the builder:

```sh
npm install --no-save --package-lock=false @imgly/background-removal-node @huggingface/transformers
node scripts/build-face.mjs
```

The script downloads model weights on its first run, removes the photo background, estimates depth with Depth Anything V2 Small, and samples 45,000 pixels weighted by luminance contrast and edges. The smoothed depth map shapes the z values, with a fade across the shoulders and lower edge. It writes packed XYZ `Float32Array` values to `public/shapes/face.bin` and a front projection to `debug/face-preview.png`. You can pass a photo path as the first argument for a one-off build. Keep the source photo private; only the generated binary belongs in the site.

## Quality and appearance

Auto quality starts at 60,000 particles (30,000 on mobile or lower-memory/CPU devices), steps down to 30,000 and 12,000 after average frame time exceeds 24ms, and steps up after sustained fast frames. Call `setQuality('high' | 'medium' | 'low' | 'auto')` to select a mode; `{ count }` pins a custom count. DPR is capped at 2 and hidden tabs pause rendering.

Point size uses `4.5 / viewDepth`, DPR scaling, and hard clamps: normal dots 1–3 device pixels, with 3% of particles allowed up to 5px. Per-particle alpha is capped at 0.5. The fragment shader clips to a circle and applies a soft falloff. The renderer clears to `#26262b`.

The contact infinity is an inline SVG line drawn by `src/ui/infinity.ts`, not a
particle shape. Open `/src/engine/demo.html` through Vite to step through the
particle shapes and tune size/alpha. Run `node scripts/check-render.mjs` to
capture demo frames, check main-page layouts and contact animation, pixel
coverage/saturation, and browser errors. Render artifacts are saved under
ignored `debug/`.
