# FIXES-2 (overrides earlier prompts on conflict)

## 1. Shapes must never go behind a card
Bug: the checkered flags are partly hidden behind the Sentiment Tracker card.
Fixed offsets are not enough. Replace setOffset with a proper frame:
- Engine: add setFrame(rect), rect = { x, y, w, h } in CSS pixels, the free
  area where the current shape must sit. The engine fits the shape's projected
  bounding box inside that rect (keep aspect, centre it, never exceed the
  rect) and interpolates between the two sections' rects with the morph t.
  Remove setOffset.
- UI: for each card section, rect = the viewport area between the card's outer
  edge plus a 3vw gap and the opposite viewport edge minus 4vw padding,
  vertically from 8vh to 92vh. Hero: the centre column. Contact: the upper 55%.
  Measure with getBoundingClientRect, cache, and refresh on resize, on
  ResizeObserver changes, and after fonts load.
- Narrow screens (<= 900 px): card full width in the lower 58% of the screen,
  shape rect in the upper 36%, scaled down.
- Verify: at 1440x900, 1280x720, 1024x768 and 390x844, project each shape's
  points to the screen and fail scripts/check-render.mjs if any point lies
  inside its card's rectangle, or outside the viewport (except the hero's
  intentional bottom crop). Screenshot every card slide and look at them.

## 2. Hero figure: it looks like a dotted grid and does not fit
Evidence: the head is a regular LATTICE of dots (visible rows and columns),
very dim, the shoulders trail off as a thin diagonal line, and the figure is
not centred. Target: a soft, dim but clearly filled silhouette of fine random
dust, shoulders wide and running off the bottom edge of the screen.
a) Sampling: no grid. Use blue-noise (Poisson-disc) sampling inside the person
   mask with full random jitter, plus a random size 1.0 to 1.9 device px and
   random alpha. About 90,000 points. Verify no lattice is visible (compare
   the nearest-neighbour distance spread; it must be irregular).
b) Body: do not fade the bottom edge. The body runs off the bottom of the
   viewport like a cropped bust. If the mask touches the photo's bottom edge,
   treat the bottom as cropped. If the shoulders in the photo are narrower
   than about 1.8x the head width or cut off asymmetrically, synthesise
   smooth, symmetric shoulders: a curve from the neck widening to about 2.4x
   head width, filled at the same density, blended into the real mask so there
   is no visible seam.
c) Brightness: at rest the hero should read about as bright as the figure in
   a soft-silhouette portfolio (median particle alpha around 0.5 after the
   global dim). Give the face shape its own dim multiplier (about 0.9 relative
   to the global one) so it is not as dark as the other shapes.
d) Position: centre the figure horizontally on the neck midline (not on the
   full body bounds). Head top at about 10% of the viewport height, shoulders
   running off the bottom. Use setFrame for this.
e) Keep depth subtle (z range about 0.15 of height), the frontal idle
   rotation (+-4 degrees) and the cursor glow.
f) Rebuild public/shapes/face.bin, write debug/face-preview.png, and look at
   the hero screenshots at 1440 and 390 px yourself before committing.

## 3. Cards
assets/projects/f1-sentiment.webp was replaced with a new image. Keep the
CONCEPT VISUAL tag on f1-sentiment and f1-analyzer.

## 4. Verify and commit
Run scripts/check-render.mjs and npx tsc --noEmit. Commit as "frame fit, hero
dust silhouette". Do not stage private/. Report the numbers you checked.
