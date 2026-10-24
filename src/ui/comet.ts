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
  let dpr = Math.min(window.devicePixelRatio || 1, 2);

  const resize = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);

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
  const MAX_TRAIL = 25;
  const trail: TrailPoint[] = [];

  const onMouseMove = (e: MouseEvent) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (!hasMoved) {
      headX = mouseX;
      headY = mouseY;
      hasMoved = true;
    }
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

      // Draw naturally curved tapering trail
      const n = trail.length;
      if (n > 2) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (let i = 0; i < n - 1; i++) {
          const p0 = trail[i];
          const p1 = trail[i + 1];

          // Compute midpoint between p0 and p1 for smooth Bezier curve
          const midX = (p0.x + p1.x) / 2;
          const midY = (p0.y + p1.y) / 2;

          // Progress from tail (0) to head (1)
          const t = (i + 1) / n;
          const alpha = Math.pow(t, 1.8) * 0.75;
          const lineWidth = 0.6 + t * 4.4;

          ctx.beginPath();
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
          ctx.lineWidth = lineWidth;

          if (i === 0) {
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(midX, midY);
          } else {
            const prevMidX = (trail[i - 1].x + p0.x) / 2;
            const prevMidY = (trail[i - 1].y + p0.y) / 2;
            ctx.moveTo(prevMidX, prevMidY);
            ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
          }
          ctx.stroke();
        }

        // Connect the last midpoint directly to the head
        const lastMidX = (trail[n - 2].x + trail[n - 1].x) / 2;
        const lastMidY = (trail[n - 2].y + trail[n - 1].y) / 2;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(255, 255, 255, 0.85)`;
        ctx.lineWidth = 5;
        ctx.moveTo(lastMidX, lastMidY);
        ctx.lineTo(headX, headY);
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

    rafId = requestAnimationFrame(animate);
  };

  rafId = requestAnimationFrame(animate);

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
