# FINAL.md: finish the portfolio

Work on branch `perf`. Rules for EVERY part:
- Change ONLY what is listed. Do not stage `private/` or `debug/`.
- Run `npx tsc --noEmit` and `npm run build` after each part. If either fails, fix it before moving on.
- If something regresses, restore only the affected files from history (`git restore --source=<commit> -- <path>`). Do NOT use `git revert`.
- Look at your own Playwright screenshots before every commit. Test with `npm run build` then `npm run preview`, never the dev server.
- Do not change: the face silhouette, card shapes, India shape, comet, tier budgets (55k/30k/12k), the design tokens, or any text content, except where a part says so.
- Never show a phone number or an age anywhere. Teammates are credited only as "built with a team".
- Keep the small "CONCEPT VISUAL" tag on the Sentiment Tracker and Race Analyzer card images.

Read this whole file, list the numbered parts in one line each, then implement them in order, one commit per part.

---

## PART 1: Loader shapes (fix the rectangles)

Problem from my frames: the intro shows hard-edged RECTANGLES. (a) The scatter shrinks to the center as a rectangle. (b) The burst-to-haze phase is a rectangular patch. (c) The gather phase is a hard-edged vertical strip. Also the ring tail fade is too weak, no ambient dust remains around the final face, and the bottom half of the cluster is dimmer than the top.

1. Scatter, haze and column positions must NEVER come from a rectangle that gets scaled. Sample them from round, soft-edged distributions:
   - Scatter: ellipse or disc with radial density, extending past the viewport corners (radius at least 0.75x the viewport diagonal). No straight edge or corner may ever be visible.
   - Converge to the ring: each particle gets its own delay and speed (random plus distance-based jitter, about +/-30 percent) and a swirl angle that grows as it nears the center. The envelope must be a ragged round cloud shrinking, not a box.
   - Burst: each particle moves radially outward with its own random speed and distance (r = R * rand^0.5), ending as a full-screen haze that extends beyond the viewport. No bounding box at any moment.
   - Column: drop it (haze gathers straight into the face, center-out stagger), or make it a soft gaussian column (sigma about 2.5 percent of viewport width, noisy tapered ends, per-particle alpha falloff). No sharp edges.
2. Remove any vertical alpha/size gradient left in the cluster and ring phases.
3. Ring: 10 to 12 dots, head about 1.0 in size and alpha, tail about 0.15 (clearly visible taper over about 8 dots), radius about 4.5vmin (about 40 px at 1440x900) and constant while spinning, 1.1 s per turn, clockwise, no number or text.
4. Ambient dust: 15 to 20 percent of particles stay as dim, tiny, uneven dust around the final face with a stable seed and very slow drift. Never dense behind the hero text.
5. Hero text: BOTH blocks must appear ("Garv Kapoor" + "Open to internships" on the left, "AI/ML engineer in training." + "Noida, India" on the right). The right block comes 0.3 s after the left. Whole-block fade + rise only.
6. Sequence reminder: faint stars fade in, drift toward the center and tighten, settle into the ring, spin until assets are loaded and the tier is chosen (minimum about 900 ms), then ring collapses (0.3 s), bursts to haze (0.5 s), gathers (0.5 s), resolves into the face (0.5 s). Unlock Lenis only after the last text block. Reduced motion: static ring then a 0.6 s crossfade. Never spin forever: after 8 s assemble anyway.

Verify: capture frames every 0.25 s from 0 to 8 s, plus 4 consecutive frames 0.1 s apart during the ring phase. No frame may show a straight edge or rectangular silhouette. Save `debug/loader-frames.png` (contact sheet).
Commit: `fix: round soft loader phases, ring tail, ambient dust`

## PART 2: Contact slide = starry sky

Only the 'dust' shape in its contact use. If the commit "tune: visible india at rest, denser space-like contact dust" exists, build on it and raise it further.

- Stars clearly visible at rest, no hover needed. About 2.5x the current point count (reuse the existing budget, do not raise the total).
- Distribution like a night sky: about 80 percent tiny faint points (alpha 0.25 to 0.45), about 15 percent medium (alpha 0.5 to 0.7), about 5 percent bright stars (alpha 0.85 to 1.0, size 2 to 3x, soft glow halo). Stable per-particle seed, no flicker.
- Positions: uneven low-frequency-noise clusters with a few denser patches and empty gaps, plus a faint milky-way band tilted about 15 to 20 degrees, plus scattered stars everywhere. Full viewport coverage including corners. No grid, no rectangle, no straight edges.
- Subtle twinkle: about 10 percent of stars, period 3 to 7 s, amplitude about 0.25, random phase. Off under prefers-reduced-motion.
- Stars thinner and dimmer (about 0.4x) in a soft ellipse behind the text block and the infinity line so text and links stay readable. Infinity line, text and links unchanged. Cursor glow still works on top.

Verify: screenshots at 1440x900 with NO mouse movement, and 390x844. Save `debug/contact-desktop.png`, `debug/contact-mobile.png`.
Commit: `feat: starry contact slide`

## PART 3: Cleanup and flags check

1. Delete the Vite starter leftovers: `src/assets/hero.png`, `src/assets/typescript.svg`, `src/assets/vite.svg`, `src/counter.ts`. First grep that nothing imports them. If something does, remove only that import. Remove `src/assets/` if empty.
2. Flags slide: screenshot it and check that the flag poles are aligned (one z-plane, uniform sampling, limited rotation). Change code ONLY if they are visibly misaligned. Report what you found either way.
3. Make sure the Race Analyzer card repo link is defined in ONE named constant (currently falls back to github.com/jordan270) so I can change it in a single place.
4. Grep the whole repo (src, index.html, public, assets) for phone-number patterns, "age", and "Adhyan" credits. Confirm the only teammate link is the RhetoricLens repo URL. Report findings.

Commit: `chore: remove vite leftovers, verify flags, privacy grep`

## PART 4: Page head, favicon, SEO

1. `index.html`: `<html lang="en">`, title `Garv Kapoor | AI/ML engineer in training`, meta description (max 160 chars): `Portfolio of Garv Kapoor, a self-taught Python developer from Noida, India, looking for an AI/ML internship. Hackathon agents, a debate analyzer and F1 data projects.` Also `theme-color` #26262b and `color-scheme` dark.
2. Favicon: create `public/favicon.svg`, 64x64, `#26262b` rounded square (rx 14) with 8 white circles on a ring of radius 20 around (32,32), at angles 0, 45, ... 315 degrees clockwise from the top. Radii from 4.5 (top) down to 1.2 and opacity 1.0 down to 0.2 counter-clockwise, like the loader ring. Link it with `<link rel="icon" type="image/svg+xml">`. Also add `public/apple-touch-icon.png` (180x180, same design) generated with Playwright or sharp.
3. Open Graph + Twitter: og:title, og:description, og:type website, twitter:card summary_large_image, og:image `/og.png`. Generate `public/og.png` at 1200x630 by screenshotting the finished hero (face + name) with Playwright. Use `%VITE_SITE_URL%` in og:url and the absolute og:image URL, and create `.env.production` with `VITE_SITE_URL=https://REPLACE-ME.vercel.app` (I will change it after deploy).
4. `<noscript>` fallback: my name, "AI/ML engineer in training", one line, and the four links (email, GitHub, LinkedIn, Kaggle). No phone, no age.
5. Accessibility basics: real `<h1>` for my name, visible focus ring on links and buttons (white, 2 px outline offset), `alt` text on card images, `aria-hidden` on the decorative canvas, `rel="noopener noreferrer"` on all `target="_blank"` links.

Commit: `feat: head, favicon, og image, noscript, a11y basics`

## PART 5: Responsive and performance sweep

1. With Playwright capture every slide at 1920x1080, 1366x768, 768x1024 and 390x844 into `debug/sweep/`. Check and fix ONLY real defects: horizontal overflow (`document.documentElement.scrollWidth <= innerWidth`), text outside the bottom third on mobile, a shape sitting behind a card, text overlapping the figure, unreadable text over bright particles.
2. Mobile: no comet, touch scroll smooth, tier chosen by calibration (expect 'medium' or 'low'), loader still completes.
3. Run `npm run build`, then report gzip sizes of `dist/` assets and the Playwright perf script result (scripts/perf.mjs): average frame time on each tier and whether memory grows over a 60 s scroll loop. If frame time or memory is clearly bad, report it and do NOT start a big rewrite.

Commit: `fix: responsive sweep` (only if something was fixed)

## PART 6: Merge and deploy prep

1. Print `git branch -a` and `git log --oneline --graph --all -20`. Check whether the commits of branch `intro` are already contained in `perf` (`git branch --contains`).
2. Confirm `git ls-files private debug` prints nothing and `.gitignore` lists `private/` and `debug/`.
3. Only if all of the following hold: tsc passes, build passes, Parts 1 to 5 screenshots look right, working tree clean, and master can fast-forward to perf: `git switch master` then `git merge --ff-only perf`. If a fast-forward is not possible, STOP and show me the graph. Do not force, rebase or revert anything.
4. Add a short `README.md`: what the site is, `npm install`, `npm run dev`, `npm run build`, `npm run preview`, where assets live, and that `private/` is never committed.
5. Print the exact PowerShell commands (one per code block, no `&&`) for me to: create a new GitHub repo, add the remote, push master, then the Vercel steps (Import Git Repository, Framework Preset Vite, Build Command `npm run build`, Output Directory `dist`, add env var VITE_SITE_URL).

Commit: `docs: readme and deploy notes`

## PART 7: Final report (plain text, no commit)

Give me a short checklist: what is done, what you could NOT verify (motion, real phone, timing), and what I still have to do by hand. Mention at least: F1 logo shape still "FI" (needs my logo file), real screenshots for Sentiment Tracker and Race Analyzer (concept tag stays), Race Analyzer repo URL constant, VITE_SITE_URL after deploy, real phone test.
