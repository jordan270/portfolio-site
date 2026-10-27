# FIXES (overrides earlier prompts on conflict, including PROJECT-CARDS.md section 1)

## 0. Bring the India map back (PROJECT-CARDS.md section 1 is CANCELLED)
The India map and its slide STAY. Final order, text sides alternate:
1. hero      (face,   text left)
2. location  (india,  text right)
3. autopilot (tower,  card left)    4. lens (lens, card right)
5. sentiment (bubble, card left)    6. analyzer (f1, card right)
7. contact   (dust background + the SVG infinity line, as already built)
ShapeName = 'face'|'india'|'tower'|'lens'|'bubble'|'f1'|'dust'.
Project cards from PROJECT-CARDS.md sections 2 to 5 stay as written.

A real outline now exists at assets/india.svg (one white filled path, official
extent incl. Ladakh and Kashmir). Use it as is. Never redraw or replace it.
- Location slide copy: label "LOCATION"; title "Based in India."; text
  "Noida, in the Delhi NCR." No phone number, no address, no age.
- On the india shape: denser outline than interior, small z jitter (+-0.02),
  a bright cluster near Delhi NCR plus a slow pulsing ring (low opacity),
  active only while india dominates. Mapping from lon/lat to the SVG path
  coordinates (path units, before the viewBox offset of -20):
  x = (lon - 68.1006) * 55.63 ; y = (37.0770 - lat) * 60.
  Delhi (77.2 E, 28.6 N) is about x=506, y=509.

## 1. Hero text has a forced line break ("live APIs," alone on a line)
Find the cause (grep for <br>, white-space: pre / pre-line / pre-wrap, "\n"
in the copy strings, and any line-splitting helper in src/ui/reveal.ts or
anywhere else) and remove it for EVERY text block on the page. Paragraphs
must be a single text node that wraps naturally: text-wrap: pretty on
paragraphs, balance on titles and the hero role line, no <br>, no per-line
spans, no fixed widths. Hero text column max-width min(32rem, 46vw). After
fixing, screenshot every section at 1440, 1024, 768 and 390 px, look at them
yourself, and fix any stray single-word lines and any clipping.

## 2. Hero hologram is still the OLD result and far too small
Evidence: face interior nearly empty, hoodie print densest, hard rectangular
bottom edge, head only about 40% of the viewport height. Rebuild it
(scripts/build-face.mjs, photo is private/face.jpg; also accept .jpeg/.png,
print which file was used):
a) Split the person mask into FACE (face oval via MediaPipe Face Landmarker,
   fall back to the head region), HAIR (rest of the head) and BODY (below the
   chin). Allocate about 45,000 points: 45% face, 20% hair/outline, 35% body.
b) Face: uniform base density so cheeks, forehead and nose bridge are visibly
   filled, plus extra density on eyes, brows, glasses, nose, nostrils, lips
   from edge strength. Equalise local contrast (CLAHE) first.
c) Body: gaussian blur (sigma about 6 px) BEFORE computing edge weights so
   print and fabric texture are suppressed; cap body per-pixel weight at 0.4x
   the face's. Keep the shoulder silhouette and hood strings.
d) Replace the hard crop with a soft elliptical vignette: density and alpha
   fade to zero over the last 25% of the figure's height and toward the sides.
e) Depth: Depth Anything V2 Small, smoothed, z range about 0.25 of height,
   nose and brow ridge visibly nearer than the cheeks.
f) Size: the hologram must fill about 80% of the viewport height on desktop
   (head and shoulders together), offset to the right half (setOffset).
g) Write public/shapes/face.bin and debug/face-preview.png, look at the
   preview and iterate until the face is clearly recognisable and the
   clothing is clearly quieter than the face.
Keep the scanlines, flicker, scan band and base ring, subtle.

## 3. Verify and commit
Update SPEC.md and scripts/check-render.mjs (all seven sections at the four
widths; fail on overflow, console errors, clipped text, or a card covering
more than 10% of its shape). Run npx tsc --noEmit. Commit as "fixes: india
back, text wrapping, hologram density and size". Report what you changed and
paste the final numbers.
