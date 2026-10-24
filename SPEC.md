# SPEC: Garv Kapoor Portfolio (particle morph)

## Concept
A single-page scroll experience. One cloud of particles morphs between
shapes as the user scrolls. Each shape matches the story beside it.
Monochrome, minimal, cinematic. The page must still read well with
the particles switched off (real text, real links).

Flow: face -> india -> lens -> f1 -> dust

## Design tokens
- Background: #26262b
- Particles and text: white, opacity 0.35 to 1.0
- Font: Inter (weights 300/400), letter-spacing -0.02em
- Text size: clamp(1.25rem, 2.2vw, 2rem), max 3 lines per paragraph
- Only accent: a small green dot (#21e065) beside "Open to internships"
- One glowing white comet follows the cursor with eased motion and a
  tapering trail (desktop only)
- No other colours, no gradients, no UI chrome. Generous empty space.
- Respect prefers-reduced-motion everywhere.

## Sections (each has data-shape; contract names below)
1. hero      data-shape="face"   text left, shape right
2. autopilot data-shape="india"  text right, shape left
3. lens      data-shape="lens"   text left, shape right
4. f1        data-shape="f1"     text right, shape left
5. contact   data-shape="dust"   text centred

Heights: hero 120vh, project sections 110vh, contact 100vh.
Mobile: text sits in the bottom third so the shape stays visible.

## Content (use verbatim, do not invent facts)

### Hero
- Label (small, uppercase): GARV KAPOOR
- Headline: AI/ML engineer in training.
- Line: I build with Python and real data: live APIs, pre-trained models,
  and agents that have to work under hard limits.
- Status: green dot + "Open to internships"

### Project 01: AutoPilot
- Label: PROJECT 01 / NSUT HACKATHON
- Title: AutoPilot
- Badge line: Top 5 overall
- Text: A rule-based tower-defence agent in pure Python. It deploys defences
  under budget limits inside a 15-second per-call limit, scored 357.78 across
  four public test cases, and was refined by reading run logs to find where
  defences were lost and budget was wasted.
- Tags: Python, standard library only
- Link: "View on GitHub" -> https://github.com/jordan270 (placeholder until
  the AutoPilot repo URL is known)

### Project 02: RhetoricLens
- Label: PROJECT 02 / JAI 2026 HACKATHON, JIIT NOIDA
- Title: RhetoricLens
- Text: A web app, built with a team and still in progress, that analyses
  arguments for logical fallacies and shows the structure behind them. I
  worked on UI consistency between the landing page and the analysis console,
  and on performance for low-end devices.
- Tags: Python, FastAPI, HTML/CSS/JS
- Link: "View on GitHub" -> https://github.com/Adhyan0112/Rhetoric-lenss

### Project 03: F1 projects
- Label: PROJECT 03 / FORMULA 1
- Title: F1 Race Sentiment Tracker and Race Analyzer
- Text: Two Formula 1 projects. The Sentiment Tracker scores fan reactions
  with a pre-trained HuggingFace model, and documents where it fails
  (sarcasm like "oh great, another red flag" scores positive). The Race
  Analyzer, my Harvard CS50P final project, fetches live race data from the
  Jolpica API, computes each driver's fastest lap, shows pit-stop strategies,
  and is covered by pytest.
- Tags: Python, HuggingFace Transformers, REST APIs, pytest
- Links: "Sentiment Tracker" -> https://github.com/jordan270/projects
         "Race Analyzer"     -> https://github.com/jordan270

### Contact
- Line: Looking for an AI/ML internship where I can ship quickly and learn
  from production systems.
- Links (plain, quiet): garvkapoor834@gmail.com (mailto), GitHub
  https://github.com/jordan270, LinkedIn
  https://www.linkedin.com/in/garv-kapoor-a13804433, Kaggle
  https://www.kaggle.com/garvkapoor24
- Small footer: Harvard CS50P (completed 2026) / CS50 AI (in progress).
- NEVER show a phone number or age anywhere on the site.

## Shapes (public names)
export type ShapeName = 'face' | 'india' | 'lens' | 'f1' | 'dust';

- face: baked 3D point cloud of the owner's face, hologram look (scanlines,
  faint flicker, slow vertical scan band) active only while face is dominant
- india: a tall castle-style defence tower with crenellated top, with two
  thin concentric range rings on the ground plane around it
- lens: magnifying glass (torus rim, sparse glass disc with a bright
  highlight arc, handle at about 45 degrees)
- f1: sampled from assets/f1.svg silhouette with slight z jitter
- dust: loose, wide, flat drifting field of sparse particles

## Folder ownership (DO NOT edit the other agent's folders)
- CODEX owns: src/engine/**, scripts/**, public/shapes/**, .gitignore
- ANTIGRAVITY owns: index.html, src/style.css, src/ui/**, src/main.ts

## Contract (public API of src/engine)
```ts
export interface ParticleEngine {
  mount(container: HTMLElement): void;
  setMorph(from: ShapeName, to: ShapeName, t: number): void; // t 0..1
  setEnergy(value: number): void;
  setQuality(q: 'high' | 'medium' | 'low' | 'auto'): void;
  resize(): void;
  dispose(): void;
}
export function createEngine(opts?: { count?: number }): ParticleEngine;
```
The UI must only use this API. The engine must not touch the DOM outside
its container.

## Performance
- Adaptive quality (high 60k, medium 30k, low 12k particles)
- DPR capped at 2, pause when the tab is hidden
- Point size clamped to 1-3 device pixels, with rare sparkle up to 5
- Reduced motion: static shape, no morph animation
