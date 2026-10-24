/** Two logarithmic arms around a dense, thin central disc. */
export function generate(count: number): Float32Array {
  const points = new Float32Array(Math.max(0, count) * 3);
  for (let i = 0; i < count; i++) {
    const core = Math.random() < 0.38;
    const arm = i % 2;
    const angle = core ? Math.random() * Math.PI * 2 : Math.random() * Math.PI * 3.5 + arm * Math.PI;
    const radius = core ? Math.sqrt(Math.random()) * 0.3 : 0.12 + Math.random() * 0.78;
    const spiral = core ? 0 : angle * 0.12;
    const a = angle + spiral + (Math.random() - 0.5) * (core ? 6.28 : 0.36);
    points[i * 3] = Math.cos(a) * radius;
    points[i * 3 + 1] = (Math.random() - 0.5) * (core ? 0.12 : 0.055) * (1 - radius * 0.45);
    points[i * 3 + 2] = Math.sin(a) * radius;
  }
  return points;
}
