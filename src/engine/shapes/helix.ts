/** Two dense strands, with a soft scattering of particles between the rungs. */
export function generate(count: number): Float32Array {
  const points = new Float32Array(Math.max(0, count) * 3);
  const turns = 2.5;
  for (let i = 0; i < count; i++) {
    const strand = i % 3;
    const u = Math.random();
    const angle = u * turns * Math.PI * 2 + (strand === 1 ? Math.PI : 0);
    const spread = strand === 2 ? Math.sqrt(Math.random()) * 0.3 : Math.random() * 0.035;
    const radius = 0.67 + spread;
    points[i * 3] = Math.cos(angle) * radius;
    points[i * 3 + 1] = (u - 0.5) * 2.1 + (strand === 2 ? (Math.random() - 0.5) * 0.18 : 0);
    points[i * 3 + 2] = Math.sin(angle) * radius;
  }
  return points;
}
