// CPU noise used for terrain generation and for baking the tileable textures the shaders sample.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PERM = new Uint8Array(512);
const GRAD = new Float32Array(512 * 2);
{
  const rand = mulberry32(1937);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) {
    PERM[i] = p[i & 255];
    const a = rand() * Math.PI * 2;
    GRAD[i * 2] = Math.cos(a);
    GRAD[i * 2 + 1] = Math.sin(a);
  }
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

function gradDot(ix, iy, x, y) {
  const h = PERM[(PERM[ix & 255] + iy) & 511];
  return GRAD[h * 2] * x + GRAD[h * 2 + 1] * y;
}

// 2D gradient noise in roughly [-1, 1]. With `period`, the lattice wraps so the result tiles.
export function noise2(x, y, period = 0) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  let ix0 = x0, iy0 = y0, ix1 = x0 + 1, iy1 = y0 + 1;
  if (period > 0) {
    ix0 = ((ix0 % period) + period) % period;
    iy0 = ((iy0 % period) + period) % period;
    ix1 = (ix0 + 1) % period;
    iy1 = (iy0 + 1) % period;
  }
  const n00 = gradDot(ix0, iy0, fx, fy);
  const n10 = gradDot(ix1, iy0, fx - 1, fy);
  const n01 = gradDot(ix0, iy1, fx, fy - 1);
  const n11 = gradDot(ix1, iy1, fx - 1, fy - 1);
  const u = fade(fx), v = fade(fy);
  return 1.41 * ((n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v);
}

export function fbm2(x, y, octaves = 5, lacunarity = 2, gain = 0.5) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x, y);
    norm += amp;
    x = x * lacunarity + 17.3;
    y = y * lacunarity - 9.1;
    amp *= gain;
  }
  return sum / norm;
}

// Tileable fbm over a unit square: (u, v) in [0, 1), `base` lattice cells per tile.
export function tileFbm2(u, v, base, octaves = 5, gain = 0.5) {
  let sum = 0, amp = 0.5, norm = 0, p = base;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(u * p + i * 31.7, v * p + i * 11.3, p);
    norm += amp;
    p *= 2;
    amp *= gain;
  }
  return sum / norm;
}

// Tileable Worley (cellular) noise, returns F1 distance in [0, ~1].
export function makeWorley2(cells, seed) {
  const rand = mulberry32(seed);
  const pts = new Float32Array(cells * cells * 2);
  for (let i = 0; i < pts.length; i++) pts[i] = rand();
  return (u, v) => {
    const x = u * cells, y = v * cells;
    const cx = Math.floor(x), cy = Math.floor(y);
    let best = 1e9;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const gx = cx + ox, gy = cy + oy;
        const wx = ((gx % cells) + cells) % cells, wy = ((gy % cells) + cells) % cells;
        const k = (wy * cells + wx) * 2;
        const dx = gx + pts[k] - x, dy = gy + pts[k + 1] - y;
        const d = dx * dx + dy * dy;
        if (d < best) best = d;
      }
    }
    return Math.min(1, Math.sqrt(best));
  };
}

export function makeWorley3(cells, seed) {
  const rand = mulberry32(seed);
  const pts = new Float32Array(cells * cells * cells * 3);
  for (let i = 0; i < pts.length; i++) pts[i] = rand();
  const w = (i) => ((i % cells) + cells) % cells;
  return (u, v, s) => {
    const x = u * cells, y = v * cells, z = s * cells;
    const cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z);
    let best = 1e9;
    for (let oz = -1; oz <= 1; oz++)
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const gx = cx + ox, gy = cy + oy, gz = cz + oz;
          const k = ((w(gz) * cells + w(gy)) * cells + w(gx)) * 3;
          const dx = gx + pts[k] - x, dy = gy + pts[k + 1] - y, dz = gz + pts[k + 2] - z;
          const d = dx * dx + dy * dy + dz * dz;
          if (d < best) best = d;
        }
    return Math.min(1, Math.sqrt(best));
  };
}

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
