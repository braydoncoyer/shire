// Hedges and fences where OpenStreetMap maps them: the set's clipped barberry hedges along lanes
// and around gardens, and rustic post-and-rail fences (paddock fences further out).

import * as THREE from 'three/webgpu';
import { Builder, mtx, box } from './Kit.js';
import { GEO, heightAt, yardAt, laneMask, lakeFactor, HOLES, LANES, VILLAGE, LANE_STAIRS, LANDMARKS } from './Layout.js';
import { mulberry32, fbm2 } from '../util/noise.js';

const WEATHERED = 0x7d6e5a, POST = 0x6a5a48;

/** Walk a polyline in steps of `step` meters, calling fn(x, z, dirX, dirZ). */
function walk(pts, step, fn) {
  let carry = 0;
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-3) continue;
    const dx = (bx - ax) / len, dz = (bz - az) / len;
    for (let t = carry; t < len; t += step) fn(ax + dx * t, az + dz * t, dx, dz);
    carry = (carry - len) % step;
    if (carry < 0) carry += step;
  }
}

const nearHole = (x, z) => HOLES.some((h) => {
  const dx = x - h.x, dz = z - h.z;
  const u = dx * h.fx + dz * h.fz;
  return u < 1.5 && Math.hypot(dx, dz) < h.width / 2 + 4; // behind the facade: the turf mound
});

export class Boundaries {
  constructor(mats, shrubs) {
    const rand = mulberry32(1212);
    this.colliders = [];

    // Hedges: overlapping clipped hedge blocks along each line, clear of yards, lanes and water.
    for (const line of GEO.hedges) {
      walk(line, 1.5, (x, z, dx, dz) => {
        if (yardAt(x, z) > 0 || laneMask(x, z) > 0.2 || lakeFactor(x, z) > 0 || nearHole(x, z)) return;
        shrubs.add('hedge', x, z, 0.9 + rand() * 0.2, Math.atan2(-dz, dx) + (rand() - 0.5) * 0.1);
      });
    }

    // The village's dense planting: bushes and clipped hedges lining the lanes in runs, and clumps
    // of shrubs on the banks between them.
    const free = (x, z) => yardAt(x, z) === 0 && laneMask(x, z) < 0.05 && lakeFactor(x, z) === 0 && !nearHole(x, z);
    for (const lane of LANES) {
      if (!['footway', 'path', 'steps'].includes(lane.kind)) continue;
      const off = lane.width / 2 + 1.1;
      walk(lane.pts, 1.6, (x, z, dx, dz) => {
        if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) > VILLAGE.r) return;
        for (const s of [-1, 1]) {
          const px = x - dz * s * off, pz = z + dx * s * off;
          const run = fbm2(px / 18 + s * 7, pz / 18, 2);
          if (run < 0.14 || !free(px, pz)) continue;
          const kind = run > 0.38 ? 'hedge' : rand() < 0.5 ? 'bush' : 'broad';
          shrubs.add(kind, px, pz, 0.7 + rand() * 0.35, Math.atan2(-dz, dx) + (rand() - 0.5) * 0.2);
        }
      });
    }
    for (let z = VILLAGE.z - VILLAGE.r; z < VILLAGE.z + VILLAGE.r; z += 3.2)
      for (let x = VILLAGE.x - VILLAGE.r; x < VILLAGE.x + VILLAGE.r; x += 3.2) {
        const px = x + (rand() - 0.5) * 2.5, pz = z + (rand() - 0.5) * 2.5;
        if (Math.hypot(px - VILLAGE.x, pz - VILLAGE.z) > VILLAGE.r) continue;
        const n = fbm2(px / 25 - 3, pz / 25 + 5, 3);
        if (n < 0.34 || !free(px, pz)) continue;
        const kinds = ['bush', 'broad', 'bush', 'hydrangea', 'yellow'];
        shrubs.add(kinds[Math.floor(rand() * kinds.length)], px, pz, 0.7 + rand() * 0.6);
      }

    const B = new Builder();
    // The Party Tree's rope fence: a ring of short timber posts with a sagging rope between them.
    {
      const pt = LANDMARKS.partyTree, R = 13, n = 26;
      const pts = [];
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI * 2, x = pt.x + Math.cos(a) * R, z = pt.z + Math.sin(a) * R;
        pts.push({ x, z, y: heightAt(x, z) });
      }
      for (let k = 0; k < n; k++) {
        const p = pts[k], q = pts[k + 1];
        B.add('wood', box(0.1, 0.75, 0.1), mtx(p.x, p.y + 0.3, p.z, 0, rand() * 3, 0), POST);
        const len = Math.hypot(q.x - p.x, q.z - p.z), yaw = Math.atan2(-(q.z - p.z), q.x - p.x);
        for (let s = 0; s < 4; s++) {
          const t0 = s / 4, t1 = (s + 1) / 4, sag = (t) => 0.12 * Math.sin(Math.PI * t);
          const y0 = p.y + 0.6 - sag(t0) + (q.y - p.y) * t0, y1 = p.y + 0.6 - sag(t1) + (q.y - p.y) * t1;
          B.add('wood', box(len / 4 + 0.02, 0.025, 0.025), mtx(p.x + (q.x - p.x) * (t0 + t1) / 2, (y0 + y1) / 2, p.z + (q.z - p.z) * (t0 + t1) / 2, 0, yaw, Math.atan2(y1 - y0, len / 4)), 0xc8b894);
        }
      }
    }

    // Fences: posts every 2.4 m with two rails following the ground.
    for (const line of GEO.fences) {
      let prev = null;
      walk(line, 2.4, (x, z) => {
        const y = heightAt(x, z);
        const ok = yardAt(x, z) === 0 && laneMask(x, z) < 0.3 && lakeFactor(x, z) === 0 && !nearHole(x, z);
        if (ok) B.add('wood', box(0.12, 1.15, 0.12), mtx(x, y + 0.45, z, (rand() - 0.5) * 0.06, rand() * 3, (rand() - 0.5) * 0.06), POST);
        if (ok && prev) {
          const mx = (x + prev.x) / 2, mz = (z + prev.z) / 2, len = Math.hypot(x - prev.x, z - prev.z);
          const yaw = Math.atan2(-(z - prev.z), x - prev.x);
          const pitch = Math.atan2(y - prev.y, len);
          for (const h of [0.45, 0.9]) B.add('wood', box(len + 0.1, 0.08, 0.05), mtx(mx, (y + prev.y) / 2 + h, mz, 0, yaw, pitch), WEATHERED);
        }
        prev = ok ? { x, z, y } : null;
      });
    }
    // Rock outcrops in the tall banks the lanes are cut into.
    const ROCK = [0x7d776a, 0x8c8575, 0x6b675c, 0x958d7a];
    for (const lane of LANES) {
      if (!lane.samples || Math.hypot(lane.samples[0][0] - VILLAGE.x, lane.samples[0][1] - VILLAGE.z) > VILLAGE.r + 60) continue;
      for (let i = 1; i < lane.samples.length - 1; i += 2) {
        const [x, z] = lane.samples[i], [nx, nz] = lane.samples[i + 1];
        const l = Math.hypot(nx - x, nz - z) || 1, px = -(nz - z) / l, pz = (nx - x) / l;
        for (const s of [-1, 1]) {
          const off = lane.width / 2 + 1.2;
          const bx = x + px * s * off, bz = z + pz * s * off;
          const dh = heightAt(bx, bz) - lane.profile[i];
          if (dh < 1.3 || rand() < 0.45 || yardAt(bx, bz) > 0 || nearHole(bx, bz)) continue;
          const r = 0.5 + rand() * Math.min(1.3, dh * 0.35);
          const g = new THREE.IcosahedronGeometry(1, 1);
          const pos = g.attributes.position;
          for (let k = 0; k < pos.count; k++) {
            const f = 0.8 + rand() * 0.35;
            pos.setXYZ(k, pos.getX(k) * f, pos.getY(k) * f * 0.7, pos.getZ(k) * f);
          }
          g.computeVertexNormals();
          const y = lane.profile[i] + 0.2 + rand() * dh * 0.55;
          B.add('rock', g, mtx(bx + px * s * r * 0.3, y, bz + pz * s * r * 0.3, rand(), rand() * 6, rand() * 0.5, r * 1.4, r, r), ROCK[Math.floor(rand() * ROCK.length)]);
        }
      }
    }

    // Flights of stone steps where the lanes climb.
    const STEP = [0x857d6e, 0x9a907e, 0x7a7466, 0x8e8676];
    for (const st of LANE_STAIRS) {
      const len = [0];
      for (let i = 1; i < st.pts.length; i++) len.push(len[i - 1] + Math.hypot(st.pts[i][0] - st.pts[i - 1][0], st.pts[i][1] - st.pts[i - 1][1]));
      const L = len[len.length - 1], rise = st.ys[st.ys.length - 1] - st.ys[0];
      const n = Math.max(2, Math.round(Math.abs(rise) / 0.19));
      const at = (d) => {
        let i = 1;
        while (i < len.length - 1 && len[i] < d) i++;
        const f = (d - len[i - 1]) / Math.max(len[i] - len[i - 1], 1e-6);
        const [ax, az] = st.pts[i - 1], [bx, bz] = st.pts[i];
        return { x: ax + (bx - ax) * f, z: az + (bz - az) * f, y: st.ys[i - 1] + (st.ys[i] - st.ys[i - 1]) * f, yaw: Math.atan2(-(bz - az), bx - ax) };
      };
      for (let k = 0; k < n; k++) {
        // Each tread sits at the height of the higher end of its run.
        const d0 = (k / n) * L, d1 = ((k + 1) / n) * L;
        const a = at((d0 + d1) / 2), top = Math.max(at(d0).y, at(d1).y) - 0.08;
        const w = st.width * 0.92;
        let x = -w / 2;
        while (x < w / 2 - 0.1) {
          const sw = Math.min(0.5 + rand() * 0.5, w / 2 - x);
          const ox = x + sw / 2;
          const m = mtx(a.x, top - 0.14, a.z, 0, a.yaw, 0).multiply(mtx((rand() - 0.5) * 0.04, 0, ox, (rand() - 0.5) * 0.04, (rand() - 0.5) * 0.1, (rand() - 0.5) * 0.04));
          B.add('rock', box(L / n + 0.14, 0.3, sw - 0.03), m, STEP[Math.floor(rand() * STEP.length)]);
          x += sw;
        }
      }
    }
    this.group = B.build(mats);
  }
}
