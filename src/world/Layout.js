// The Hobbiton layout: landmark positions, lanes and the height function everything else is built on.
// World units are meters. +x is east, -z is north, +y is up. The Hill rises to the north of the
// Party Field so the hobbit-hole doors face the southern sun (the Shire sits around 52°N).

import { fbm2, smoothstep, lerp, clamp } from '../util/noise.js';

export const FIELD_Y = 3.2;
export const WATER_Y = 1.55;
export const INNER_HALF = 280; // detailed terrain + baked lane mask covers [-INNER_HALF, INNER_HALF]
export const WORLD_HALF = 3200;
export const WALK_RADIUS = 420;

export const LANDMARKS = {
  hill: { x: -40, z: -95 },
  bagEnd: { x: -32, z: -60 },
  bagEndOak: { x: -40, z: -80 },
  partyField: { x: -5, z: 20, rx: 46, rz: 30 },
  partyTree: { x: 14, z: 34 },
  lake: { x: 50, z: 52, rx: 50, rz: 29, rot: 0.35 },
  mill: { x: 104, z: -6 },
  bridge: { x: 84, z: 22 },
  greenDragon: { x: 120, z: 44 },
  spawn: { x: -6, z: 52, yaw: 0.23 },
};

// Gravel lanes. Widths in meters.
export const LANES = [
  { width: 3.2, pts: [[118, 36], [100, 30], [84, 22], [68, 14], [50, 6], [30, 2], [14, -2]] },
  { width: 2.6, pts: [[14, -2], [2, -12], [-10, -22], [-22, -28], [-16, -40], [-22, -50], [-30, -54]] },
  { width: 2.2, pts: [[-96, -14], [-66, -16], [-38, -12], [-12, -6], [14, -2]] },
  { width: 2.0, pts: [[-88, -40], [-60, -42], [-36, -38], [-22, -28]] },
  { width: 1.8, pts: [[-76, -64], [-54, -70], [-38, -62], [-30, -54]] },
  { width: 2.4, pts: [[50, 6], [60, -16], [80, -30], [100, -12]] },
  { width: 3.0, pts: [[-96, -14], [-150, -2], [-230, 16], [-320, 8], [-460, -10]] },
  { width: 3.0, pts: [[118, 36], [160, 56], [240, 70], [330, 58], [460, 70]] },
];

// The stream that turns the mill wheel and feeds the lake.
export const STREAM = { width: 5, pts: [[170, -170], [140, -100], [116, -46], [104, -6], [92, 12], [80, 26], [66, 38]] };

// ---------------------------------------------------------------------------------------------
// Lane distance field, baked once over the inner region.

const LANE_RES = 0.5;
const LANE_N = Math.round((INNER_HALF * 2) / LANE_RES);
const laneDist = new Float32Array(LANE_N * LANE_N).fill(99);
const laneWidth = new Float32Array(LANE_N * LANE_N).fill(0);
const streamDist = new Float32Array(LANE_N * LANE_N).fill(99);
const streamBed = new Float32Array(LANE_N * LANE_N).fill(0);

// `values` (optional): one number per point, interpolated along the nearest segment into `valueOut`.
function bakePolyline(pts, width, dist, widthOut, values, valueOut, reach = width * 0.5 + 6) {
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
    const minX = Math.min(ax, bx) - reach, maxX = Math.max(ax, bx) + reach;
    const minZ = Math.min(az, bz) - reach, maxZ = Math.max(az, bz) + reach;
    const i0 = Math.max(0, Math.floor((minX + INNER_HALF) / LANE_RES));
    const i1 = Math.min(LANE_N - 1, Math.ceil((maxX + INNER_HALF) / LANE_RES));
    const j0 = Math.max(0, Math.floor((minZ + INNER_HALF) / LANE_RES));
    const j1 = Math.min(LANE_N - 1, Math.ceil((maxZ + INNER_HALF) / LANE_RES));
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    for (let j = j0; j <= j1; j++) {
      const z = j * LANE_RES - INNER_HALF;
      for (let i = i0; i <= i1; i++) {
        const x = i * LANE_RES - INNER_HALF;
        const t = clamp(((x - ax) * dx + (z - az) * dz) / len2, 0, 1);
        const px = ax + dx * t - x, pz = az + dz * t - z;
        // A little wobble so the lanes don't read as ruler-straight.
        const d = Math.sqrt(px * px + pz * pz) + Math.sin(x * 0.21 + z * 0.13) * 0.25;
        const k = j * LANE_N + i;
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

// Catmull-Rom smoothing so polylines become gentle curves.
function smoothPolyline(pts, sub = 6) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < sub; s++) {
      const t = s / sub, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

for (const lane of LANES) {
  lane.smooth = smoothPolyline(lane.pts);
  bakePolyline(lane.smooth, lane.width, laneDist, laneWidth);
}
STREAM.smooth = smoothPolyline(STREAM.pts);

function sampleGrid(grid, x, z, fallback) {
  const fx = (x + INNER_HALF) / LANE_RES, fz = (z + INNER_HALF) / LANE_RES;
  if (fx < 0 || fz < 0 || fx >= LANE_N - 1 || fz >= LANE_N - 1) return fallback;
  const i = Math.floor(fx), j = Math.floor(fz);
  const tx = fx - i, tz = fz - j;
  const k = j * LANE_N + i;
  const a = lerp(grid[k], grid[k + 1], tx);
  const b = lerp(grid[k + LANE_N], grid[k + LANE_N + 1], tx);
  return lerp(a, b, tz);
}

/** 0..1 coverage of gravel lane at (x, z). */
export function laneMask(x, z) {
  const d = sampleGrid(laneDist, x, z, 99);
  if (d > 12) return 0;
  const w = sampleGrid(laneWidth, x, z, 2.5) || 2.5;
  return 1 - smoothstep(w * 0.5 - 0.35, w * 0.5 + 0.45, d);
}

export function streamMask(x, z) {
  const d = sampleGrid(streamDist, x, z, 99);
  return 1 - smoothstep(STREAM.width * 0.5 - 1.5, STREAM.width * 0.5 + 1.2, d);
}

// ---------------------------------------------------------------------------------------------
// Height

function ellipseDist(x, z, e) {
  const c = Math.cos(e.rot || 0), s = Math.sin(e.rot || 0);
  const dx = x - e.x, dz = z - e.z;
  const u = (dx * c - dz * s) / e.rx, v = (dx * s + dz * c) / e.rz;
  return Math.sqrt(u * u + v * v);
}

/** 0 on dry land, 1 in open water; used for the lake shore. */
export function lakeFactor(x, z) {
  return 1 - smoothstep(0.82, 1.05, ellipseDist(x, z, LANDMARKS.lake));
}

function rawHeight(x, z) {
  const r = Math.hypot(x, z);
  // The surrounding Waikato farmland: lumpy, rounded knolls closing the set into a green bowl,
  // with bigger hills rolling away behind.
  const ring = smoothstep(120, 420, r);
  const k = fbm2(x / 230 + 3.1, z / 230 - 7.7, 4) * 0.5 + 0.55;
  let h = FIELD_Y + Math.pow(Math.max(k, 0), 1.6) * 62 * ring;
  const big = fbm2(x / 1100 - 2.3, z / 1100 + 5.1, 3) * 0.5 + 0.6;
  h += smoothstep(500, 2600, r) * 150 * big;
  h += fbm2(x / 95 + 7, z / 95 + 1, 3) * (1.5 + 7 * ring);
  h += fbm2(x / 38 + 11, z / 38 - 4, 3) * 0.7;

  // The Hill that Bag End is dug into.
  const hl = LANDMARKS.hill;
  const hx = (x - hl.x) / 58, hz = (z - hl.z) / 52;
  h += 31 * Math.exp(-0.5 * (hx * hx + hz * hz));
  // A lower shoulder running east, carrying the second row of hobbit holes.
  const sx = (x - 25) / 55, sz = (z + 60) / 30;
  h += 11 * Math.exp(-0.5 * (sx * sx + sz * sz));
  // Rises behind the Green Dragon and the mill that close the bowl.
  const ex = (x - 215) / 60, ez = (z + 20) / 90;
  h += 18 * Math.exp(-0.5 * (ex * ex + ez * ez));
  const wx = (x + 170) / 80, wz = (z - 60) / 90;
  h += 12 * Math.exp(-0.5 * (wx * wx + wz * wz));

  // The valley floor: the Party Field, the lake, the bridge and the Green Dragon share a broad,
  // nearly level floor a couple of meters above the water, keeping a little of the undulation.
  const vf = 1 - smoothstep(55, 135, Math.hypot((x - 45) * 0.85, z - 38));
  h = lerp(h, FIELD_Y + (h - FIELD_Y) * 0.18, vf);
  return h;
}

// Level pads sit at the average natural height of the ground they replace, so flattening never
// sinks them into a bowl or raises them onto a plinth.
function averageRaw(cx, cz, rx, rz) {
  let sum = 0, n = 0;
  for (let j = -3; j <= 3; j++)
    for (let i = -3; i <= 3; i++) {
      if (i * i + j * j > 9) continue;
      sum += rawHeight(cx + (i / 3) * rx, cz + (j / 3) * rz);
      n++;
    }
  return sum / n;
}
const PF = LANDMARKS.partyField, GD = LANDMARKS.greenDragon;
const PF_Y = averageRaw(PF.x, PF.z, PF.rx, PF.rz);
const GD_Y = averageRaw(GD.x, GD.z, 16, 16) + 0.2;

function naturalHeight(x, z) {
  let h = rawHeight(x, z);

  // Party Field: flattened, with the faintest tilt toward the lake.
  const pfW = 1 - smoothstep(0.7, 1.45, ellipseDist(x, z, PF));
  h = lerp(h, PF_Y - (x - PF.x) * 0.004, pfW);

  // Green Dragon: level ground on the east bank.
  const gdW = 1 - smoothstep(12, 30, Math.hypot(x - GD.x, z - GD.z));
  h = lerp(h, GD_Y, gdW);

  // The lake bowl.
  const ld = ellipseDist(x, z, LANDMARKS.lake);
  const shore = smoothstep(0.7, 1.25, ld);
  h = lerp(WATER_Y - 1.8 + ld * 1.2, h, shore);
  return h;
}

// Stream bed: follow the land a meter down, but never run uphill on the way to the lake.
{
  const pts = STREAM.smooth;
  const bed = pts.map(([x, z]) => naturalHeight(x, z) - 1.1);
  for (let i = 1; i < bed.length; i++) bed[i] = Math.min(bed[i], bed[i - 1] - 0.02);
  bed[bed.length - 1] = Math.min(bed[bed.length - 1], WATER_Y - 0.7);
  STREAM.bed = bed;
  bakePolyline(pts, STREAM.width, streamDist, null, bed, streamBed, 60);
}

/** Water surface height of the stream at (x, z). */
export function streamWaterAt(x, z) {
  return sampleGrid(streamBed, x, z, WATER_Y) + 0.55;
}

/** Final ground height, including sunken lanes and the stream bed. */
export function heightAt(x, z) {
  let h = naturalHeight(x, z);
  const lm = laneMask(x, z);
  if (lm > 0.001) {
    // Level the lane across its width by averaging a neighborhood, then sink it slightly.
    const e = 1.6;
    const avg = (naturalHeight(x + e, z) + naturalHeight(x - e, z) + naturalHeight(x, z + e) + naturalHeight(x, z - e) + h) / 5;
    h = lerp(h, avg - 0.18, lm);
  }
  // The stream sits in a small valley: banks rise from the bed at a gentle slope, so where the
  // bed is well below the land the valley widens instead of becoming a gorge.
  const sd = sampleGrid(streamDist, x, z, 99);
  if (sd < 58) {
    const bed = sampleGrid(streamBed, x, z, h);
    const bank = bed + 0.45 + Math.max(0, sd - STREAM.width * 0.5) * 0.3 + Math.max(0, sd - STREAM.width * 0.5 - 6) ** 2 * 0.012;
    const k = 1 - smoothstep(40, 58, sd);
    // Smooth minimum of the land and the valley profile.
    const m = 1.5, hv = Math.max(m - Math.abs(h - bank), 0) / m;
    const smin = Math.min(h, bank) - hv * hv * m * 0.25;
    h = lerp(h, smin, k);
  }
  return h;
}

/** Terrain normal by central differences. */
export function normalAt(x, z, e = 0.75) {
  const hx = heightAt(x + e, z) - heightAt(x - e, z);
  const hz = heightAt(x, z + e) - heightAt(x, z - e);
  const nx = -hx, ny = 2 * e, nz = -hz;
  const l = Math.hypot(nx, ny, nz);
  return [nx / l, ny / l, nz / l];
}

export const LANE_TEXTURE = { res: LANE_RES, n: LANE_N, dist: laneDist, width: laneWidth, stream: streamDist };
