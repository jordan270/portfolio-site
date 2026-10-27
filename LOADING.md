# LOADING.md: intro sequence and smooth transitions

RULES (strict):
- Work on a new git branch: `git checkout -b intro`. Do not touch master.
- Change only what this file lists. All existing slides, shapes, cards, the
  cursor glow, the comet and the contact slide must keep working exactly as
  they do now. A regression anywhere is a failure: fix it before committing.
- Look at your own screenshots before committing. Do not stage private/.

## 1. Instant boot loader (appears before the JS bundle loads)
In index.html add, with inline CSS and one tiny classic inline script (no
module, about 1 KB):
- html and body background #26262b inline, so there is never a white flash.
- <div id="boot" aria-hidden="true"> holding one <canvas>, position fixed,
  inset 0, z-index above everything, pointer-events none.
- The script draws scattered white dots over the whole screen: count =
  clamp(viewport area / 2600, 500, 1400) (about 450 in slow mode), size 1 to
  1.6 px, alpha 0.25 to 0.7, slow sine drift. DPR capped at 1.5. Trivial cost
  per frame.
- It exposes window.__boot = { fade(), progress(p) }. fade() fades the overlay
  out over 500 ms and removes it from the DOM.
- A 1 px progress line along the bottom edge of #boot (white, opacity 0.5),
  width follows real progress milestones: fonts ready 20%, engine ready 45%,
  hero shape ready 80%, assembled 100%. role="status" on a visually hidden
  "Loading" text.
- <noscript> shows the page normally (hide #boot, show main).
- body.is-loading hides <main> text until the intro finishes (visibility, not
  display), with a 6 s failsafe that always reveals it.

## 2. Intro timeline (new file src/ui/intro.ts)
Scattered dust first, then it assembles into the hero silhouette.
- While body.is-loading: scroll locked (lenis stopped, overflow hidden),
  comet and cursor glow disabled.
- When the engine is ready: show the existing dust shape scattered over the
  whole viewport (count by quality tier) and call __boot.fade() so the 2D dots
  cross-fade into the WebGL dust.
- When the hero shape data is ready AND at least 700 ms have passed since the
  engine started (so the scatter is actually seen): assemble. Duration 2.6 s
  normal, 1.6 s with reduced settings, 1.4 s slow mode. Global ease power3.inOut.
  Each particle has its own start delay (seed * 0.45 of the duration) and
  flies from its dust position to its hero position, with a curl-noise swirl
  that peaks mid-flight (amplitude about 0.25 units, off in slow mode) and a
  slight camera push-in (scale 1.06 to 1.0).
- After assembling: reveal the hero text (name, role, status) with a 0.12 s
  stagger, enable comet and glow, lenis.start(), remove body.is-loading, set
  sessionStorage.introSeen = '1'.
- Engine API additions: setIntro(p: number) where 0 is the scattered dust
  field and 1 is the hero formed (independent of scroll), and
  setMorphStyle({ stagger, swirl }). Scroll-driven morphing is ignored while
  the intro runs.

## 3. Slow-device path
Detect slow if any of: navigator.hardwareConcurrency <= 4, navigator.deviceMemory
<= 4 (when available), navigator.connection.saveData or effectiveType in
slow-2g, 2g, 3g, or the boot canvas averages more than 24 ms per frame during
its first 600 ms. Phones (coarse pointer and width <= 820) default to the
medium tier, and to low only if one of the other signals is true.
Slow mode: boot canvas about 450 dots at DPR 1; engine tier low (12k to 15k
particles); no swirl; stagger at most 0.25; assemble 1.4 s with power2.out; no
camera push; plain fades for text. It still ends in the same hero image, only
with fewer particles. The adaptive quality monitor keeps running afterwards.

## 4. Never block the main thread
- Build the hero shape first. Build every other shape lazily after the intro,
  in scroll order, with requestIdleCallback (fall back to setTimeout), in
  chunks that never block longer than about 12 ms, or in a Web Worker.
- If sampling the hero takes more than 150 ms, move it into a Web Worker or
  pre-bake it at build time into public/shapes/hero.bin (Int16 quantised) and
  fetch it. Store points in random order, so the first N points are a valid
  lower-tier subsample.
- If the user scrolls to a shape that is not ready, use dust as the target and
  cross-fade into the shape when it arrives.
- Use a PerformanceObserver for longtask and report the longest task between
  navigation start and unlock (target: under 50 ms on the normal path).

## 5. Smooth transitions between slides
a) Continuous progress. Add engine.setProgress(s), where s is a float section
   index (i + t). The engine damps s with a critically damped spring
   (frame-rate independent, about 0.12 s response), derives from, to and t
   internally, and when s jumps across several sections it passes through the
   intermediate shapes smoothly. Keep setMorph working for compatibility.
   Make sure there is no pop at a pair boundary (t = 1 of one pair is
   identical to t = 0 of the next).
b) Dwell. Map raw scroll progress between adjacent section anchors (the scroll
   position where a section's text block is centred) so the shape stays fully
   formed for the first and last 22% of each interval and morphs through the
   middle 56% using smootherstep (6t^5 - 15t^4 + 10t^3).
c) Text and cards in sync with the shape. Outgoing content fades to 0 and
   moves up 24 px over the first half of the morph zone; incoming content
   fades in and rises from +24 px over the second half (ScrollTrigger scrub on
   the same mapped progress). Project cards also scale 0.97 to 1 and shift
   about 16 px. Transforms and opacity only (no layout properties).
d) Lenis: lerp 0.09 (or duration 1.15 with an ease-out-expo), smoothWheel on,
   native touch inertia. Drive lenis.raf from gsap.ticker, set
   gsap.ticker.lagSmoothing(0), and call ScrollTrigger.update on lenis scroll.
   Keyboard and anchor navigation use lenis.scrollTo with a 1.2 s ease.
e) One animation clock: engine render, comet, glow and reveals all run from
   the GSAP ticker. The only other rAF loop allowed is the boot canvas before
   handover. Pause everything while the tab is hidden and clamp dt to 50 ms.

## 6. Motion tokens (consistency)
Define CSS variables: --ease-out: cubic-bezier(.22, 1, .36, 1);
--ease-in-out: cubic-bezier(.65, 0, .35, 1); --dur-s: 240ms; --dur-m: 500ms;
--dur-l: 900ms. Use them for every hover, focus, reveal and infinity-line
transition instead of ad-hoc values, with power3.out and power3.inOut as the
GSAP equivalents. No linear or default "ease" on UI motion (the infinity
line's travelling dash stays linear on purpose).

## 7. Safety and edge cases
- prefers-reduced-motion: no assemble flight and no scroll parallax. The boot
  cross-fades straight to the finished hero over 400 ms, and shapes switch with
  a 500 ms cross-fade.
- Failsafes: if anything throws or the intro takes longer than 6 s, jump to
  the final state (hero formed, text visible, scroll unlocked) and log why.
- If scrollY > 0 on load, or location.hash is present, skip the intro and
  render the current section immediately. Use history.scrollRestoration =
  'manual' only during the intro.
- Skip: the first pointerdown, keydown or wheel after 900 ms speeds the intro
  up (timeScale 4) so nobody is trapped.
- Second visit in the same session (sessionStorage.introSeen): use a 1.2 s
  assemble.
- The hero text must never stay hidden: the failsafe timer reveals it.

## 8. Dev switches and verification
Switches: ?intro=0 skips the intro, ?slow=1 forces the slow path, ?fast=1
forces the normal path, ?debug=1 shows a tiny overlay with the tier, FPS,
longest task and progress (dev builds only, stripped from production).
Write scripts/check-intro.mjs (playwright) that:
- takes screenshots at 0.3 s, 1.2 s, 2.4 s and 3.5 s on the normal path and at
  0.3 s, 1.0 s and 2.0 s with ?slow=1;
- confirms the first frame is dots scattered over the whole viewport (their
  bounding box covers more than 85% of the viewport width and height);
- confirms the last frame matches the settled hero screenshot (small mean
  absolute pixel difference);
- confirms scrollY stays 0 under wheel input during the intro and scrolling
  works afterwards;
- scrolls through every section with wheel input and, using a dev-only
  engine.debug.progress, asserts the damped progress changes by at most 0.08
  per frame and never reverses while scrolling down.
Run scripts/check-render.mjs as well. Run npx tsc --noEmit.

## 9. Commit
Commit on the `intro` branch as "intro sequence, smooth transitions". Report
the numbers (longest task, per-frame progress step, how long each phase took)
and tell me exactly how to test ?slow=1 and ?intro=0.
