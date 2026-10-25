# SPEC: Garv Kapoor Portfolio (particle morph)

## Concept
One cloud of particles morphs between the story's shapes as the user scrolls.
The site is monochrome, minimal, and cinematic, and remains readable with the
particles switched off.

Flow: face -> india -> tower -> lens -> bubble -> f1 -> dust

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

## Sections
Seven sections in this exact order, with alternating text sides:
1. hero      data-shape="face"      text left
2. location  data-shape="india"     text right
3. autopilot data-shape="tower"     text left
4. lens      data-shape="lens"      text right
5. sentiment data-shape="bubble"    text left
6. analyzer  data-shape="f1"        text right
7. contact   data-shape="dust"     text centred, drawn infinity above text

Hero is 120vh, content sections are 110vh, and contact is at least 100vh.
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
- Label: PROJECT 01 / NSUT HACKATHON
- Title: AutoPilot
- Badge line: Top 5 overall
- Text: A rule-based tower-defence agent in pure Python. It deploys defences
  under budget limits inside a 15-second per-call limit, scored 357.78 across
  four public test cases, and was refined by reading run logs to find where
  defences were lost and budget was wasted.
- Tags: Python, standard library only
- Link: "View on GitHub" -> https://github.com/jordan270

### Lens
- Label: PROJECT 02 / JAI 2026 HACKATHON, JIIT NOIDA
- Title: RhetoricLens
- Text: A web app, built with a team and still in progress, that analyses
  arguments for logical fallacies and shows the structure behind them. I
  worked on UI consistency between the landing page and the analysis console,
  and on performance for low-end devices.
- Tags: Python, FastAPI, HTML/CSS/JS
- Link: "View on GitHub" -> https://github.com/Adhyan0112/Rhetoric-lenss

### Sentiment
- Label: PROJECT 03 / FORMULA 1
- Title: Race Sentiment Tracker
- Text: The Sentiment Tracker scores fan reactions with a pre-trained
  HuggingFace model, and documents where it fails (sarcasm like “oh great,
  another red flag” scores positive).
- Tags: Python, HuggingFace Transformers
- Link: "Sentiment Tracker" -> https://github.com/jordan270/projects

### Analyzer
- Label: PROJECT 03 / FORMULA 1
- Title: Race Analyzer
- Text: My Harvard CS50P final project fetches live race data from the
  Jolpica API, computes each driver's fastest lap, shows pit-stop strategies,
  and is covered by pytest.
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
export type ShapeName = 'face' | 'india' | 'tower' | 'lens' | 'bubble' | 'f1' | 'dust';
```
- `dust`: a sparse, wide, slowly drifting background field; it fills the
  viewport without a figure and dims to 60% opacity on the contact slide.
- `face`: baked photo-derived 3D point cloud, hologram effects only while face
  is dominant.
- `india`: official India outline from `public/shapes/india.svg`, with a bright
  Delhi NCR cluster and a subtle pulsing ring while india is dominant.
- `tower`: tall castle-style defence tower with eight spaced merlons, sparse
  slit windows, and two concentric ground range rings.
- `lens`: magnifying glass (torus rim, sparse glass disc, highlight arc, and
  handle at about 45 degrees).
- `bubble`: speech-bubble silhouette made of particles.
- `f1`: sampled Formula 1 logo silhouette with slight z jitter.

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
