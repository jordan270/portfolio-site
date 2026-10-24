export function randomFor(seed: number, channel = 0): () => number {
  let state = (Math.floor(seed * 0xffffffff) ^ Math.imul(channel + 1, 0x9e3779b1)) >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function seedAt(seeds: Float32Array | undefined, index: number, count: number): number {
  return seeds?.[index] ?? (index + 0.5) / Math.max(1, count);
}
