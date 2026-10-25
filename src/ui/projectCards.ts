type ProjectCardData = {
  section: string;
  slug: string;
  title: string;
  year: string;
  label: string;
  description: string;
  tags: string;
  fact?: string;
  href?: string;
  linkText?: string;
};

const projects: ProjectCardData[] = [
  { section: 'autopilot', slug: 'autopilot', title: 'AutoPilot', year: '2026', label: 'NSUT Hackathon / Top 5 overall', description: 'A rule-based tower-defence agent in pure Python, scoring 357.78 across four public test cases.', tags: 'Python', fact: 'Top 5 overall' },
  { section: 'lens', slug: 'rhetoriclens', title: 'RhetoricLens', year: '2026', label: 'JAI 2026 Hackathon', description: 'A team-built web app that analyses arguments for logical fallacies. I worked on UI consistency and low-end device performance.', tags: 'Python, FastAPI, HTML/CSS/JS', href: 'https://github.com/Adhyan0112/Rhetoric-lenss', linkText: 'View on GitHub' },
  { section: 'sentiment', slug: 'f1-sentiment', title: 'F1 Race Sentiment Tracker', year: '2026', label: 'Formula 1', description: 'Scores fan reactions to F1 races with a pre-trained HuggingFace model, and documents where it fails on sarcasm.', tags: 'Python, HuggingFace, uv', href: 'https://github.com/jordan270/projects', linkText: 'Sentiment Tracker' },
  { section: 'analyzer', slug: 'f1-analyzer', title: 'F1 Race Analyzer', year: '2026', label: 'Harvard CS50P final project', description: 'Pulls live race data from the Jolpica API, with fastest laps and pit-stop strategies, covered by pytest.', tags: 'Python, REST APIs, pytest', href: 'https://github.com/jordan270', linkText: 'Race Analyzer' },
];

const projectFiles = import.meta.glob('/assets/projects/*', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const extensionOrder = ['mp4', 'webm', 'png', 'jpg', 'jpeg', 'webp'];

export function initProjectCards(): void {
  const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const videos: HTMLVideoElement[] = [];

  for (const project of projects) {
    const section = document.getElementById(project.section);
    const content = section?.querySelector<HTMLElement>('.content-block');
    if (!section || !content) continue;

    if (project.section === 'autopilot') {
      const kicker = document.createElement('span');
      kicker.className = 'work-kicker';
      kicker.textContent = 'SELECTED WORK (04)';
      section.append(kicker);
    }

    const article = document.createElement('article');
    article.className = 'project-card reveal-block';
    article.dataset.project = project.slug;
    const media = document.createElement('div');
    media.className = 'project-media';
    const asset = extensionOrder.map((extension) => projectFiles[`/assets/projects/${project.slug}.${extension}`]).find(Boolean);

    if (asset && /\.(mp4|webm)$/i.test(asset)) {
      const video = document.createElement('video');
      video.muted = true; video.loop = true; video.playsInline = true;
      video.preload = prefersReducedMotion ? 'metadata' : 'none';
      video.src = asset;
      media.append(video);
      videos.push(video);
    } else if (asset) {
      const image = document.createElement('img');
      image.src = asset; image.alt = ''; image.loading = 'lazy';
      media.append(image);
    } else {
      console.info(`[project-cards] no preview file for ${project.slug}; showing typographic fallback`);
      media.dataset.previewKind = 'fallback';
      const fallback = document.createElement('div');
      fallback.className = 'preview-fallback';
      const title = document.createElement('span'); title.className = 'preview-title'; title.textContent = project.title;
      const tags = document.createElement('span'); tags.className = 'preview-tags'; tags.textContent = project.tags;
      fallback.append(title, tags);
      if (project.fact) { const fact = document.createElement('span'); fact.className = 'preview-fact'; fact.textContent = project.fact; fallback.append(fact); }
      media.append(fallback);
    }

    let preview: HTMLElement;
    if (project.href) {
      const previewLink = document.createElement('a');
      previewLink.className = 'project-preview-link';
      previewLink.href = project.href;
      previewLink.target = '_blank';
      previewLink.rel = 'noopener noreferrer';
      previewLink.setAttribute('aria-label', `Open ${project.title} on GitHub`);
      previewLink.append(media);
      preview = previewLink;
    } else {
      preview = document.createElement('div');
      preview.className = 'project-preview-static';
      preview.setAttribute('aria-hidden', 'true');
      preview.append(media);
    }
    const titleRow = document.createElement('div'); titleRow.className = 'project-title-row';
    const title = document.createElement('h2'); title.textContent = project.title;
    const year = document.createElement('span'); year.className = 'project-year'; year.textContent = project.year;
    titleRow.append(title, year);
    const description = document.createElement('p'); description.className = 'project-description'; description.textContent = project.description;
    const label = document.createElement('p'); label.className = 'project-label'; label.textContent = project.label;
    const tags = document.createElement('p'); tags.className = 'project-tags'; tags.textContent = project.tags;
    const links = document.createElement('div'); links.className = 'project-links';
    if (project.href && project.linkText) {
      const link = document.createElement('a'); link.href = project.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.className = 'quiet-link'; link.textContent = project.linkText;
      links.append(link);
    } else {
      const unavailable = document.createElement('span'); unavailable.className = 'project-no-link'; unavailable.textContent = 'Code not public';
      links.append(unavailable);
    }
    article.append(preview, titleRow, description, label, tags, links);
    content.replaceChildren(article);
  }

  if (videos.length) {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const video = entry.target as HTMLVideoElement;
        if (prefersReducedMotion) { video.pause(); continue; }
        if (entry.isIntersecting) void video.play().catch(() => {});
        else video.pause();
      }
    }, { threshold: 0.25 });
    videos.forEach((video) => observer.observe(video));
  }
}
