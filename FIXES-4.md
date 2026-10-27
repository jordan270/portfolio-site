# FIXES-4: detailed hero silhouette (change only what is listed)

assets/face.png was replaced with a more detailed bust: curly hair outline,
ears, jaw, neck, sloped shoulders. It is a two-part file:
- ALPHA = the shape mask (alpha > 0.5 is inside).
- R/G/B (all equal) = a DENSITY map from 0.32 to 1.0: eyes, brows, nose,
  mouth, chin shadow and collarbones are slightly sparser or denser, hair is a
  bit dimmer than skin, and the outline has a crisp rim.

Do this in the hero shape sampler (face.ts) and nothing else:
1. Sample points by rejection inside the mask with probability proportional to
   the R channel (density weight). Blue-noise (Poisson-disc) spacing, no grid.
   About 90,000 points. Keep the earlier hero rules: framing at 105% of the
   viewport height, head top at about 10%, bottom bleeding off the screen,
   centred, small z dome (about 0.12 of the height), particle size 1.0 to 1.9
   px, dim multiplier about 0.9, cursor glow, +-4 degree idle rotation.
2. Do not add any extra edge density in code. The rim is already in the map.
3. The cursor glow must still light up the features when the mouse passes over
   the face. Keep per-particle alpha following the density weight a little
   (alpha = base * (0.75 + 0.25 * weight)) so eyes and brows read on hover.
4. Screenshot the hero at 1440 and 390 px, look at it yourself, and confirm:
   curly hair outline, visible ears and jaw, a neck, sloped shoulders running
   off the bottom, and no grid pattern. Fix anything that does not match.
5. npx tsc --noEmit, then commit as "hero: detailed silhouette". Do not stage
   private/.
