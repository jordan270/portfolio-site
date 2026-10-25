import { loadPngLogoMask, loadSvgMask, sampleSvgMask, type SampledMask } from './mask.ts';
import { generate as dust } from './dust.ts';

let sampledMask: SampledMask | null = null;
let sourceRequest: Promise<void> | null = null;

export function loadSource(): Promise<void> {
  if (!sourceRequest) {
    sourceRequest = (async () => {
      try {
        sampledMask = await loadSvgMask('/assets/f1.svg', 'f1');
      } catch (svgError) {
        console.warn('[ParticleEngine] assets/f1.svg unavailable; sampling the supplied F1 PNG.', svgError);
        try {
          sampledMask = await loadPngLogoMask('/assets/f1.png', 'f1');
        } catch (pngError) {
          console.warn('[ParticleEngine] F1 image masks unavailable; using dust.', pngError);
        }
      }
    })();
  }
  return sourceRequest;
}

/** Sample the supplied F1 logo, or use dust until its mask loads. */
export function generate(count: number, seeds?: Float32Array): Float32Array {
  if (sampledMask) return sampleSvgMask(sampledMask, count, seeds, 13);
  return dust(count, seeds);
}

export { dust as fallbackDust };
