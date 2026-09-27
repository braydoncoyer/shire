// Where the things around the Green Dragon stand, worked out from the map alone so the ground
// textures (no grass under a porch deck or a hut) and the builders (Surroundings.js) agree: the
// porch along the inn's south wing, the little thatched hut by the bridge, and the market stalls on
// the lawn beside the lane from the bridge.

import { GREEN_DRAGON, BRIDGE, laneMask, lakeDist, heightAt } from './Layout.js';
import { cleanPoly, polyDist, polyEdges } from './Kit.js';

const GD = cleanPoly(GREEN_DRAGON.poly), SHED = cleanPoly(GREEN_DRAGON.shed);
const bridgeEnd = [BRIDGE.x + BRIDGE.dx * BRIDGE.half, BRIDGE.z + BRIDGE.dz * BRIDGE.half];
const clear = (x, z, r) => {
  for (let a = 0; a < Math.PI * 2; a += 0.4) {
    const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (laneMask(px, pz) > 0.02 || lakeDist(px, pz) < 1.5 || polyDist(GD, px, pz) < 2.5 || polyDist(SHED, px, pz) < 2.5) return false;
  }
  return laneMask(x, z) < 0.01;
};
const local = (e, x, z) => [e.a[0] + ((e.b[0] - e.a[0]) / e.len) * x + e.n[0] * z, e.a[1] + ((e.b[1] - e.a[1]) / e.len) * x + e.n[1] * z];

/** The porch: along the inn's long south-facing wall at its west end, deck out from the eaves. */
export const PORCH = (() => {
  const e = polyEdges(GD, GREEN_DRAGON.y).filter((q) => q.n[1] > 0.9 && q.len > 8).sort((p, q) => p.mid[0] - q.mid[0])[0];
  const x0 = 0.9, x1 = e.len - 0.9, z0 = 1.2, z1 = 3.9;
  return { e, x0, x1, z0, z1, y: GREEN_DRAGON.y, poly: [local(e, x0, z0), local(e, x1, z0), local(e, x1, z1 + 0.8), local(e, x0, z1 + 0.8)] };
})();

/** The hut: the nearest clear spot to the bridge's inn-side end, its door facing the lane. */
export const HUT = (() => {
  let best = null;
  for (let x = bridgeEnd[0] - 14; x < bridgeEnd[0] + 14; x += 0.5)
    for (let z = bridgeEnd[1] - 14; z < bridgeEnd[1] + 14; z += 0.5) {
      const d = Math.hypot(x - bridgeEnd[0], z - bridgeEnd[1]);
      if (d < 4.5 || (best && d >= best.d) || !clear(x, z, 2.7)) continue;
      best = { x, z, d };
    }
  const r = 1.7;
  // Face the lane: the direction around it with the most lane nearby.
  let face = 0, most = -1;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 16) {
    const m = laneMask(best.x + Math.cos(a) * 4, best.z + Math.sin(a) * 4);
    if (m > most) { most = m; face = a; }
  }
  let y = Infinity;
  for (let a = 0; a < Math.PI * 2; a += 0.5) y = Math.min(y, heightAt(best.x + Math.cos(a) * r, best.z + Math.sin(a) * r));
  const poly = [];
  for (let k = 0; k < 8; k++) poly.push([best.x + Math.cos(face + (k + 0.5) * (Math.PI / 4)) * (r + 0.3), best.z + Math.sin(face + (k + 0.5) * (Math.PI / 4)) * (r + 0.3)]);
  return { x: best.x, z: best.z, y, r, face, poly };
})();

/** Market stalls on the lawn beside the lane from the bridge toward the inn. */
export const STALLS = (() => {
  const door = [56.44, 138.95];
  const [ax, az] = bridgeEnd, dx = door[0] - ax, dz = door[1] - az, L = Math.hypot(dx, dz);
  const out = [];
  for (let t = 0.1; t < 0.66 && out.length < 4; t += 0.02)
    for (const s of [1, -1]) {
      for (let off = 4.2; off < 11; off += 0.6) {
        const px = ax + (dx * t) + (-dz / L) * s * off, pz = az + (dz * t) + (dx / L) * s * off;
        if (!clear(px, pz, 1.7)) continue;
        if (Math.hypot(px - HUT.x, pz - HUT.z) < 5 || out.some((o) => Math.hypot(o.x - px, o.z - pz) < 4.2)) continue;
        out.push({ x: px, z: pz, yaw: 0 });
        break;
      }
    }
  // Turned in toward one another round a little square.
  const mx = out.reduce((a, o) => a + o.x, 0) / out.length, mz = out.reduce((a, o) => a + o.z, 0) / out.length;
  for (const o of out) {
    o.yaw = Math.atan2(mx - o.x, mz - o.z);
    const c = Math.cos(o.yaw), sn = Math.sin(o.yaw);
    o.poly = [[-1.4, -1], [1.4, -1], [1.4, 1.2], [-1.4, 1.2]].map(([u, v]) => [o.x + u * c + v * sn, o.z - u * sn + v * c]);
    o.y = heightAt(o.x, o.z);
  }
  return out;
})();

/** Ground to keep bare (no grass up through the deck or the hut's floor, trodden under the stalls). */
export const BARE = [PORCH.poly, HUT.poly, ...STALLS.map((s) => s.poly)];
