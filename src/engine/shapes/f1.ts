import { loadRasterMask, sampleSvgMask, type SampledMask } from './mask.ts';
import { generate as dust } from './dust.ts';

let sampledMask: SampledMask | null = null;
let sourceRequest: Promise<void> | null = null;

export function loadSource(): Promise<void> {
  if (!sourceRequest) {
    sourceRequest = (async () => {
      try {
        // Keep the authored negative spaces intact; this mask is already clean and transparent.
        sampledMask = await loadRasterMask('/assets/f1.png', 'f1', (rgba, offset) => rgba[offset + 3] > 128);
      } catch (pngError) {
        console.warn('[ParticleEngine] F1 image mask unavailable; using dust.', pngError);
      }
    })();
  }
  return sourceRequest;
}

/** Sample the supplied F1 logo, or use dust until its mask loads. */
export function generate(count: number, seeds?: Float32Array): Float32Array {
  if (sampledMask) return sampleSvgMask(sampledMask, count, seeds, 13, true);
  return dust(count, seeds);
}

export { dust as fallbackDust };
