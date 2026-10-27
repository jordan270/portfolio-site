export interface CometController {
  destroy: () => void;
}

interface TrailPoint {
  x: number;
  y: number;
}

export function initComet(canvasSelector: string = '#comet-canvas'): CometController {
  const canvas = document.querySelector<HTMLCanvasElement>(canvasSelector);
  if (!canvas) {
    console.warn(`[comet] Canvas not found: ${canvasSelector}`);
    return { destroy: () => {} };
  }

  // Skip completely under prefers-reduced-motion per SPEC
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    canvas.style.display = 'none';
    return { destroy: () => {} };
  }

  // Hide and disable on touch devices
  const isTouchDevice =
    window.matchMedia('(pointer: coarse)').matches ||
    window.matchMedia('(hover: none)').matches ||
    'ontouchstart' in window;

  if (isTouchDevice) {
    canvas.style.display = 'none';
    return {
      destroy: () => {},
    };
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { destroy: () => {} };
  }

  let width = window.innerWidth;
  let height = window.innerHeight;
  let dpr = Math.min(window.devicePixelRatio || 1, 1.5);

  const resize = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.resetTransform?.();
    ctx.scale(dpr, dpr);
  };

  resize();
  window.addEventListener('resize', resize);

  // Position and spring physics
  let mouseX = width / 2;
  let mouseY = height / 2;
  let headX = width / 2;
  let headY = height / 2;
  let velX = 0;
  let velY = 0;
  let hasMoved = false;

  const spring = 0.16;
  const damping = 0.72;

  // Trail buffer (~25 positions)
  const MAX_TRAIL = 16;
  const trail: TrailPoint[] = [];
  let lastMoveAt = 0;
  let lastFadeAt = 0;

  const onMouseMove = (e: MouseEvent) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    lastMoveAt = performance.now();
    if (!hasMoved) {
      headX = mouseX;
      headY = mouseY;
      hasMoved = true;
    }
    if (rafId === null && isTabActive) rafId = requestAnimationFrame(animate);
  };

  window.addEventListener('mousemove', onMouseMove, { passive: true });

  let rafId: number | null = null;
  let isTabActive = !document.hidden;

  const onVisibilityChange = () => {
    isTabActive = !document.hidden;
    if (isTabActive && rafId === null) {
      rafId = requestAnimationFrame(animate);
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  const animate = () => {
    if (!isTabActive) {
      rafId = null;
      return;
    }

    ctx.clearRect(0, 0, width, height);

    if (hasMoved) {
      // Spring motion towards target
      const ax = (mouseX - headX) * spring;
      const ay = (mouseY - headY) * spring;
      velX = (velX + ax) * damping;
      velY = (velY + ay) * damping;

      headX += velX;
      headY += velY;

      // Append head to trail
      trail.push({ x: headX, y: headY });
      if (trail.length > MAX_TRAIL) {
        trail.shift();
      }

      const now = performance.now();
      if (now - lastMoveAt > 900 && now - lastFadeAt > 55) {
        trail.shift();
        lastFadeAt = now;
      }

      // Keep the comet in one gradient stroke rather than stroking every segment.
      const n = trail.length;
      if (n > 2) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(trail[0].x, trail[0].y);
        for (let i = 1; i < n; i++) ctx.lineTo(trail[i].x, trail[i].y);
        const gradient = ctx.createLinearGradient(trail[0].x, trail[0].y, headX, headY);
        gradient.addColorStop(0, 'rgba(255,255,255,0.03)');
        gradient.addColorStop(0.55, 'rgba(255,255,255,0.28)');
        gradient.addColorStop(1, 'rgba(255,255,255,0.86)');
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 3.2;
        ctx.stroke();
      }

      // Draw glowing comet head
      const glowRadius = 14;
      const headGlow = ctx.createRadialGradient(
        headX,
        headY,
        0,
        headX,
        headY,
        glowRadius
      );
      headGlow.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
      headGlow.addColorStop(0.2, 'rgba(255, 255, 255, 0.85)');
      headGlow.addColorStop(0.55, 'rgba(255, 255, 255, 0.25)');
      headGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.beginPath();
      ctx.arc(headX, headY, glowRadius, 0, Math.PI * 2);
      ctx.fillStyle = headGlow;
      ctx.fill();

      // Sharp white core at center
      ctx.beginPath();
      ctx.arc(headX, headY, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }

    if (hasMoved && (performance.now() - lastMoveAt < 900 || trail.length > 0 || Math.hypot(velX, velY) > 0.12)) rafId = requestAnimationFrame(animate);
    else rafId = null;
  };

  return {
    destroy() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    },
  };
}
