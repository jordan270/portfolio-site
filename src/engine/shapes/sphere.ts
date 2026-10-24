/** Uniformly distributed points on and just beneath a unit sphere. */
export function generate(count: number): Float32Array {
  const points = new Float32Array(Math.max(0, count) * 3);
  for (let i = 0; i < count; i++) {
    const y = 1 - 2 * (i + 0.5) / count;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = i * Math.PI * (3 - Math.sqrt(5));
    const depth = Math.random() < 0.22 ? Math.cbrt(Math.random()) : 1;
    points[i * 3] = Math.cos(angle) * radius * depth;
    points[i * 3 + 1] = y * depth;
    points[i * 3 + 2] = Math.sin(angle) * radius * depth;
  }
  return points;
}
