# Particle engine

`createEngine(opts?)` mounts one additive particle cloud. `setMorph(from, to, t)` blends between shapes using stable per-particle seeds; `setEnergy`, `setQuality`, `resize`, and `dispose` control motion, adaptive particle count, viewport sizing, and cleanup. The exported `ShapeName` is exactly `'face' | 'tower' | 'lens' | 'f1' | 'dust'`. The engine accepts the old UI labels as temporary aliases (`sphere`→`face`, `map`→`tower`, `helix`→`lens`, `galaxy`→`dust`) so existing callers keep working without changing UI-owned files.

## Shapes

- `tower`: cylindrical castle tower with eight separated merlons, a sparse doorway/window mask, and two ground rings.
- `lens`: thin torus, sparse glass, upper-left highlight arc, and a 45° handle.
- `f1`: samples the alpha silhouette from `/assets/f1.svg` using an offscreen canvas. If that file is absent or invalid, it warns and uses a built-in racing-mark placeholder.
- `dust`: wide, flat field with low-frequency density variation.
- `face`: samples `public/shapes/face.bin`. Until the baked points load, or if the file is missing, it warns and uses dust. Scanlines, mild flicker, and a slow horizontal highlight band are weighted by the face morph value and fade out across adjacent transitions.

All shape arrays have one point per particle. Their sample order is driven by the geometry's persistent `aSeed` values, so a particle keeps its identity as it moves between distributions.

## Bake a face

Put a clear, front-facing photo at `private/face.jpg`. That directory is ignored by Git. Install the optional MediaPipe package without changing the project manifest, then run the builder:

```sh
npm install --no-save --package-lock=false @mediapipe/tasks-vision
node scripts/build-face.mjs
```

The script downloads the Face Landmarker model to the OS temporary directory, detects 3D landmarks, triangulates the face oval plus a fading neck extension, and samples 40,000 barycentric points weighted by image darkness and edge strength. It writes packed XYZ `Float32Array` values to `public/shapes/face.bin`. Keep the source photo private; only the generated binary belongs in the site.

## Quality and appearance

Auto quality starts at 60,000 particles (30,000 on mobile or lower-memory/CPU devices), steps down to 30,000 and 12,000 after average frame time exceeds 24ms, and steps up after sustained fast frames. Call `setQuality('high' | 'medium' | 'low' | 'auto')` to select a mode; `{ count }` pins a custom count. DPR is capped at 2 and hidden tabs pause rendering.

Point size uses `4.5 / viewDepth`, DPR scaling, and hard clamps: normal dots 1–3 device pixels, with 3% of particles allowed up to 5px. Per-particle alpha is capped at 0.5. The fragment shader clips to a circle and applies a soft falloff. The renderer clears to `#26262b`.

Open `/src/engine/demo.html` through Vite to step through all five shapes and tune size/alpha. Run `node scripts/check-render.mjs` to capture demo frames for every shape, check main-page frames, pixel coverage/saturation, animation delta, and browser errors. Render artifacts are saved under ignored `debug/`.
