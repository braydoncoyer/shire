// Spatial chunking. Merged and instanced meshes are split into cells so the camera, the shadow
// cascades and the lake reflection can each frustum-cull what they don't see. Cells are small over
// the set and large over the farmland, where there is little to draw.

const INNER = 300;

export function chunkKey(x, z, cell = 64) {
  if (Math.abs(x) < INNER && Math.abs(z) < INNER) return `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
  return `o${Math.floor(x / 1200)},${Math.floor(z / 1200)}`;
}

/** Group items into a Map of chunk key → items, using pos(item) → [x, z]. */
export function chunk(items, pos, cell) {
  const out = new Map();
  for (const it of items) {
    const [x, z] = pos(it);
    const k = chunkKey(x, z, cell);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(it);
  }
  return out;
}
