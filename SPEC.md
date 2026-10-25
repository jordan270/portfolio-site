# SPEC: Garv Kapoor Portfolio (particle morph)

## Concept
One cloud of particles morphs between the story's shapes as the user scrolls.
The site is monochrome, minimal, and cinematic, and remains readable with the
particles switched off.

Flow: face -> india -> tower -> lens -> flags -> f1 -> dust

## Design tokens
- Background: #26262b
- Particles and text: white, opacity 0.35 to 1.0
- Font: Inter (weights 300/400), letter-spacing -0.02em
- Text size: clamp(1.25rem, 2.2vw, 2rem)
- Only accent: a small green dot (#21e065) beside "Open to internships"
- One glowing white comet follows the cursor with eased motion and a tapering
  trail (desktop only)
- No boxes, gradients, or UI chrome. Generous empty space.
- Respect prefers-reduced-motion everywhere.
- Paragraphs wrap naturally with `text-wrap: pretty`; titles and the hero role
  line use balanced wrapping. Reveal animation keeps each text block intact.

## Sections
Seven sections in this exact order, with alternating text sides:
1. hero      data-shape="face"      text left
2. location  data-shape="india"     text right
3. autopilot data-shape="tower"     text left
4. lens      data-shape="lens"      text right
5. sentiment data-shape="flags"     text left
6. analyzer  data-shape="f1"        text right
7. contact   data-shape="dust"     text centred, drawn infinity above text

Hero is 120vh, project sections are 110vh on desktop and 100vh on small
screens, and contact is at least 100vh. The four project sections are cards
with a 16:9 preview, title and 2026 year row, short description, tags, and
links. Preview files come from `assets/projects/`; if none exists, show a
typographic fallback with the project title, tags, and specified key fact.
Videos play only while visible and when reduced motion is off.
Contact stacks a drawn infinity, label, paragraph, and links in the centre.
The dust particle field stays behind the content and dims to 60% opacity there.

## Content (use verbatim, do not invent facts)

### Hero
- Headline: GARV KAPOOR
- Role: AI/ML engineer in training.
- Line: I build with Python and real data: live APIs, pre-trained models,
  and agents that have to work under hard limits.
- Status: green dot + "Open to internships"

### Location
- Label: LOCATION
- Title: Based in India.
- Text: Noida, in the Delhi NCR.

### AutoPilot
- Label: NSUT Hackathon / Top 5 overall
- Title: AutoPilot
- Text: A rule-based tower-defence agent in pure Python, scoring 357.78 across
  four public test cases.
- Tags: Python
- Preview: static and non-focusable; not wrapped in a link.
- Link row: "Code not public" (plain dim text; no project link).

### Lens
- Label: JAI 2026 Hackathon
- Title: RhetoricLens
- Text: A team-built web app that analyses arguments for logical fallacies. I
  worked on UI consistency and low-end device performance.
- Tags: Python, FastAPI, HTML/CSS/JS
- Link: "View on GitHub" -> https://github.com/Adhyan0112/Rhetoric-lenss

### Sentiment
- Label: Formula 1
- Title: F1 Race Sentiment Tracker
- Text: Scores fan reactions to F1 races with a pre-trained HuggingFace model,
  and documents where it fails on sarcasm.
- Tags: Python, HuggingFace, uv
- Link: "Sentiment Tracker" -> https://github.com/jordan270/projects

### Analyzer
- Label: Harvard CS50P final project
- Title: F1 Race Analyzer
- Text: Pulls live race data from the Jolpica API, with fastest laps and
  pit-stop strategies, covered by pytest.
- Tags: Python, REST APIs, pytest
- Link: "Race Analyzer" -> https://github.com/jordan270

### Contact
- Line: Looking for an AI/ML internship where I can ship quickly and learn
  from production systems.
- Links (plain, quiet): garvkapoor834@gmail.com (mailto), GitHub
  https://github.com/jordan270, LinkedIn
  https://www.linkedin.com/in/garv-kapoor-a13804433, Kaggle
  https://www.kaggle.com/garvkapoor24
- Label above contact copy: KEEP IN TOUCH
- Small footer: Harvard CS50P (completed 2026) / CS50 AI (in progress).
- NEVER show a phone number, street address, or age anywhere on the site.
## Shapes (public names)
```ts
export type ShapeName = 'face' | 'india' | 'tower' | 'lens' | 'flags' | 'f1' | 'dust';
```
- `dust`: a sparse, wide, slowly drifting background field; it fills the
  viewport without a figure and dims to 60% opacity on the contact slide.
- `face`: baked 45,000-point photo-derived cloud split 45% face, 20% hair and
  35% body. Face detail leads over softened clothing texture; the desktop
  bust fills about 80% of viewport height, with a soft side and lower fade.
- `india`: official India outline from `assets/india.svg`, scaled to about
  75% of desktop viewport height, with a bright Delhi NCR cluster and subtle
  pulsing ring while india is dominant.
- `tower`: tall castle-style defence tower with eight spaced merlons, sparse
  slit windows, and two concentric ground range rings.
- `lens`: magnifying glass (torus rim, sparse glass disc, highlight arc, and
  handle at about 45 degrees).
- `flags`: crossed checkered flags sampled from `assets/flags.png`, weighted
  toward flag edges and poles so the checker pattern reads clearly.
- `f1`: sampled Formula 1 logo silhouette with slight z jitter.

Project-card alternation: AutoPilot and sentiment are on the left; Lens and
Analyzer are on the right. On small screens, cards use the lower part of the
viewport while their shapes sit above.

Raster shape sources live under `assets/`; the private portrait source lives
at `private/face.jpg` and is ignored by Git. PNG logos use alpha when more
than 2% of pixels are near transparent; otherwise their four corners define
the background colour and the foreground mask is cleaned before sampling.
F1 sampling prefers `assets/f1.svg` when present and falls back to
`assets/f1.png`.

## Folder ownership
- Engine and shape sampling: `src/engine/**`, `scripts/**`, `public/shapes/**`,
  `.gitignore`
- UI: `index.html`, `src/style.css`, `src/ui/**`, `src/main.ts`

## Contract (public API of src/engine)
```ts
export interface ParticleEngine {
  mount(container: HTMLElement): void;
  setMorph(from: ShapeName, to: ShapeName, t: number); // t 0..1
  setEnergy(value: number): void;
  setQuality(q: 'high' | 'medium' | 'low' | 'auto'): void;
  resize(): void;
  dispose(): void;
}
export function createEngine(opts?: { count?: number }): ParticleEngine;
```
The UI uses only this API. The engine does not touch the DOM outside its
container.

## Performance
- Adaptive quality (high 60k, medium 30k, low 12k particles)
- DPR capped at 2, pause when the tab is hidden
- Point size clamped to 1-3 device pixels, with rare sparkle up to 5
- Reduced motion: static shape, no morph animation
