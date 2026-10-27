# FIXES-5: new hero image (bigger head, looking up). Change only what is listed.

assets/face.png was replaced. It is now 1600 x 1500 (it was 1200 x 1500): a
wider canvas so the shoulder slope runs into the bottom corners and there are
NO vertical side edges. Same format as before: ALPHA is the mask (alpha > 0.5
is inside), R/G/B (all equal) is the density weight from 0.3 to 1.0. Head is
about 13% larger relative to the body, chin lifted, tilted a few degrees.

This overrides the earlier "hero: move figure down" tweak. Replace the hero
framing in face.ts with:
1. Image height = 112% of the viewport height, width follows the aspect
   ratio (1600:1500). Image top at 6% of the viewport height (head top lands
   at about 10%). The bottom of the image is off-screen (about 118%), the
   bottom corners too, so no hard edge is visible.
2. Centre horizontally on the image centre (x = 50%).
3. Narrow screens (viewport aspect < 0.7): height 100% of the viewport, image
   top at 8%, so the head is not oversized.
4. Do not change particle count, brightness, size, glow, the density-weighted
   sampling, the hero text or anything else.
5. Screenshot the hero at 1440x900, 1280x720, 1024x768 and 390x844, look at
   them, and confirm: the head is clearly bigger, the chin looks lifted, the
   neck is visible, the shoulders run off the bottom with no straight vertical
   edge anywhere, and the hero text does not touch the head.
6. npx tsc --noEmit, commit as "hero: bigger head, looking up". Do not stage
   private/.
