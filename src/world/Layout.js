// The Hobbiton layout, built from real geodata (see src/data/hobbiton.json and scripts/):
//   - terrain: LINZ NZ 8 m DEM around the set, and an 80 m grid out to the horizon hills
//   - the lake (Bywater Pool), the Frog Pond, Mill Run and Eel Brook, every named lane and footpath,
//     hedges, fences, the Mill, the Green Dragon and the bridge: OpenStreetMap
// On top of that come the things no dataset records: 44 hobbit holes dug into the banks along the
// real lanes, level building pads, sunken lanes, stream channels and the lake bed.
//
// World units are meters. +x is east, -z is north, +y is up; y = elevation − 138.45 m, so the lake
// surface (140 m) sits at WATER_Y. Bag End is at world (−61, −100).

import GEO from '../data/hobbiton.json';
import { fbm2, smoothstep, lerp, clamp, mulberry32 } from '../util/noise.js';
import { layoutBays, facadeTop } from './FacadeLayout.js';

export const WATER_Y = 1.55;
export const FIELD_Y = 8; // Party Field, ~146.5 m
export const INNER_HALF = 280; // detailed terrain + baked ground maps cover [-INNER_HALF, INNER_HALF]
export const WORLD_HALF = 2500;
export const WALK_RADIUS = 330;
export { GEO };

// ---------------------------------------------------------------------------------------------
// Landmarks from the data

const centroid = (poly) => {
  let x = 0, z = 0;
  const n = poly.length - (poly[0][0] === poly[poly.length - 1][0] && poly[0][1] === poly[poly.length - 1][1] ? 1 : 0);
  for (let i = 0; i < n; i++) { x += poly[i][0]; z += poly[i][1]; }
  return [x / n, z / n];
};
const building = (name) => GEO.buildings.find((b) => b.name === name);
const tree = (name) => GEO.trees.find((t) => t.name === name).p;
const lakePoly = GEO.water.find((w) => w.name === 'Bywater Pool').poly;
const pondPoly = GEO.water.find((w) => w.name === 'Frog Pond').poly;

const [beX, beZ] = centroid(building('Bag End').poly);
const [ptX, ptZ] = tree('The Party Tree');
const [oakX, oakZ] = tree('Big Oak Tree');

export const VILLAGE = { x: -16, z: -65, r: 150 };

export const LANDMARKS = {
  bagEnd: { x: beX, z: beZ },
  bagEndOak: { x: oakX, z: oakZ },
  partyTree: { x: ptX, z: ptZ },
  // The Party Field: the mown lawn between Bagshot Row and the Party Tree (about 55 × 60 m).
  partyField: { x: 8, z: -72, rx: 30, rz: 28, rot: 0.3 },
  // Start on the lake path below the Party Tree, looking up at Bag End.
  spawn: { x: 52, z: -36, yaw: 1.05 },
};

// ---------------------------------------------------------------------------------------------
// Terrain from the DEM

function makeGrid(g) {
  return { ...g, h: Float32Array.from(g.h) };
}
const DEM_SET = makeGrid(GEO.demSet);
const DEM_WIDE = GEO.demWide ? makeGrid(GEO.demWide) : null;

// Catmull-Rom interpolation keeps the 8 m grid smooth (no creases along cell edges).
function cr(p0, p1, p2, p3, t) {
  return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
}
function sampleDEM(g, x, z) {
  const fx = (x - g.x0) / g.step, fz = (z - g.z0) / g.step;
  const i = Math.floor(fx), j = Math.floor(fz);
  const tx = fx - i, tz = fz - j;
  const at = (a, b) => g.h[clamp(b, 0, g.nz - 1) * g.nx + clamp(a, 0, g.nx - 1)];
  const row = (b) => cr(at(i - 1, b), at(i, b), at(i + 1, b), at(i + 2, b), tx);
  return cr(row(j - 1), row(j), row(j + 1), row(j + 2), tz);
}
function demWeight(g, x, z, margin) {
  const ex = Math.min(x - g.x0, g.x0 + (g.nx - 1) * g.step - x);
  const ez = Math.min(z - g.z0, g.z0 + (g.nz - 1) * g.step - z);
  return smoothstep(0, margin, Math.min(ex, ez));
}
// The 8 m survey smooths the set's hand-sculpted banks into a gentle slope; on site (and on film)
// the Hill reads much steeper. Relief above the lake is exaggerated to match photographs.
const RELIEF = 1.4;
let GD_BANK = null; // set once the Green Dragon is placed

function rawDEM(x, z) {
  const wSet = demWeight(DEM_SET, x, z, 40);
  const wide = DEM_WIDE ? sampleDEM(DEM_WIDE, x, z) : 0;
  if (wSet <= 0) return wide;
  const set = sampleDEM(DEM_SET, x, z);
  return lerp(wide, set, wSet);
}
function demHeight(x, z) {
  const h = rawDEM(x, z);
  return h > WATER_Y ? WATER_Y + (h - WATER_Y) * RELIEF : h;
}

/**
 * The set dressing no survey captures: the hillside cut into level terraces with steep grassy
 * banks between them, and Bag End's knoll rising steeply under the oak.
 */
function sculpt(x, z, h) {
  // Terraces across the village: flat benches (60% of each rise) and steep banks.
  const vx = x - (beX + 45), vz = z - (beZ + 35);
  const village = 1 - smoothstep(95, 150, Math.hypot(vx * 0.85, vz));
  const shore = smoothstep(6, 22, lakeDist(x, z));
  // Only the ground the village is built on is terraced; open slopes between lanes stay natural.
  const near = 1 - smoothstep(9, 22, sampleGrid(laneDist, x, z, 99));
  const knoll = smoothstep(26, 40, Math.hypot(x - oakX, z - oakZ)); // Bag End's knoll stays smooth
  const w = village * shore * near * knoll * 0.8;
  if (w > 0.001 && h > FIELD_Y - 2) {
    const T = 3.2;
    // Wobble the terrace lines so they follow the land rather than exact contours.
    const hh = h + fbm2(x / 45, z / 45, 2) * 1.2;
    const f = hh / T, i = Math.floor(f), t = f - i;
    const stepped = (i + smoothstep(0.55, 0.95, t)) * T - fbm2(x / 45, z / 45, 2) * 1.2;
    h = lerp(h, stepped, w * 0.85);
  }
  // The steep grassy bank that rises behind the Green Dragon (away from the bridge), with its
  // paddock fences along the top.
  if (GD_BANK) {
    const dx = x - GD_BANK.x, dz = z - GD_BANK.z;
    const back = -(dx * GD_BANK.fx + dz * GD_BANK.fz), side = dx * GD_BANK.fz - dz * GD_BANK.fx;
    const dp = polyDistSimple(GD_BANK.poly, x, z);
    h += 17 * smoothstep(5, 30, dp) * smoothstep(-6, 8, back) * (1 - smoothstep(40, 80, Math.abs(side)));
  }
  // Bag End's knoll: the oak crowns a steep, rounded hill right behind the house.
  const kd = Math.hypot(x - oakX, z - oakZ);
  h += 10.5 * Math.exp(-((kd / 21) ** 2.1));
  return h;
}

// ---------------------------------------------------------------------------------------------
// Baked fields over the inner region (0.5 m): lane distance/width, stream distance/bed, yards, beds.

const RES = 0.5;
const N = Math.round((INNER_HALF * 2) / RES);
const laneDist = new Float32Array(N * N).fill(99);
const laneWidth = new Float32Array(N * N).fill(0);
const streamDist = new Float32Array(N * N).fill(99);
const streamBed = new Float32Array(N * N).fill(0);
const laneHeight = new Float32Array(N * N).fill(0); // surface height of the nearest lane
const yardGrid = new Uint8Array(N * N);
const bedGrid = new Uint8Array(N * N);

function bakePolyline(pts, width, dist, widthOut, values, valueOut, reach = width * 0.5 + 16) {
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach + INNER_HALF) / RES));
    const i1 = Math.min(N - 1, Math.ceil((Math.max(ax, bx) + reach + INNER_HALF) / RES));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - reach + INNER_HALF) / RES));
    const j1 = Math.min(N - 1, Math.ceil((Math.max(az, bz) + reach + INNER_HALF) / RES));
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz || 1e-6;
    for (let j = j0; j <= j1; j++) {
      const z = j * RES - INNER_HALF;
      for (let i = i0; i <= i1; i++) {
        const x = i * RES - INNER_HALF;
        const t = clamp(((x - ax) * dx + (z - az) * dz) / len2, 0, 1);
        const px = ax + dx * t - x, pz = az + dz * t - z;
        const d = Math.sqrt(px * px + pz * pz) + (widthOut ? Math.sin(x * 0.21 + z * 0.13) * 0.15 : 0);
        const k = j * N + i;
        // Lanes compare edges (a wide lane wins over a narrow one it overlaps); plain fields compare centers.
        if (widthOut ? d - width * 0.5 < dist[k] - widthOut[k] * 0.5 : d < dist[k]) {
          dist[k] = d;
          if (widthOut) widthOut[k] = width;
          if (values) valueOut[k] = values[s] + (values[s + 1] - values[s]) * t;
        }
      }
    }
  }
}

function sampleGrid(grid, x, z, fallback) {
  const fx = (x + INNER_HALF) / RES, fz = (z + INNER_HALF) / RES;
  if (fx < 0 || fz < 0 || fx >= N - 1 || fz >= N - 1) return fallback;
  const i = Math.floor(fx), j = Math.floor(fz);
  const tx = fx - i, tz = fz - j;
  const k = j * N + i;
  return lerp(lerp(grid[k], grid[k + 1], tx), lerp(grid[k + N], grid[k + N + 1], tx), tz);
}

// Lanes: every footway, path, track and service road in the data. Bridges are drawn separately;
// the Bagshot Row walk-through tunnels are inside hobbit holes, so they aren't lanes.
// Footways on the set are narrow compacted-clay tracks.
const LANE_WIDTH = { footway: 2.0, path: 1.3, steps: 1.4, track: 2.8, service: 3.6 };
export const LANES = GEO.paths.filter((p) => !p.bridge && !p.tunnel).map((p) => ({ ...p, width: LANE_WIDTH[p.kind] ?? p.width }));
for (const lane of LANES) bakePolyline(lane.pts, lane.width, laneDist, laneWidth);

/** 0..1 coverage of gravel lane at (x, z). */
export function laneMask(x, z) {
  const d = sampleGrid(laneDist, x, z, 99);
  if (d > 12) return 0;
  const w = sampleGrid(laneWidth, x, z, 2.5) || 2.5;
  return 1 - smoothstep(w * 0.5 - 0.35, w * 0.5 + 0.45, d);
}

// ---------------------------------------------------------------------------------------------
// Water: signed distance to the lake and pond shorelines (negative inside), on a 1 m grid.

function polySDF(poly, margin, res = 1) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const [x, z] of poly) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  minX -= margin; minZ -= margin; maxX += margin; maxZ += margin;
  const nx = Math.ceil((maxX - minX) / res) + 1, nz = Math.ceil((maxZ - minZ) / res) + 1;
  const d = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = minX + i * res, z = minZ + j * res;
      let best = Infinity, inside = false;
      for (let k = 0, m = poly.length - 1; k < poly.length; m = k++) {
        const [ax, az] = poly[m], [bx, bz] = poly[k];
        if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
        const dx = bx - ax, dz = bz - az;
        const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1e-6), 0, 1);
        const px = ax + dx * t - x, pz = az + dz * t - z;
        best = Math.min(best, px * px + pz * pz);
      }
      d[j * nx + i] = (inside ? -1 : 1) * Math.sqrt(best);
    }
  return { x0: minX, z0: minZ, res, nx, nz, d, margin };
}
function sampleSDF(s, x, z) {
  const fx = (x - s.x0) / s.res, fz = (z - s.z0) / s.res;
  if (fx < 0 || fz < 0 || fx >= s.nx - 1 || fz >= s.nz - 1) return s.margin;
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * s.nx + i;
  return lerp(lerp(s.d[k], s.d[k + 1], tx), lerp(s.d[k + s.nx], s.d[k + s.nx + 1], tx), tz);
}
export const LAKE_SDF = polySDF(lakePoly, 30);
export const POND_SDF = polySDF(pondPoly, 10);
// The pond sits a little higher than the lake; take its level from the DEM at its middle.
export const POND_Y = (() => {
  const [cx, cz] = centroid(pondPoly);
  return demHeight(cx, cz) - 0.15;
})();

/** Signed distance (m) to the lake shore, negative over water. */
export const lakeDist = (x, z) => sampleSDF(LAKE_SDF, x, z);
export const pondDist = (x, z) => sampleSDF(POND_SDF, x, z);

/** 0 on dry land, 1 in open water (lake or pond); used for the shore and for walking. */
export function lakeFactor(x, z) {
  return 1 - smoothstep(-2.5, 0.5, Math.min(lakeDist(x, z), pondDist(x, z)));
}

// Streams: Mill Run leaves the lake at the bridge heading west; Eel Brook comes in from the east.
// Culverted stretches stay underground.
export const STREAMS = GEO.streams.filter((s) => !s.culvert).map((s) => ({ ...s, width: s.name === 'Mill Run' ? 4.5 : 2.4 }));
for (const s of STREAMS) {
  // Bed follows the land about a meter down and never runs uphill in the direction of flow.
  const bed = s.pts.map(([x, z]) => demHeight(x, z) - 1.0);
  for (let i = 1; i < bed.length; i++) bed[i] = Math.min(bed[i], bed[i - 1] - 0.01);
  s.bed = bed;
  bakePolyline(s.pts, s.width, streamDist, null, bed, streamBed, 40);
}
/** 0..1: inside a stream channel. */
export function streamMask(x, z) {
  return 1 - smoothstep(1.2, 2.8, sampleGrid(streamDist, x, z, 99));
}
/** Water surface height of the nearest stream. */
export function streamWaterAt(x, z) {
  return sampleGrid(streamBed, x, z, WATER_Y - 1) + 0.55;
}
// Legacy single-stream view for code that draws one ribbon (the Mill Run).
export const STREAM = STREAMS.find((s) => s.name === 'Mill Run');

// ---------------------------------------------------------------------------------------------
// The Mill, the bridge and the Green Dragon, from their mapped footprints.

function footprint(poly) {
  // Oriented bounding box by the longest edge direction.
  const [cx, cz] = centroid(poly);
  let best = null;
  for (let k = 0; k < poly.length - 1; k++) {
    const dx = poly[k + 1][0] - poly[k][0], dz = poly[k + 1][1] - poly[k][1], l = Math.hypot(dx, dz);
    if (!best || l > best.l) best = { l, ux: dx / l, uz: dz / l };
  }
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (const [x, z] of poly) {
    const a = (x - cx) * best.ux + (z - cz) * best.uz, b = -(x - cx) * best.uz + (z - cz) * best.ux;
    a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b);
  }
  const mx = cx + best.ux * (a0 + a1) / 2 - best.uz * (b0 + b1) / 2;
  const mz = cz + best.uz * (a0 + a1) / 2 + best.ux * (b0 + b1) / 2;
  return { x: mx, z: mz, ux: best.ux, uz: best.uz, len: a1 - a0, wid: b1 - b0 };
}
const avgDEM = (x, z, r) => {
  let s = 0, n = 0;
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) { s += demHeight(x + (i * r) / 2, z + (j * r) / 2); n++; }
  return s / n;
};

export const BRIDGE = (() => {
  const [[ax, az], [bx, bz]] = GEO.bridgeLine; // west (mill) end → east (Green Dragon) end
  const cx = (ax + bx) / 2, cz = (az + bz) / 2, len = Math.hypot(bx - ax, bz - az);
  const dx = (bx - ax) / len, dz = (bz - az) / len;
  const half = len / 2, width = 3.2;
  const end0 = demHeight(ax, az), end1 = demHeight(bx, bz);
  // A low, gently humped deck (the set's bridge is nearly level), clearing two small arches.
  const crown = Math.max(end0, end1, WATER_Y + 1.6) + 0.55;
  return { x: cx, z: cz, dx, dz, half, width, water: WATER_Y, end0, end1, crown, yaw: Math.atan2(-dz, dx) };
})();

/** Deck height of the bridge at `t` meters along it (−half..half). */
export function bridgeDeck(t) {
  const B = BRIDGE, k = t / B.half;
  const ends = lerp(B.end0, B.end1, (k + 1) / 2);
  return ends + (B.crown - ends) * (1 - k * k) * (1 - 0.35 * k * k);
}

export const MILL = (() => {
  const f = footprint(building("Sandyman's Mill").poly);
  // Face the building's long side toward the water; the wheel turns on that side.
  let px = -f.uz, pz = f.ux;
  if (lakeDist(f.x + px * 8, f.z + pz * 8) > lakeDist(f.x - px * 8, f.z - pz * 8)) { px = -px; pz = -pz; }
  const y = avgDEM(f.x, f.z, 8) + 0.2;
  // Local +z points away from the water (the door side).
  return { x: f.x, z: f.z, y, len: f.len, wid: f.wid, water: WATER_Y, yaw: Math.atan2(-px, -pz), wx: px, wz: pz };
})();

const polyDistSimple = (poly, x, z) => {
  let best = Infinity, inside = false;
  for (let k = 0, m = poly.length - 1; k < poly.length; m = k++) {
    const [ax, az] = poly[m], [bx, bz] = poly[k];
    if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
    const dx = bx - ax, dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1e-6), 0, 1);
    best = Math.min(best, (ax + dx * t - x) ** 2 + (az + dz * t - z) ** 2);
  }
  return (inside ? -1 : 1) * Math.sqrt(best);
};

export const GREEN_DRAGON = (() => {
  const g = building('The Green Dragon Inn');
  const shed = GEO.buildings.find((b) => b.kind === 'shed').poly;
  const f = footprint(g.poly);
  // The front faces the bridge.
  const tx = BRIDGE.x + BRIDGE.dx * BRIDGE.half - f.x, tz = BRIDGE.z + BRIDGE.dz * BRIDGE.half - f.z;
  let fx = -f.uz, fz = f.ux;
  if (fx * tx + fz * tz < 0) { fx = -fx; fz = -fz; }
  // Floor level: the ground at the main entrance side, so the building steps nowhere.
  const [sx, sz] = centroid(shed);
  return {
    x: f.x, z: f.z, y: avgDEM(f.x, f.z, 12) + 0.15, fx, fz, yaw: Math.atan2(fx, fz), w: f.len, d: f.wid, poly: g.poly,
    shed, shedY: demHeight(sx, sz) + 0.15,
  };
})();

{
  // "Behind" = away from the bridge, whichever way the inn's long walls run.
  const bx = BRIDGE.x + BRIDGE.dx * BRIDGE.half, bz = BRIDGE.z + BRIDGE.dz * BRIDGE.half;
  const fx = bx - GREEN_DRAGON.x, fz = bz - GREEN_DRAGON.z, l = Math.hypot(fx, fz);
  GD_BANK = { x: GREEN_DRAGON.x, z: GREEN_DRAGON.z, fx: fx / l, fz: fz / l, poly: GREEN_DRAGON.poly };
}

// Level pads for buildings, applied last in heightAt.
const PADS = [
  { x: MILL.x, z: MILL.z, r0: 9, r1: 13, y: MILL.y },
  { poly: GREEN_DRAGON.poly, r0: 2.5, r1: 9, y: GREEN_DRAGON.y },
  { poly: GREEN_DRAGON.shed, r0: 1.5, r1: 5, y: GREEN_DRAGON.shedY },
];

// ---------------------------------------------------------------------------------------------
// Lane profiles
//
// On the set the lanes run level along the hillside, terraced into it, and climb in short flights
// of stone steps. Each lane gets a height profile along its length: it follows the (smoothed) land
// at no more than a gentle grade, and when the land has pulled more than STAIR_TRIGGER away, the
// difference is taken up at once by a flight of steps. Across its width a lane is level; the land
// is cut into a bank above it and built up below it (see baseHeight).

const LANE_GRADE = 0.07, STAIR_TRIGGER = 1.3, STAIR_GRADE = 0.62;
export const LANE_STAIRS = []; // { pts: [[x,z]...], y0, y1, width }

function resample(pts, step) {
  const out = [];
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

{
  const baked = new Uint8Array(N * N); // cells whose laneHeight is final
  const cell = (x, z) => {
    const i = Math.round((x + INNER_HALF) / RES), j = Math.round((z + INNER_HALF) / RES);
    return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i;
  };
  const fixedPts = [];
  for (const [t, y] of [[-BRIDGE.half, BRIDGE.end0], [BRIDGE.half, BRIDGE.end1]])
    fixedPts.push({ x: BRIDGE.x + BRIDGE.dx * t, z: BRIDGE.z + BRIDGE.dz * t, y: y + 0.05 });

  laneDist.fill(99);
  laneWidth.fill(0);
  // Long lanes first; shorter ones join them at the heights already set.
  const order = [...LANES].sort((a, b) => b.pts.length - a.pts.length);
  for (const lane of order) {
    const pts = resample(lane.pts, 1);
    const n = pts.length;
    const nat = pts.map(([x, z]) => naturalHeight(x, z));
    // Smoothed land.
    const t = nat.map((_, i) => {
      let sum = 0, w = 0;
      for (let k = -5; k <= 5; k++) {
        const j = Math.min(n - 1, Math.max(0, i + k)), g = Math.exp(-(k * k) / 12);
        sum += nat[j] * g; w += g;
      }
      return sum / w;
    });
    // Junctions with lanes already laid, and the bridge ends, are fixed.
    const fixed = new Array(n).fill(null);
    pts.forEach(([x, z], i) => {
      const c = cell(x, z);
      if (c >= 0 && baked[c] && laneDist[c] < laneWidth[c] * 0.5 + 0.8) fixed[i] = laneHeight[c];
      for (const f of fixedPts) if (Math.hypot(x - f.x, z - f.z) < 2.5) fixed[i] = f.y;
    });
    // Pull the target toward fixed heights over the approach to them.
    for (let i = 0; i < n; i++) {
      if (fixed[i] === null) continue;
      for (let k = -10; k <= 10; k++) {
        const j = i + k;
        if (j < 0 || j >= n || fixed[j] !== null) continue;
        const w = 1 - Math.abs(k) / 11;
        t[j] = lerp(t[j], fixed[i], w * w);
      }
    }
    // Walk the lane: gentle grade, flights of steps when the land runs away.
    const prof = new Array(n);
    const stair = new Array(n).fill(false);
    prof[0] = fixed[0] ?? t[0];
    let climbing = false;
    for (let i = 1; i < n; i++) {
      if (fixed[i] !== null) { prof[i] = fixed[i]; climbing = false; continue; }
      const gap = t[i] - prof[i - 1];
      if (Math.abs(gap) > STAIR_TRIGGER) climbing = true;
      if (climbing && Math.abs(gap) < 0.1) climbing = false;
      const g = climbing ? STAIR_GRADE : LANE_GRADE;
      prof[i] = prof[i - 1] + clamp(gap, -g, g);
      stair[i] = climbing;
    }
    lane.profile = prof;
    lane.samples = pts;
    // Record flights of steps.
    for (let i = 1; i < n; i++) {
      if (!stair[i] || stair[i - 1]) continue;
      let j = i;
      while (j + 1 < n && stair[j + 1]) j++;
      if (Math.abs(prof[j] - prof[i - 1]) > 0.35) LANE_STAIRS.push({ pts: pts.slice(i - 1, j + 1), ys: prof.slice(i - 1, j + 1), width: lane.width });
      i = j;
    }
    bakePolyline(pts, lane.width, laneDist, laneWidth, prof, laneHeight);
    for (let k = 0; k < N * N; k++) if (!baked[k] && laneDist[k] < 99) baked[k] = 1;
  }
}

/** Nearest lane's surface height and signed distance from its edge (negative on the lane). */
function laneAt(x, z) {
  const d = sampleGrid(laneDist, x, z, 99);
  if (d > 30) return null;
  const w = sampleGrid(laneWidth, x, z, 2) || 2;
  return { y: sampleGrid(laneHeight, x, z, 0), edge: d - w * 0.5 };
}

// ---------------------------------------------------------------------------------------------
// Height (without hobbit holes yet; they're dug below once placed)

function naturalHeight(x, z) {
  let h = sculpt(x, z, demHeight(x, z));
  // The DEM is 8 m data: add the small undulations of sheep-grazed pasture.
  h += fbm2(x / 34 + 11, z / 34 - 4, 3) * 0.45 + fbm2(x / 9, z / 9, 2) * 0.08;

  // The lake: a shelving bed inside the shoreline; banks at least a hand above the water.
  const ld = lakeDist(x, z);
  if (ld < 12) {
    if (ld < 0) h = Math.min(h, WATER_Y - 0.35 - Math.min(-ld * 0.14, 1.8));
    else h = lerp(Math.max(h, WATER_Y + 0.12 + ld * 0.05), h, smoothstep(2, 12, ld));
  }
  const pd = pondDist(x, z);
  if (pd < 6) {
    if (pd < 0) h = Math.min(h, POND_Y - 0.3 - Math.min(-pd * 0.2, 0.8));
    else h = lerp(Math.max(h, POND_Y + 0.1 + pd * 0.06), h, smoothstep(1, 6, pd));
  }
  return h;
}

function baseHeight(x, z) {
  let h = naturalHeight(x, z);
  const lane = laneAt(x, z);
  if (lane) {
    // The lane is level at its profile height; the land meets it in a bank whose width grows with
    // the height difference (about 40 degrees), cut above and built up below.
    const surf = lane.y - 0.1;
    const bank = 0.4 + Math.abs(h - surf) * 1.2;
    h = lerp(surf, h, smoothstep(0, bank, lane.edge));
  }
  // Streams run in small valleys: a channel, then gentle banks rising away from it.
  const sd = sampleGrid(streamDist, x, z, 99);
  if (sd < 30) {
    const bed = sampleGrid(streamBed, x, z, h);
    const hw = 2.0;
    const bank = bed + smoothstep(hw - 1.0, hw + 0.6, sd) * 0.7 + Math.max(0, sd - hw) * 0.25;
    const k = 1 - smoothstep(18, 30, sd);
    const m = 1.2, hv = Math.max(m - Math.abs(h - bank), 0) / m;
    h = lerp(h, Math.min(h, bank) - hv * hv * m * 0.25, k);
  }
  for (const p of PADS) {
    const d = p.poly ? Math.max(0, polyDistSimple(p.poly, x, z)) : Math.hypot(x - p.x, z - p.z);
    if (d < p.r1) h = lerp(h, p.y, 1 - smoothstep(p.r0, p.r1, d));
  }
  return h;
}

// ---------------------------------------------------------------------------------------------
// Hobbit holes
//
// The set has 44. Bag End and the three Bagshot Row holes sit where the data puts them; the rest
// are dug into the banks along the real lanes, spaced out, preferring steep banks (as on the set,
// where each hole is cut into the hillside with its garden terraced in front).
// Local frame of a hole: u points from the door toward the lane, v runs along the facade.

export const HOLES = [];
export const HOLE_COUNT = 44;

const DOORS = [0x2e6aa8, 0xd8b23a, 0xa8322a, 0xd48aa0, 0x2f6b3a, 0x2f8f8a, 0x3d5a8a, 0xb84a2a, 0x6b8a3a];
const PLASTERS = [0xc99a3e, 0xd4ab58, 0xbf8f3c, 0xd9bf7e, 0xb89656, 0xc7a468];
const FRAMES = [0x2f6b3a, 0x7a3a2a, 0x3a4a6a, 0xe8e2d0, 0x5c4330];

function holeSpec(rand, o) {
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const scale = o.scale ?? 1;
  const nWin = o.bays ? 0 : o.poor ? (rand() < 0.5 ? 0 : 1) : rand() < 0.7 ? 2 : 1;
  const bays = o.bays || (() => {
    const win = () => ({ kind: rand() < 0.2 ? 'bigwindow' : 'window', w: 1.35 + rand() * 0.35 });
    const list = [{ kind: 'door', w: 2.7 }];
    if (nWin >= 1) (rand() < 0.5 ? list.unshift : list.push).call(list, win());
    if (nWin >= 2) (list[0].kind === 'door' ? list.unshift : list.push).call(list, win());
    return list;
  })();
  const spec = {
    scale, bays,
    doorR: o.doorR ?? 0.95,
    doorColor: o.doorColor ?? pick(DOORS),
    plaster: o.plaster ?? pick(PLASTERS),
    frame: o.frame ?? pick(FRAMES),
    arch: o.arch ?? (rand() < 0.6 ? 'brick' : rand() < 0.5 ? 'stone' : 'none'),
    windowStyle: o.windowStyle ?? (rand() < 0.6 ? 'grid' : 'cross'),
    knob: o.knob ?? (rand() < 0.3 ? 'center' : rand() < 0.5 ? 'left' : 'right'),
    lit: o.lit ?? rand() < 0.75,
    fence: o.fence,
    seed: Math.floor(rand() * 1e6),
  };
  const laid = layoutBays(spec);
  spec.width = (laid[laid.length - 1].b - laid[0].a) * scale;
  spec.center = ((laid[0].a + laid[laid.length - 1].b) / 2) * scale;
  // The turf dome must stand above the facade's hood everywhere.
  const rv = spec.width / 2 + 1.6;
  let H = 0;
  for (let v = laid[0].a; v <= laid[laid.length - 1].b; v += 0.1) {
    const q = 1 - ((v * scale - spec.center) / rv) ** 2;
    H = Math.max(H, ((facadeTop(laid, v) + 0.2) * scale) / Math.sqrt(Math.max(q, 0.05)));
  }
  spec.crown = H - 1.15;
  return spec;
}

/** Height of the turf dome above the yard at (v across the facade, d behind it). */
export function moundTop(hole, v, d = 0) {
  const rv = hole.width / 2 + 1.6, rd = 8 * Math.max(hole.scale, 0.7);
  const q = 1 - ((v - (hole.center || 0)) / rv) ** 2 - (Math.max(d, 0) / rd) ** 2;
  return q > 0 ? (1.15 * hole.scale + hole.crown) * Math.sqrt(q) : 0;
}
export function holeLocal(hole, dx, dz) {
  if (hole.arc) {
    // Curved facade: polar coordinates around a center behind the door. u is meters in front of
    // the facade line, v is arc length along it.
    const R = hole.arc.R;
    const px = dx + hole.fx * R, pz = dz + hole.fz * R;
    const r = Math.hypot(px, pz) || 1e-6;
    const a = Math.atan2(px * hole.fz - pz * hole.fx, px * hole.fx + pz * hole.fz);
    return [r - R, a * R];
  }
  return [dx * hole.fx + dz * hole.fz, dx * hole.fz - dz * hole.fx];
}
const smax = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
};
function holeCut(hole, dx, dz, h) {
  const [u, v0] = holeLocal(hole, dx, dz);
  const v = v0 - hole.center;
  const hw = hole.width / 2;
  if (hole.segSpans && u > -2 && u < 4) {
    // Between Bag End's facade segments (and past its ends) the turf bulges forward, level with the
    // hoods, and slopes down to the terrace.
    let gap = Infinity;
    for (const [a, b] of hole.segSpans) gap = Math.min(gap, Math.max(a - v0, v0 - b, 0));
    const first = hole.segSpans[0][0], last = hole.segSpans[hole.segSpans.length - 1][1];
    if (gap > 0.02 && v0 > first - 4 && v0 < last + 4) {
      const bulge = hole.y + Math.min(2.5 + gap * 2.2, 3.9) - Math.max(0, u + 0.3) * 1.1;
      h = Math.max(bulge, hole.y);
      if (u < 0.8) return h;
    }
  }
  if (u > -0.6) {
    const lat = 1 - smoothstep(hw + 0.6, hw + (hole.arc ? 9 : 4), Math.abs(v));
    const front = 1 - smoothstep(hole.yard + 0.2, hole.yard + 1.8, u);
    let target = hole.y;
    if (hole.terrace && u > hole.terrace) {
      // Below the retaining wall the garden slopes down to the lane.
      const t = smoothstep(hole.terrace, hole.yard + 0.5, u);
      target = lerp(hole.y - 0.9, hole.laneY + 0.1, t);
    }
    // Bag End's grounds stop at the lanes around them (except at its own gate).
    const keepLane = hole.arc && Math.abs(v0) > 2.5 ? 1 - laneMask(hole.x + dx * 0 + dx, hole.z + dz * 0 + dz) : 1;
    return lerp(h, target, lat * front * keepLane);
  }
  if (hole.arc) {
    // Behind a curved facade the knoll carries the turf; just make sure it clears the facade.
    const cover = hole.y + 3.9 * (1 - smoothstep(4, 16, -u)) * (1 - smoothstep(hw - 1, hw + 9, Math.abs(v)));
    return smax(h, cover, 1.0);
  }
  const dome = hole.y + moundTop(hole, v0, -u) + 0.2;
  return smax(h, dome, 1.2);
}

function makeHole(rand, x, z, fx, fz, y, yard, o) {
  const spec = holeSpec(rand, o);
  return {
    ...spec, x, z, fx, fz, y, yard, color: spec.doorColor, bagEnd: !!o.bagEnd, name: o.name || '', segments: o.segments,
    yaw: Math.atan2(fx, fz),
    veg: !o.bagEnd && rand() < 0.5,
    reach2: Math.max(yard + 3, spec.width / 2 + 4, 11) ** 2,
  };
}

function nearestOnLanes(x, z, lanes) {
  let best = { d: Infinity };
  for (const lane of lanes)
    for (let s = 0; s < lane.pts.length - 1; s++) {
      const [ax, az] = lane.pts[s], [bx, bz] = lane.pts[s + 1];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-6;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
      const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(px - x, pz - z);
      if (d < best.d) best = { d, x: px, z: pz, lane };
    }
  return best;
}

{
  const rand = mulberry32(4401);
  const village = LANES.filter((l) => ['footway', 'path', 'steps'].includes(l.kind));
  const tooClose = (x, z, r) => HOLES.some((o) => Math.hypot(o.x - x, o.z - z) < r);

  // Bag End: at its mapped spot, facing east-south-east onto Bagshot Row, raised above its gate.
  {
    const lane = nearestOnLanes(beX, beZ, village.filter((l) => l.name === 'Bagshot Row'));
    let fx = lane.x - beX, fz = lane.z - beZ;
    const l = Math.hypot(fx, fz); fx /= l; fz /= l;
    const laneY = baseHeight(lane.x, lane.z);
    // The mapped point is the building; the front door sits 7 m further into the knoll, leaving room
    // for the garden terrace, the retaining wall and the steps down to the gate.
    const back = 7;
    HOLES.push(makeHole(rand, beX - fx * back, beZ - fz * back, fx, fz, laneY + 2.5, l + back - 1.3, {
      bagEnd: true, name: 'Bag End', doorColor: 0x2b7352, knob: 'center', plaster: 0xe0b656, frame: 0x2f6b3a, arch: 'brick',
      windowStyle: 'grid', doorR: 1.02, lit: true, fence: 'wattle',
      // Segments of the facade set around the curve of the dome, left to right as seen from the
      // lane: two small round windows, the arched study bay, a round window, then the door between
      // two small windows, and a last round window. v = arc position of each segment's origin.
      segments: [
        { v: -12.6, bays: [{ kind: 'small', w: 0.95 }, { kind: 'small', w: 0.95 }] },
        { v: -8.2, bays: [{ kind: 'wall', w: 0.7 }, { kind: 'bay', w: 2.5 }, { kind: 'wall', w: 0.7 }] },
        { v: -4.6, bays: [{ kind: 'window', w: 1.35 }] },
        { v: 0, bays: [{ kind: 'small', w: 1.05 }, { kind: 'door', w: 2.8 }, { kind: 'small', w: 1.05 }] },
        { v: 4.1, bays: [{ kind: 'window', w: 1.4 }] },
        { v: 7.4, bays: [{ kind: 'small', w: 1.0 }, { kind: 'window', w: 1.3 }] },
      ],
      bays: [{ kind: 'small', w: 1.05 }, { kind: 'door', w: 2.8 }, { kind: 'small', w: 1.05 }],
    }));
    const be = HOLES[0];
    be.arc = { R: 13 };
    be.segSpans = be.segments.map((seg) => {
      const laid = layoutBays({ bays: seg.bays, doorR: 1.02 });
      return [seg.v + laid[0].a, seg.v + laid[laid.length - 1].b];
    });
    be.width = 22; // arc span of the segments (−13.6 … +8.7)
    be.center = -2.45;
    be.reach2 = 34 * 34;
    // A level terrace in front of the door, a dry-stone retaining wall, then a slope with steps.
    be.terrace = 4.6;
    be.laneY = laneY;
  }

  // Bagshot Row: the two walk-through interiors (mapped as tunnels) and Sam's yellow door between.
  {
    const tunnels = GEO.paths.filter((p) => p.tunnel);
    const lower = village.filter((l) => l.name === 'Bagshot Row');
    // Two mapped doors (the tunnel entrances) and the third a door's width further along the row.
    const doors = tunnels.map((t) => t.pts[0]).sort((a, b) => a[0] - b[0]);
    doors.push([2 * doors[1][0] - doors[0][0], 2 * doors[1][1] - doors[0][1]]);
    const opts = [
      { doorColor: 0xa8322a, name: '40 Bagshot Row', fence: 'rail' },
      { doorColor: 0xd8b23a, name: "Sam's", fence: 'picket', knob: 'center' },
      { doorColor: 0x2e6aa8, name: 'Bagshot Row', fence: 'rail' },
    ];
    doors.forEach(([dx, dz], i) => {
      const lane = nearestOnLanes(dx, dz, lower);
      let fx = lane.x - dx, fz = lane.z - dz;
      const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l;
      const x = dx - fx * 0.5, z = dz - fz * 0.5;
      HOLES.push(makeHole(rand, x, z, fx, fz, baseHeight(lane.x, lane.z) + 0.3, Math.max(3.5, l + 0.5 - lane.lane.width / 2 - 0.4), opts[i]));
    });
  }

  // The rest: candidates every few meters along the village lanes, scored by how steep the bank is.
  const skip = new Set(['Lakeside', 'Merry Meander', 'Bywater Road', "Gandalf's Cutting"]);
  const cands = [];
  for (const lane of village) {
    if (skip.has(lane.name)) continue;
    const hwLane = lane.width / 2;
    for (let s = 0; s < lane.pts.length - 1; s++) {
      const [ax, az] = lane.pts[s], [bx, bz] = lane.pts[s + 1];
      const seg = Math.hypot(bx - ax, bz - az);
      for (let t = 1; t < seg; t += 2) {
        const px = ax + ((bx - ax) * t) / seg, pz = az + ((bz - az) * t) / seg;
        const tx = (bx - ax) / seg, tz = (bz - az) / seg;
        for (const [nx, nz] of [[-tz, tx], [tz, -tx]]) {
          const off = hwLane + 5.5;
          const x = px + nx * off, z = pz + nz * off;
          const rise = naturalHeight(px + nx * (off + 5), pz + nz * (off + 5)) - naturalHeight(px, pz);
          if (rise < 0.35) continue; // dig into banks, not out of the ground
          cands.push({ x, z, px, pz, nx, nz, off, hwLane, lane, rise, score: Math.min(rise, 4) + rand() * 1.2 });
        }
      }
    }
  }
  cands.sort((a, b) => b.score - a.score);
  for (const c of cands) {
    if (HOLES.length >= HOLE_COUNT) break;
    if (tooClose(c.x, c.z, 10.5)) continue;
    // The slope below Bag End is its garden: no neighbours in front of it.
    {
      const be = HOLES[0], dx = c.x - be.x, dz = c.z - be.z;
      if (Math.hypot(dx, dz) < 34 && dx * be.fx + dz * be.fz > -6) continue;
    }
    if (Math.abs(c.x) > 270 || Math.abs(c.z) > 270) continue;
    if (lakeFactor(c.x, c.z) > 0 || lakeDist(c.x, c.z) < 8) continue;
    // Keep other lanes out of the mound behind and the yard in front, and the facade off the lane.
    const tx = -c.nz, tz = c.nx;
    const probes = [[0, 0], [3, 0], [6, 0], [2, 3.5], [2, -3.5], [-(c.off - c.hwLane - 1.5), 0], [-2, 3], [-2, -3]];
    if (probes.some(([a, b]) => laneMask(c.x + c.nx * a + tx * b, c.z + c.nz * a + tz * b) > 0.02)) continue;
    // Smaller-scale holes (for forced perspective on set) sit further up the slopes.
    const r = rand();
    const scale = r < 0.18 ? 0.62 : r < 0.42 ? 0.85 : 1;
    const laneY = baseHeight(c.px, c.pz);
    HOLES.push(makeHole(rand, c.x, c.z, -c.nx, -c.nz, laneY + 0.3, c.off - c.hwLane - 0.4, { scale, poor: laneY < 6 && rand() < 0.5 }));
  }

  // Door paths from the lane to each door, then the yard and bed masks.
  for (const hole of HOLES) {
    if (hole.arc) {
      // Bag End's garden is lawn and flagstones; only the flight of steps is kept clear.
      const a = [hole.x + hole.fx * (hole.terrace + 0.2) + hole.fz * 0.2, hole.z + hole.fz * (hole.terrace + 0.2) - hole.fx * 0.2];
      const b = [hole.x + hole.fx * (hole.yard + 0.4) + hole.fz * 0.2, hole.z + hole.fz * (hole.yard + 0.4) - hole.fx * 0.2];
      bakePolyline([a, b], 1.6, laneDist, laneWidth, [hole.y - 0.9, hole.laneY + 0.1], laneHeight, 1);
      continue;
    }
    const a = [hole.x + hole.fx * 1.3, hole.z + hole.fz * 1.3];
    const b = [hole.x + hole.fx * (hole.yard + 1.8), hole.z + hole.fz * (hole.yard + 1.8)];
    bakePolyline([a, b], hole.bagEnd ? 1.5 : 1.1, laneDist, laneWidth, [hole.y + 0.1, baseHeight(...b) + 0.1], laneHeight, 2);
  }
  for (const hole of HOLES) {
    const r = Math.sqrt(hole.reach2);
    const i0 = Math.max(0, Math.floor((hole.x - r + INNER_HALF) / RES)), i1 = Math.min(N - 1, Math.ceil((hole.x + r + INNER_HALF) / RES));
    const j0 = Math.max(0, Math.floor((hole.z - r + INNER_HALF) / RES)), j1 = Math.min(N - 1, Math.ceil((hole.z + r + INNER_HALF) / RES));
    const hw = hole.width / 2;
    const vegSide = hole.seed % 2 ? 1 : -1;
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const [u, v0] = holeLocal(hole, i * RES - INNER_HALF - hole.x, j * RES - INNER_HALF - hole.z);
        const v = v0 - hole.center;
        if (u < 0 || u > hole.yard + 0.3 || Math.abs(v) > hw + 1.2) continue;
        const k = j * N + i;
        yardGrid[k] = 255;
        if (hole.arc) continue; // Bag End's beds are planted individually
        if (Math.abs(v0) < 0.9) continue; // the path
        const facadeBed = u < 1.4 && Math.abs(v) > 1.1;
        const fenceBed = u > hole.yard - 1.0;
        const vegBed = hole.veg && v * vegSide > 1.8 && u > 1.8 && u < hole.yard - 1.4;
        if (vegBed) bedGrid[k] = 128;
        else if (facadeBed || fenceBed) bedGrid[k] = 255;
      }
  }
}

// The lawns around the Green Dragon and the Mill are kept short, like the hobbits' yards.
for (const [cx, cz, r] of [[GREEN_DRAGON.x, GREEN_DRAGON.z, 34], [MILL.x, MILL.z, 16]]) {
  const i0 = Math.max(0, Math.floor((cx - r + INNER_HALF) / RES)), i1 = Math.min(N - 1, Math.ceil((cx + r + INNER_HALF) / RES));
  const j0 = Math.max(0, Math.floor((cz - r + INNER_HALF) / RES)), j1 = Math.min(N - 1, Math.ceil((cz + r + INNER_HALF) / RES));
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++)
      if (Math.hypot(i * RES - INNER_HALF - cx, j * RES - INNER_HALF - cz) < r) yardGrid[j * N + i] = 255;
}

export function yardAt(x, z) {
  return sampleGrid(yardGrid, x, z, 0) / 255;
}

/** Final ground height. */
export function heightAt(x, z) {
  let h = baseHeight(x, z);
  for (const hole of HOLES) {
    const dx = x - hole.x, dz = z - hole.z;
    if (dx * dx + dz * dz > hole.reach2) continue;
    h = holeCut(hole, dx, dz, h);
  }
  return h;
}

/** Walkable surfaces above the terrain (the bridge deck). Returns -Infinity where there is none. */
export function surfaceAt(x, z) {
  const B = BRIDGE;
  const dx = x - B.x, dz = z - B.z;
  const t = dx * B.dx + dz * B.dz, w = dx * B.dz - dz * B.dx;
  if (Math.abs(t) < B.half && Math.abs(w) < B.width / 2) return bridgeDeck(t);
  return -Infinity;
}

export function normalAt(x, z, e = 0.75) {
  const hx = heightAt(x + e, z) - heightAt(x - e, z);
  const hz = heightAt(x, z + e) - heightAt(x, z - e);
  const nx = -hx, ny = 2 * e, nz = -hz;
  const l = Math.hypot(nx, ny, nz);
  return [nx / l, ny / l, nz / l];
}

export const LANE_TEXTURE = {
  res: RES, n: N, dist: laneDist, width: laneWidth, stream: streamDist, yard: yardGrid, bed: bedGrid,
};
