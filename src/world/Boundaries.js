// Hedges and fences where OpenStreetMap maps them: the set's clipped barberry hedges along lanes
// and around gardens, and rustic post-and-rail fences (paddock fences further out).

import * as THREE from 'three/webgpu';
import { Builder, mtx, box } from './Kit.js';
import { GEO, heightAt, yardAt, laneMask, lakeFactor, HOLES, LANES, VILLAGE } from './Layout.js';
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
          if (run < 0.08 || !free(px, pz)) continue;
          const kind = run > 0.3 ? 'hedge' : rand() < 0.5 ? 'bush' : 'broad';
          shrubs.add(kind, px, pz, 0.7 + rand() * 0.35, Math.atan2(-dz, dx) + (rand() - 0.5) * 0.2);
        }
      });
    }
    for (let z = VILLAGE.z - VILLAGE.r; z < VILLAGE.z + VILLAGE.r; z += 3.2)
      for (let x = VILLAGE.x - VILLAGE.r; x < VILLAGE.x + VILLAGE.r; x += 3.2) {
        const px = x + (rand() - 0.5) * 2.5, pz = z + (rand() - 0.5) * 2.5;
        if (Math.hypot(px - VILLAGE.x, pz - VILLAGE.z) > VILLAGE.r) continue;
        const n = fbm2(px / 25 - 3, pz / 25 + 5, 3);
        if (n < 0.22 || !free(px, pz)) continue;
        const kinds = ['bush', 'broad', 'bush', 'hydrangea', 'yellow'];
        shrubs.add(kinds[Math.floor(rand() * kinds.length)], px, pz, 0.7 + rand() * 0.6);
      }

    // Fences: posts every 2.4 m with two rails following the ground.
    const B = new Builder();
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
    this.group = B.build(mats);
  }
}
