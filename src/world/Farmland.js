// Farmland beyond the village: the patchwork of paddocks the set sits in, as on film. A rotated
// grid of irregular rectangles (columns of fixed width, each cut into rows of its own length) gives
// each paddock its own sward (lush, pale or gone to hay) and a few are ploughed. The same layout is
// evaluated on the CPU (fences along the paddock edges, keeping trees off ploughed ground) and on
// the GPU (the ground's color, hedgerow lines in the distance, no grass on ploughed fields).

import { Fn, vec2, vec4, float, floor, fract, min, max, smoothstep, select, length } from 'three/tsl';
import { VILLAGE, GREEN_DRAGON } from './Layout.js';

const ANG = 0.38, CA = Math.cos(ANG), SA = Math.sin(ANG);
const CW = 96; // column width, m
// The village hill (no paddocks) and the Green Dragon's lawns.
const VX = VILLAGE.x - 10, VZ = VILLAGE.z - 10, VR0 = 165, VR1 = 200;
const GX = GREEN_DRAGON.x, GZ = GREEN_DRAGON.z, GR0 = 30, GR1 = 45;
// The ploughed field on the rise behind the Green Dragon, where it shows from the bridge.
const PLOUGH_AT = [150, 215];
const PLOUGH_P = 0.022, HAY_P = 0.1;

// Hash without sine: stable across float32 (GPU) and float64 (CPU) for small integers.
const hashJS = (n) => {
  let p = n * 0.1031;
  p -= Math.floor(p);
  p *= p + 33.33;
  p *= p + p;
  return p - Math.floor(p);
};
const hashTSL = (n) => {
  const p = fract(n.mul(0.1031)).toVar();
  p.assign(p.mul(p.add(33.33)));
  p.assign(p.mul(p.add(p)));
  return fract(p);
};

const rowsJS = (col) => ({ off: hashJS(col * 7.3 + 11) * 90, rowH: 55 + hashJS(col * 3.1 + 5) * 65 });
/** The layout for building fences: grid rotation, column width, each column's rows, fenced area. */
export const PADDOCK_GRID = { CA, SA, CW, rows: rowsJS, cx: GREEN_DRAGON.x + 40, cz: GREEN_DRAGON.z + 30, R: 300 };

function cellJS(x, z) {
  const u = x * CA + z * SA, v = -x * SA + z * CA;
  const col = Math.floor(u / CW);
  const { off, rowH } = rowsJS(col);
  const row = Math.floor((v + off) / rowH);
  const fu = u / CW - col, fv = (v + off) / rowH - row;
  const edge = Math.min(fu * CW, (1 - fu) * CW, fv * rowH, (1 - fv) * rowH);
  return { col, row, id: col * 131 + row * 17, edge, u, v };
}
const PLOUGHED_ID = cellJS(...PLOUGH_AT).id;
const kindJS = (id) => (id === PLOUGHED_ID ? 0 : hashJS(id + 0.5));

/** 0 in the village and near the inn, 1 out on the farms. */
export function farmWeight(x, z) {
  const s = (a, b, t) => Math.min(1, Math.max(0, (t - a) / (b - a)));
  const v = s(VR0, VR1, Math.hypot((x - VX) * 0.9, z - VZ));
  const g = s(GR0, GR1, Math.hypot(x - GX, z - GZ));
  return v * g;
}

/** The paddock at (x, z): its id, distance to its edge (m), and whether it's ploughed. */
export function paddock(x, z) {
  const c = cellJS(x, z);
  const k = kindJS(c.id);
  return { ...c, ploughed: k < PLOUGH_P && farmWeight(x, z) > 0.5 };
}

/**
 * GPU: vec4(ploughed 0..1, hay 0..1, distance to the nearest hedged paddock edge in m (far away
 * outside the farms), the paddock's own tone -0.5..0.5) for world xz, already faded by the farm weight.
 */
export const paddockNode = Fn(([xz]) => {
  const u = xz.x.mul(CA).add(xz.y.mul(SA)), v = xz.x.mul(-SA).add(xz.y.mul(CA));
  const col = floor(u.div(CW));
  const off = hashTSL(col.mul(7.3).add(11)).mul(90), rowH = hashTSL(col.mul(3.1).add(5)).mul(65).add(55);
  const vv = v.add(off);
  const row = floor(vv.div(rowH));
  const fu = fract(u.div(CW)), fv = vv.div(rowH).sub(row);
  // Only some boundaries carry a hedgerow (the rest are fences or open), each its whole length.
  const eu = min(fu.mul(CW), float(1).sub(fu).mul(CW)), ev = min(fv.mul(rowH), float(1).sub(fv).mul(rowH));
  const hu = hashTSL(floor(u.div(CW).add(0.5)).mul(5.7).add(1)).lessThan(0.45);
  const hv = hashTSL(col.mul(31).add(floor(vv.div(rowH).add(0.5))).mul(2.3).add(4)).lessThan(0.4);
  const edge = min(eu, ev);
  const hedgeEdge = min(select(hu, eu, float(999)), select(hv, ev, float(999)));
  const id = col.mul(131).add(row.mul(17));
  const k = select(id.equal(float(PLOUGHED_ID)), float(0), hashTSL(id.add(0.5)));
  const w = smoothstep(VR0, VR1, length(vec2(xz.x.sub(VX).mul(0.9), xz.y.sub(VZ)))).mul(smoothstep(GR0, GR1, length(xz.sub(vec2(GX, GZ)))));
  // A soft headland round each ploughed field, and furrows along its length.
  const ploughed = select(k.lessThan(PLOUGH_P), float(1), float(0)).mul(smoothstep(1.5, 4, edge)).mul(step01(w));
  const hay = select(k.greaterThan(PLOUGH_P).and(k.lessThan(PLOUGH_P + HAY_P)), float(1), float(0)).mul(w);
  const tone = hashTSL(id.add(3.7)).sub(0.5).mul(w);
  return vec4(ploughed, hay, select(w.greaterThan(0.5), hedgeEdge, float(999)), tone);
});

/** GPU: 0..1 across each furrow of a ploughed field (they run along the paddock columns). */
export const furrowNode = (xz) => fract(xz.x.mul(CA).add(xz.y.mul(SA)).div(0.85)).sub(0.5).abs().mul(2);
const step01 = (w) => smoothstep(0.45, 0.55, w);
