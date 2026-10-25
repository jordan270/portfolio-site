# CHANGE: project cards, no India map (overrides earlier prompts on conflict)

## 1. Remove
- india.ts, the 'india' entry in ShapeName, the "location" slide, and any
  dependency on assets/india.svg. There is NO "Based in India" slide.
- Add one small dim line "Noida, India" under the role line in the hero, and
  keep "Noida, India" in the contact footer. No phone number, no age, ever.

## 2. New structure (update SPEC.md first)
1. hero (shape: face), text left, as already built.
2. work: a small label "SELECTED WORK (04)" at the top left of the section,
   then four project cards, each its own scroll step (about 110vh):
   - autopilot (shape: tower), card on the left
   - rhetoriclens (shape: lens), card on the right
   - f1-sentiment (shape: bubble), card on the left
   - f1-analyzer (shape: f1), card on the right
3. contact (shape: dust, particles in the background) with the clean SVG
   infinity line, as already built. Keep it unchanged.
ShapeName = 'face'|'tower'|'lens'|'bubble'|'f1'|'dust'.
Shape sequence: face -> tower -> lens -> bubble -> f1 -> dust.
The shape sits on the opposite side from the card (setOffset), filling about
80% of the viewport height, so a card never hides its shape. Particles stay
in the background across the whole page, below the cards in z-order.

## 3. Card design (large preview, title left under it, year right)
- Desktop width: min(60vw, 58rem), alternating sides as listed above.
  Mobile (<=768px): full width minus 6vw padding, card in the lower 60% of
  the screen, shape in the upper area, scaled down.
- Preview media: 16:9, border-radius 14px, 1px border rgba(255,255,255,0.14),
  soft shadow, object-fit cover, lazy loaded. For cards with public links, the
  whole preview is a link (target _blank, rel noopener) to the card's first
  link. AutoPilot's preview is a static panel.
- Preview source: look in assets/projects/ for the first file named
  <slug>.(mp4|webm|png|jpg|jpeg|webp) where slug is one of autopilot,
  rhetoriclens, f1-sentiment, f1-analyzer (use import.meta.glob). Video:
  muted, loop, playsinline, autoplay only while the card is on screen and
  never under prefers-reduced-motion (then show the first frame / poster).
- Fallback when no file exists: render a clean typographic preview in code
  (no image file): dark panel #17171b, project title in large light type,
  tags below in small uppercase tracking, and the one key fact where it
  exists ("Top 5 overall" for AutoPilot). Do NOT invent logs, output, or UI.
  Log a console hint naming the missing file.
- Below the media, one row: title left (clamp(1.25rem, 2vw, 1.75rem), weight
  400), year right (dim, 1rem). Then one dim description line (max 2 lines),
  small uppercase tags, and the card link row.
- Hover (fine pointers): linked-card media scales to 1.02 over 400ms and the
  title brightens. AutoPilot uses a default cursor and has no preview hover
  effect or focusable element. Its link row says "Code not public". Visible
  focus-visible outline on every link. Whole card reveals as one block (fade +
  24px rise), never per-line splitting.

## 4. Card copy (verbatim; years are 2026 for now)
- autopilot: title "AutoPilot"; label "NSUT Hackathon / Top 5 overall";
  text "A rule-based tower-defence agent in pure Python, scoring 357.78 across
  four public test cases."; tags "Python"; access "Code not public" (no link)
- rhetoriclens: title "RhetoricLens"; label "JAI 2026 Hackathon";
  text "A team-built web app that analyses arguments for logical fallacies. I
  worked on UI consistency and low-end device performance."; tags "Python,
  FastAPI, HTML/CSS/JS"; link https://github.com/Adhyan0112/Rhetoric-lenss
- f1-sentiment: title "F1 Race Sentiment Tracker"; label "Formula 1";
  text "Scores fan reactions to F1 races with a pre-trained HuggingFace model,
  and documents where it fails on sarcasm."; tags "Python, HuggingFace,
  uv"; link https://github.com/jordan270/projects
- f1-analyzer: title "F1 Race Analyzer"; label "Harvard CS50P final project";
  text "Pulls live race data from the Jolpica API, with fastest laps and
  pit-stop strategies, covered by pytest."; tags "Python, REST APIs,
  pytest"; link https://github.com/jordan270

## 5. Verify
Extend scripts/check-render.mjs: screenshot every section at 1440, 1024, 768
and 390 px. Fail on horizontal overflow, console errors, text clipped at the
viewport edge, or a card covering more than 10% of its shape's on-screen
area. Look at the screenshots yourself and fix problems before committing.
Run npx tsc --noEmit. Commit as "project cards, remove india". Report which
card previews used fallbacks.
