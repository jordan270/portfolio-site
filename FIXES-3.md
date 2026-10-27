# FIXES-3 (overrides earlier prompts on conflict)

RULE: change ONLY what is listed here. The contact slide, India, lens, Python
shape, flags, cards, comet and glow were fine and must keep working. Do not
refactor anything else.

## 0. Recover what a revert removed
The card banners disappeared after a revert. Run git log, find the commits
named like "card banners, python shape" and "frame fit, hero dust silhouette",
and check with git show which files each one touched. Make sure these are
present and working again: assets/projects/{autopilot,rhetoriclens,
f1-sentiment,f1-analyzer}.webp are used as the card previews (loader finds
.webp), the CONCEPT VISUAL tag on f1-sentiment and f1-analyzer, the AutoPilot
card with no link and "Code not public", and the python shape (assets/python.svg).
Restore only the missing pieces (git checkout <hash> -- <path>) without
undoing anything else.

## 1. Hero from assets/face.png (a head-and-shoulders silhouette, already made)
Stop using the photo, the depth map and scripts/build-face.mjs for the hero.
Sample the hero from assets/face.png exactly like flags.png and india.svg:
alpha > 0.5 is inside, centre on the neck line (x = 50% of the image).
- About 90,000 points, blue-noise (Poisson-disc) sampling with random jitter,
  NO regular grid or lattice. Particle size 1.0 to 1.9 device px, random
  alpha. About 8% of points in a thin band along the outline so the hair and
  shoulder edge read crisply.
- Volume: z = a smooth dome from the distance to the mask edge (z range about
  0.12 of the figure's height) so it feels rounded, not flat.
- Framing: figure height = 105% of the viewport height, head top at about
  10% of the viewport height, bottom bleeding off the screen, centred
  horizontally. NO rectangle fitting for the hero. No hologram effects, no
  fade at the bottom.
- Brightness: give the face shape a dim multiplier about 0.9 of the global
  one so it reads like a soft, dim, evenly filled silhouette. Keep the cursor
  glow and a frontal idle rotation (+-4 degrees).
- Remove the face.bin loading and the depth-map code paths. Keep face.ts small.

## 2. Hero text must not be clipped
Name on the left and role on the right, both at the vertical centre, padding
4.5vw on both sides. The name "Garv Kapoor" must never touch or pass the left
edge (it is currently cut off). Text stays in the side margins and may wrap
inside max-width 22vw if the viewport is narrow. Verify at 1440, 1280, 1024
and 390 px.

## 3. Contact slide: put the scattered dust back
Before the "frame fit" commit the contact slide showed fine particles
scattered over the whole screen behind the infinity line. Now the dust is
squashed into two white bars. Restore the previous behaviour (compare with
git diff of that commit for dust.ts and the frame code): dust must fill the
whole viewport, spread widely, dim, drifting, with no rectangle fitting.
Rectangle fitting applies ONLY to the four project-card shapes (python, lens,
flags, f1).

## 4. Card shapes: never behind a card
In the Sentiment Tracker slide the flags are partly behind the card. For the
card sections only: compute the free area beside the card (card outer edge
plus 3vw gap to the opposite viewport edge minus 4vw padding, vertically 8vh
to 92vh), scale the shape down to fit inside it if needed, and centre it
there. At 900 px width or less: card in the lower 58%, shape in the upper 36%.
Verify at 1440x900, 1280x720, 1024x768 and 390x844 that no shape point lies
inside a card rectangle.

## 5. Verify and commit
Screenshot and look at: hero (1440 and 390), contact (1440), and all four card
slides (1440). Run scripts/check-render.mjs and npx tsc --noEmit. Commit as
"hero from face.png, restore banners and dust". Do not stage private/. Report
what you restored.
