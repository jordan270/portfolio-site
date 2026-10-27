# Garv Kapoor | Particle Portfolio

An interactive, single-page portfolio where thousands of GPU particles morph between shapes as you scroll.

**Live site:** https://portfolio-site-one-zeta-85.vercel.app/

## Highlights

- **Particle morphing:** a WebGL canvas that morphs particle clouds between shapes sampled from images, driven by scroll position
- **Custom shaders:** hand-written three.js `ShaderMaterial`s for rendering and transitions
- **Smooth scrolling:** Lenis smooth scroll synced with GSAP animations
- **Content sections:** hero, project slides and contact links in one scrolling page

## Tech stack

| Area | Tools |
| --- | --- |
| Build | Vite |
| Language | TypeScript (vanilla, no UI framework) |
| 3D / GPU | three.js with custom GLSL shaders |
| Animation | GSAP |
| Scrolling | Lenis |
| Hosting | Vercel, with auto-deploy from GitHub |

## How the particles work

Shape samplers read an image and turn it into particle positions:

- Only pixels with an alpha value above 128 become particles, which keeps edges clean.
- Images are scaled uniformly with `object-fit: contain` math, so aspect ratios are preserved.
- Shader uniforms blend between shapes as the scroll progress changes.

## Project structure

```text
├── public/        static images, icons and fonts
├── assets/        project assets
├── scripts/       build and helper scripts
├── src/
│   └── engine/    particle samplers and rendering engine
├── index.html
└── vite.config.ts
```

The `private/` and `debug/` folders are local-only and gitignored.

## Run locally

Requires [Node.js](https://nodejs.org/) 18 or newer.

```bash
git clone https://github.com/jordan270/portfolio-site.git
cd portfolio-site
npm install
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Create a production build in `dist/` |
| `npm run preview` | Serve the production build locally |

## Deployment

Pushing to `main` triggers an automatic Vercel deployment. Other branches get preview URLs.

## Contact

- GitHub: [@jordan270](https://github.com/jordan270)
- Kaggle: [garvkapoor24](https://www.kaggle.com/garvkapoor24)
- Portfolio: https://portfolio-site-one-zeta-85.vercel.app/
