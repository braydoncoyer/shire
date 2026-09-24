// The Hobbiton layout: landmark positions, lanes and the height function everything else is built on.
// World units are meters. +x is east, -z is north, +y is up. The Hill rises to the north of the
// Party Field so the hobbit-hole doors face the southern sun (the Shire sits around 52°N).

import { fbm2, smoothstep, lerp, clamp, mulberry32 } from '../util/noise.js';

export const FIELD_Y = 3.2;
export const WATER_Y = 1.55;
export const INNER_HALF = 280; // detailed terrain + baked lane mask covers [-INNER_HALF, INNER_HALF]
export const WORLD_HALF = 3200;
export const WALK_RADIUS = 265;

export const LANDMARKS = {
  hill: { x: -40, z: -95 },
  bagEnd: { x: -32, z: -60 },
  bagEndOak: { x: -40, z: -80 },
  partyField: { x: -5, z: 20, rx: 46, rz: 30 },
  partyTree: { x: 14, z: 34 },
  lake: { x: 50, z: 52, rx: 50, rz: 29, rot: 0.35 },
  mill: { x: 104, z: -6 },
  bridge: { x: 84, z: 22 },
  greenDragon: { x: 125, z: 53 },
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
  { width: 2.0, pts: [[2, -12], [20, -24], [40, -33], [62, -38]] },
  { width: 1.8, pts: [[-96, -14], [-110, -36], [-102, -58], [-76, -64]] },
  { width: 1.8, pts: [[-16, -40], [-2, -52], [4, -72]] },
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
// Hobbit-hole grounds: yard (lawn, mown) and beds (1 = flowers, 0.5 = vegetables).
const yardGrid = new Uint8Array(LANE_N * LANE_N);
const bedGrid = new Uint8Array(LANE_N * LANE_N);

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

// ---------------------------------------------------------------------------------------------
// Hobbit holes
//
// Each hole is dug into the uphill side of a lane: a level yard runs from the lane to a stone
// facade, and the turf behind the facade is raised into a mound so the door always sits under grass.
// Local frame: u points from the door toward the lane, v runs along the facade (to the door's left
// when facing it from the lane is -v).

export const HOLES = [];
let PADS = null; // level pads for buildings, set once the buildings are placed

/** Height of the turf dome above the yard at (v across the facade, d behind it). */
export function moundTop(hole, v, d = 0) {
  const rv = hole.width / 2 + 1.6, rd = 8;
  const q = 1 - (v / rv) ** 2 - (Math.max(d, 0) / rd) ** 2;
  return q > 0 ? (1.15 + hole.crown) * Math.sqrt(q) : 0;
}

const smax = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
};

export function holeLocal(hole, dx, dz) {
  return [dx * hole.fx + dz * hole.fz, dx * hole.fz - dz * hole.fx];
}

function holeCut(hole, dx, dz, h) {
  const [u, v] = holeLocal(hole, dx, dz);
  const hw = hole.width / 2;
  // The yard extends a little behind the facade plane so the 1 m terrain grid's slope up to the
  // mound falls behind the stone wall rather than in front of the door.
  if (u > -0.6) {
    // The yard: level ground from the facade to the lane, blending into the hillside at the sides.
    const lat = 1 - smoothstep(hw + 0.6, hw + 4.5, Math.abs(v));
    const front = 1 - smoothstep(hole.yard + 0.2, hole.yard + 1.8, u);
    return lerp(h, hole.y, lat * front);
  }
  // Behind the facade: a turf dome over the hole, merged smoothly into the hill.
  const dome = hole.y + moundTop(hole, v, -u) + 0.2;
  return smax(h, dome, 1.2);
}

const HOLE_COLORS = [0x2f6b3a, 0xc8a232, 0x9b2d24, 0x2e5a8c, 0x6b3e7a, 0xd06a2a, 0x3d7d7a, 0x7a4a2a];

{
  const rand = mulberry32(777);
  const rows = [
    { lane: LANES[1], every: [11, 15] },
    { lane: LANES[2], every: [11, 15] },
    { lane: LANES[3], every: [11, 14] },
    { lane: LANES[4], every: [11, 14] },
    { lane: LANES[6], every: [12, 16] },
    { lane: LANES[7], every: [11, 14] },
    { lane: LANES[8], every: [11, 14] },
    { lane: LANES[5], every: [15, 20] },
  ];
  const be = LANDMARKS.bagEnd;
  const tooClose = (x, z, r) => HOLES.some((o) => Math.hypot(o.x - x, o.z - z) < r);

  // Bag End first, at the top of the lane, facing its gate.
  {
    const gate = LANES[1].smooth[LANES[1].smooth.length - 1];
    const f = [gate[0] - be.x, gate[1] - be.z], l = Math.hypot(...f);
    const laneY = heightAt(gate[0], gate[1]);
    HOLES.push(makeHole(be.x, be.z, f[0] / l, f[1] / l, laneY + 1.25, l - 1.8, { bagEnd: true, width: 9.5, crown: 2.6, color: 0x2f6b3a }));
  }

  for (const row of rows) {
    const pts = row.lane.smooth;
    const hwLane = row.lane.width / 2;
    let acc = 6 + rand() * 6;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const seg = Math.hypot(bx - ax, bz - az);
      let t = 0;
      while (acc < seg - t) {
        t += acc;
        acc = row.every[0] + rand() * (row.every[1] - row.every[0]);
        const px = ax + ((bx - ax) * t) / seg, pz = az + ((bz - az) * t) / seg;
        const tx = (bx - ax) / seg, tz = (bz - az) / seg;
        // Uphill side of the lane.
        const off = hwLane + 5.5 + rand() * 1.5;
        const sides = [[-tz, tx], [tz, -tx]];
        const up = sides.map(([nx, nz]) => naturalHeight(px + nx * 8, pz + nz * 8));
        const [nx, nz] = up[0] > up[1] ? sides[0] : sides[1];
        const rise = Math.max(up[0], up[1]) - naturalHeight(px, pz);
        const x = px + nx * off, z = pz + nz * off;
        if (rise < 0.4 && rand() < 0.35) continue; // flat ground: only some holes get a built-up mound
        if (tooClose(x, z, 10.5)) continue;
        if (Math.hypot(x - be.x, z - be.z) < 16) continue;
        if (ellipseDist(x, z, LANDMARKS.partyField) < 1.15 || lakeFactor(x, z) > 0) continue;
        // Keep other lanes out of the mound behind the door and out of the yard in front of it.
        // (a: meters uphill from the door, negative toward the lane; b: meters along the facade.)
        const probes = [[0, 0], [3, 0], [6, 0], [2, 3.5], [2, -3.5], [-(off - hwLane - 1.5), 0], [-2, 3], [-2, -3]];
        if (probes.some(([a, b]) => laneMask(x + nx * a + tx * b, z + nz * a + tz * b) > 0.02)) continue;
        const laneY = heightAt(px, pz);
        HOLES.push(makeHole(x, z, -nx, -nz, laneY + 0.35, off - hwLane - 0.4, {
          width: 6.2 + rand() * 1.6, crown: 1.9 + rand() * 0.8,
          color: HOLE_COLORS[Math.floor(rand() * HOLE_COLORS.length)],
        }));
      }
      acc -= seg - t;
    }
  }

  function makeHole(x, z, fx, fz, y, yard, o) {
    const width = o.width;
    return {
      x, z, fx, fz, y, yard, width, crown: o.crown, color: o.color, bagEnd: !!o.bagEnd,
      yaw: Math.atan2(fx, fz),
      windows: o.bagEnd ? 2 : rand() < 0.75 ? 2 : 1,
      porch: !o.bagEnd && rand() < 0.3,
      veg: rand() < 0.55,
      chimney: (rand() < 0.5 ? -1 : 1) * (1 + rand() * 1.5),
      seed: Math.floor(rand() * 1e6),
      reach2: (Math.max(yard + 3, width / 2 + 4, 11)) ** 2,
    };
  }

  // Door paths from the lane to each door, then the yard and bed masks.
  for (const hole of HOLES) {
    const a = [hole.x + hole.fx * 1.3, hole.z + hole.fz * 1.3];
    const b = [hole.x + hole.fx * (hole.yard + 1.8), hole.z + hole.fz * (hole.yard + 1.8)];
    bakePolyline([a, b], hole.bagEnd ? 1.5 : 1.15, laneDist, laneWidth);
  }
  for (const hole of HOLES) {
    const r = Math.sqrt(hole.reach2);
    const i0 = Math.max(0, Math.floor((hole.x - r + INNER_HALF) / LANE_RES)), i1 = Math.min(LANE_N - 1, Math.ceil((hole.x + r + INNER_HALF) / LANE_RES));
    const j0 = Math.max(0, Math.floor((hole.z - r + INNER_HALF) / LANE_RES)), j1 = Math.min(LANE_N - 1, Math.ceil((hole.z + r + INNER_HALF) / LANE_RES));
    const hw = hole.width / 2;
    const vegSide = hole.seed % 2 ? 1 : -1;
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const [u, v] = holeLocal(hole, i * LANE_RES - INNER_HALF - hole.x, j * LANE_RES - INNER_HALF - hole.z);
        if (u < 0 || u > hole.yard + 0.3 || Math.abs(v) > hw + 1.2) continue;
        const k = j * LANE_N + i;
        yardGrid[k] = 255;
        const av = Math.abs(v);
        if (av < 0.9) continue; // the path
        // Flower beds along the facade and along the fence; a vegetable patch to one side.
        const facadeBed = u < 1.4 && av > 1.1;
        const fenceBed = u > hole.yard - 1.0;
        const vegBed = hole.veg && v * vegSide > 1.8 && u > 1.8 && u < hole.yard - 1.4;
        if (vegBed) bedGrid[k] = 128;
        else if (facadeBed || fenceBed) bedGrid[k] = 255;
      }
  }
}

// ---------------------------------------------------------------------------------------------
// Buildings beside the water: the Mill on the stream's east bank, the Green Dragon across the lake,
// and the double-arched bridge carrying the lane over the stream.

function frameFrom(ax, az, bx, bz) {
  const l = Math.hypot(bx - ax, bz - az);
  return [(bx - ax) / l, (bz - az) / l];
}

export const BRIDGE = (() => {
  const b = LANDMARKS.bridge;
  const [dx, dz] = frameFrom(100, 30, 68, 14);
  const half = 13, width = 3.8;
  const water = streamWaterAt(b.x, b.z);
  const end0 = heightAt(b.x - dx * half, b.z - dz * half), end1 = heightAt(b.x + dx * half, b.z + dz * half);
  const crown = water + 2.75;
  // yaw turns local +x onto the bridge's direction.
  return { x: b.x, z: b.z, dx, dz, half, width, water, end0, end1, crown, yaw: Math.atan2(-dz, dx) };
})();

/** Deck height of the bridge at `t` meters along it (−half..half). */
export function bridgeDeck(t) {
  const B = BRIDGE, k = t / B.half;
  const ends = lerp(B.end0, B.end1, (k + 1) / 2);
  return ends + (B.crown - ends) * (1 - k * k) * (1 - 0.35 * k * k);
}

export const MILL = (() => {
  const m = LANDMARKS.mill;
  const [sx, sz] = frameFrom(116, -46, 104, -6); // downstream
  const px = -sz, pz = sx; // across the stream, toward the bank the mill lane arrives on
  const cx = m.x + px * 9.5, cz = m.z + pz * 9.5;
  const y = Math.max(heightAt(cx, cz), streamWaterAt(m.x, m.z) + 1.0);
  return { x: cx, z: cz, y, sx, sz, px, pz, water: streamWaterAt(m.x, m.z), yaw: Math.atan2(px, pz) };
})();

export const GREEN_DRAGON = (() => {
  const g = LANDMARKS.greenDragon;
  const [fx, fz] = frameFrom(g.x, g.z, LANDMARKS.bridge.x, LANDMARKS.bridge.z); // front faces the bridge
  return { x: g.x, z: g.z, y: heightAt(g.x, g.z), fx, fz, yaw: Math.atan2(fx, fz), w: 15, d: 10 };
})();

// Level pads applied after everything else in heightAt.
PADS = [
  { x: MILL.x, z: MILL.z, r0: 5.5, r1: 8.5, y: MILL.y },
];

// Gravel courtyards and building footprints (no grass), baked into the lane field.
function bakeArea(cx, cz, hx, hz, fx, fz) {
  const r = Math.hypot(hx, hz) + 1;
  const i0 = Math.max(0, Math.floor((cx - r + INNER_HALF) / LANE_RES)), i1 = Math.min(LANE_N - 1, Math.ceil((cx + r + INNER_HALF) / LANE_RES));
  const j0 = Math.max(0, Math.floor((cz - r + INNER_HALF) / LANE_RES)), j1 = Math.min(LANE_N - 1, Math.ceil((cz + r + INNER_HALF) / LANE_RES));
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const dx = i * LANE_RES - INNER_HALF - cx, dz = j * LANE_RES - INNER_HALF - cz;
      const u = dx * fx + dz * fz, v = dx * fz - dz * fx;
      const d = Math.max(Math.abs(u) - hz, Math.abs(v) - hx);
      const k = j * LANE_N + i;
      if (d < laneDist[k] - laneWidth[k] * 0.5 + 1.5) { laneDist[k] = Math.max(d, 0) + 1.5; laneWidth[k] = 3; }
    }
}
{
  const G = GREEN_DRAGON;
  // Building plus a forecourt for the outdoor tables, reaching the lane.
  bakeArea(G.x + G.fx * 3, G.z + G.fz * 3, G.w / 2 + 2, G.d / 2 + 5, G.fx, G.fz);
  bakeArea(MILL.x, MILL.z, 5, 5.5, MILL.px, MILL.pz);
  bakePolyline([[MILL.x - MILL.sx * 5, MILL.z - MILL.sz * 5], [100, -12]], 2.2, laneDist, laneWidth);
}

/**
 * Walkable surfaces above the terrain (the bridge deck, building floors). Returns -Infinity where
 * there is none.
 */
export function surfaceAt(x, z) {
  const B = BRIDGE;
  const dx = x - B.x, dz = z - B.z;
  const t = dx * B.dx + dz * B.dz, w = dx * B.dz - dz * B.dx;
  if (Math.abs(t) < B.half && Math.abs(w) < B.width / 2) return bridgeDeck(t);
  return -Infinity;
}

export function yardAt(x, z) {
  return sampleGrid(yardGrid, x, z, 0) / 255;
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
    // A real channel (the bed) inside the stream's width, then gentle banks rising away from it.
    const hw = STREAM.width * 0.5;
    const bank = bed + smoothstep(hw - 1.2, hw + 0.6, sd) * 0.75 + Math.max(0, sd - hw) * 0.3 + Math.max(0, sd - hw - 6) ** 2 * 0.012;
    const k = 1 - smoothstep(40, 58, sd);
    // Smooth minimum of the land and the valley profile.
    const m = 1.5, hv = Math.max(m - Math.abs(h - bank), 0) / m;
    const smin = Math.min(h, bank) - hv * hv * m * 0.25;
    h = lerp(h, smin, k);
  }
  for (const hole of HOLES) {
    const dx = x - hole.x, dz = z - hole.z;
    if (dx * dx + dz * dz > hole.reach2) continue;
    h = holeCut(hole, dx, dz, h);
  }
  if (PADS) for (const p of PADS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r1) h = lerp(h, p.y, 1 - smoothstep(p.r0, p.r1, d));
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

export const LANE_TEXTURE = {
  res: LANE_RES, n: LANE_N, dist: laneDist, width: laneWidth, stream: streamDist, yard: yardGrid, bed: bedGrid,
};
