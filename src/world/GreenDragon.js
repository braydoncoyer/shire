// The Green Dragon and the thatched outbuilding beside the bridge, built on their mapped
// footprints. Walls follow every edge of the outline: ochre lime plaster between dark oak posts and
// cross braces, round-headed windows, and round-arched doors wherever a footpath meets the
// building. The thatch is generated over the whole outline, so each wing gets its own ridge and the
// eaves sweep low. A gabled dormer with a round window sits over the main door, facing the bridge.

import * as THREE from 'three/webgpu';
import { Builder, mtx, box, cylinder, polyEdges, footprintRoof, cleanPoly, polyDist } from './Kit.js';
import { GREEN_DRAGON, GEO, BRIDGE } from './Layout.js';

const TIMBER = 0x4a3526, OCHRE = 0xd8b060, STONE = 0xb0a690, STONE_DARK = 0x8c8474;

function doorPoints(poly) {
  // Footpaths that end at the building mark its doors.
  const out = [];
  for (const p of GEO.paths) {
    if (p.kind !== 'footway' && p.kind !== 'path') continue;
    for (const q of [p.pts[0], p.pts[p.pts.length - 1]]) {
      const d = Math.abs(polyDist(poly, q[0], q[1]));
      if (d < 2.5 && !out.some((o) => Math.hypot(o[0] - q[0], o[1] - q[1]) < 4)) out.push(q);
    }
  }
  return out;
}

export class GreenDragon {
  constructor(mats, shrubs) {
    this.shrubs = shrubs;
    this.colliders = [];
    this.lamps = [];
    this.chimneys = [];
    const B = new Builder();
    const G = GREEN_DRAGON;
    this._building(B, G.poly, G.y, { wallH: 2.55, rise: 5.6, reach: 12, doors: true, ochre: true, dormer: true, chimneys: 4 });
    this._building(B, G.shed, G.shedY, { wallH: 2.3, rise: 3.2, reach: 4.5, doors: true, ochre: false, mixed: true, chimneys: 1 });
    this._forecourt(B);
    this.group = B.build(mats);
  }

  _building(B, rawPoly, y, o) {
    const poly = cleanPoly(rawPoly);
    const edges = polyEdges(poly, y);
    const doors = o.doors ? doorPoints(poly) : [];
    // The door nearest the bridge is the main entrance.
    const bx = BRIDGE.x + BRIDGE.dx * BRIDGE.half, bz = BRIDGE.z + BRIDGE.dz * BRIDGE.half;
    doors.sort((a, b) => Math.hypot(a[0] - bx, a[1] - bz) - Math.hypot(b[0] - bx, b[1] - bz));
    const H = o.wallH, T = 0.4;
    const wallMat = o.ochre ? 'plaster' : 'stone';
    const wallTint = o.ochre ? OCHRE : STONE;

    // Plinth.
    for (const e of edges) B.add('stone', box(e.len + 0.5, 0.5, T + 0.3), e.m.clone().multiply(mtx(e.len / 2, -0.15, -T / 2)), STONE_DARK);

    // Assign each door point to the wall edge it's closest to (paths often end at a corner).
    const doorOn = new Map();
    for (const d of doors) {
      let best = null;
      for (const e of edges) {
        const ux = (e.b[0] - e.a[0]) / e.len, uz = (e.b[1] - e.a[1]) / e.len;
        const t = (d[0] - e.a[0]) * ux + (d[1] - e.a[1]) * uz;
        const off = Math.abs((d[0] - e.a[0]) * e.n[0] + (d[1] - e.a[1]) * e.n[1]);
        const outside = Math.max(0, -t, t - e.len);
        const score = off + outside * 2 - Math.min(e.len, 6) * 0.1;
        if (e.len > 2.4 && (!best || score < best.score)) best = { e, t, score };
      }
      if (best) doorOn.set(d, best);
    }
    let mainDoor = null;
    for (const e of edges) {
      const at = (x, yy, z, rx, ry, rz) => e.m.clone().multiply(mtx(x, yy, z - T / 2, rx, ry, rz));
      // Openings: a door where a path meets this edge, windows spaced along the rest.
      const open = [];
      for (const d of doors) {
        const hit = doorOn.get(d);
        if (!hit || hit.e !== e) continue;
        const w = o.ochre ? (d === doors[0] ? 1.9 : 1.5) : 1.0;
        const c = Math.max(w / 2 + 0.3, Math.min(e.len - w / 2 - 0.3, hit.t));
        open.push({ x0: c - w / 2, x1: c + w / 2, y0: 0.1, y1: o.ochre ? 1.95 : 1.8, door: true });
        if (d === doors[0]) mainDoor = { e, c };
      }
      const nWin = Math.floor((e.len - 1.2) / 3.2);
      for (let k = 0; k < nWin; k++) {
        const c = ((k + 0.5) * e.len) / nWin;
        const w = o.ochre && k % 3 === 1 ? 0.9 : 1.1;
        if (open.some((q) => c + w / 2 + 0.35 > q.x0 && c - w / 2 - 0.35 < q.x1)) continue;
        open.push({ x0: c - w / 2, x1: c + w / 2, y0: 0.9, y1: 1.75, round: o.ochre && k % 3 === 1 });
      }
      if (o.mixed) {
        // Fieldstone to waist height, ochre plaster above.
        const sill = 1.0;
        wall(B, 'stone', at, 0, e.len, 0, 0, sill, T, open.map((q) => ({ ...q, y1: Math.min(q.y1, sill + 5) })), STONE);
        wall(B, 'plaster', at, 0, e.len, 0, sill, H - sill, T, open.map((q) => ({ ...q, y0: Math.max(0, q.y0 - sill), y1: q.y1 - sill })), OCHRE);
        B.add('wood', box(e.len + 0.1, 0.16, 0.08), at(e.len / 2, sill, T / 2 + 0.04), TIMBER);
      } else wall(B, wallMat, at, 0, e.len, 0, 0, H, T, open, wallTint);

      if (o.ochre) {
        // Timber frame: sole plate, wall plate, posts, and cross braces in plain panels.
        B.add('wood', box(e.len + 0.1, 0.18, 0.08), at(e.len / 2, 0.12, T / 2 + 0.04), TIMBER);
        B.add('wood', box(e.len + 0.1, 0.2, 0.08), at(e.len / 2, H - 0.1, T / 2 + 0.04), TIMBER);
        const n = Math.max(1, Math.round(e.len / 1.9));
        for (let k = 0; k <= n; k++) {
          const x = (k * e.len) / n;
          if (open.some((q) => x > q.x0 - 0.12 && x < q.x1 + 0.12)) continue;
          B.add('wood', box(0.16, H, 0.08), at(x, H / 2, T / 2 + 0.04), TIMBER);
          const x2 = ((k + 1) * e.len) / n;
          if (k < n && !open.some((q) => q.x1 > x - 0.1 && q.x0 < x2 + 0.1)) {
            const pw = x2 - x, ph = H - 0.4, ang = Math.atan2(ph, pw), len = Math.hypot(pw, ph);
            for (const s of [-1, 1]) B.add('wood', box(len, 0.12, 0.07), at(x + pw / 2, 0.2 + ph / 2, T / 2 + 0.07, 0, 0, s * ang), TIMBER);
          }
        }
      }
      for (const q of open) {
        const c = (q.x0 + q.x1) / 2, w = q.x1 - q.x0;
        if (q.door) {
          // Round-arched doorway: timber arch, a glowing interior, the door swung open.
          B.add('wood', new THREE.TorusGeometry(w / 2 + 0.05, 0.09, 6, 18, Math.PI), at(c, q.y1, T / 2 + 0.05), TIMBER);
          B.add(wallMat, box(w, w / 2 + 0.1, T), at(c, q.y1 + w / 4, 0), wallTint);
          B.add('glass', box(w - 0.05, q.y1 - q.y0 + w * 0.3, 0.05), at(c, (q.y0 + q.y1 + w * 0.3) / 2, -T / 2 + 0.04), 0xff0000);
          B.add('paint', box(w * 0.5, q.y1 - q.y0 + w * 0.2, 0.07), at(q.x0, (q.y0 + q.y1) / 2, T / 2 + 0.3, 0, 1.25, 0).multiply(mtx(w * 0.25, 0, 0)), o.ochre ? 0x2f6b3a : 0x2e5a9a);
          for (const s of [-1, 1]) {
            B.add('metal', box(0.18, 0.28, 0.18), at(c + s * (w / 2 + 0.3), 1.95, T / 2 + 0.12), 0x2a2a2a);
            B.add('glass', box(0.13, 0.2, 0.13), at(c + s * (w / 2 + 0.3), 1.95, T / 2 + 0.12), 0xff0000);
            if (o.ochre) this.lamps.push(new THREE.Vector3(c + s * (w / 2 + 0.3), 1.95, T / 2 + 0.3).applyMatrix4(e.m));
          }
        } else if (q.round) {
          const r = w / 2;
          B.add('glass', new THREE.CircleGeometry(r, 18), at(c, (q.y0 + q.y1) / 2, 0.02), 0xff0000);
          B.add('wood', new THREE.TorusGeometry(r, 0.07, 6, 18), at(c, (q.y0 + q.y1) / 2, T / 2 + 0.02), TIMBER);
          B.add('wood', box(r * 2, 0.04, 0.05), at(c, (q.y0 + q.y1) / 2, 0.04), TIMBER);
          B.add('wood', box(0.04, r * 2, 0.05), at(c, (q.y0 + q.y1) / 2, 0.04), TIMBER);
          B.add(wallMat, box(w, q.y1 - q.y0, T - 0.1), at(c, (q.y0 + q.y1) / 2, -0.05), wallTint); // fill behind the circle
        } else {
          // Round-headed casement with leaded panes.
          const r = w / 2;
          B.add('glass', box(w, q.y1 - q.y0, 0.04), at(c, (q.y0 + q.y1) / 2, 0), 0xff0000);
          B.add('glass', new THREE.CircleGeometry(r, 14, 0, Math.PI), at(c, q.y1, 0.02), 0xff0000);
          B.add(wallMat, box(w + 0.02, r + 0.2, T), at(c, q.y1 + (r + 0.2) / 2, -0.03), wallTint);
          B.add('wood', new THREE.TorusGeometry(r + 0.03, 0.06, 6, 14, Math.PI), at(c, q.y1, T / 2 + 0.03), TIMBER);
          B.add('wood', box(0.05, q.y1 - q.y0 + r, 0.05), at(c, (q.y0 + q.y1 + r) / 2, 0.04), TIMBER);
          B.add('wood', box(w, 0.05, 0.05), at(c, (q.y0 + q.y1) / 2, 0.04), TIMBER);
          B.add('wood', box(w + 0.2, 0.08, 0.28), at(c, q.y0 - 0.04, T / 2 + 0.08), TIMBER);
        }
      }
      // Colliders: wall segments between doors.
      let x = 0;
      const segs = open.filter((q) => q.door).sort((a, b) => a.x0 - b.x0);
      for (const q of [...segs, { x0: e.len, x1: e.len }]) {
        if (q.x0 - x > 0.2) {
          const c = new THREE.Vector3((x + q.x0) / 2, 0, -T / 2).applyMatrix4(e.m);
          this.colliders.push({ x: c.x, z: c.z, hx: (q.x0 - x) / 2, hz: T / 2 + 0.05, rot: Math.atan2(-(e.b[1] - e.a[1]), e.b[0] - e.a[0]) });
        }
        x = q.x1;
      }
    }

    // Thatch over the whole footprint.
    const roof = footprintRoof(poly, { eaveY: y + H - 0.2, overhang: 1.1, rise: o.rise, reach: o.reach, lip: 0.75 });
    B.add('thatch', roof, new THREE.Matrix4(), 0xffffff);
    // Ragged straw ends hanging from the eaves.
    let seed = Math.floor(y * 1000) + poly.length;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const e of edges) {
      const ex = (e.b[0] - e.a[0]) / e.len, ez = (e.b[1] - e.a[1]) / e.len;
      for (let t = -0.8; t < e.len + 0.8; t += 0.32) {
        const px = e.a[0] + ex * t + e.n[0] * 1.12, pz = e.a[1] + ez * t + e.n[1] * 1.12;
        const len = 0.3 + rnd() * 0.25;
        const card = new THREE.PlaneGeometry(0.5, len).translate(0, -len / 2, 0);
        const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(ex, 0, ez), new THREE.Vector3(0, 1, 0), new THREE.Vector3(e.n[0], 0, e.n[1]))
          .setPosition(px, y + H - 0.2 - 0.55, pz).multiply(mtx(0, 0, 0, 0.35 + rnd() * 0.3, (rnd() - 0.5) * 0.4, 0));
        B.add('straw', card, m, 0xffffff);
      }
    }

    // Dormer over the main door: a little gable with a round window, its own thatch hood.
    if (o.dormer && mainDoor) {
      const { e, c } = mainDoor;
      const at = (xx, yy, z, rx, ry, rz) => e.m.clone().multiply(mtx(xx, yy, z, rx, ry, rz));
      const tri = new THREE.Shape([new THREE.Vector2(-1.7, 0), new THREE.Vector2(1.7, 0), new THREE.Vector2(0, 2.3)]);
      B.add('plaster', new THREE.ExtrudeGeometry(tri, { depth: 3.2, bevelEnabled: false }), at(c, H - 0.1, -3.0), OCHRE);
      B.add('glass', new THREE.CircleGeometry(0.48, 20), at(c, H + 0.75, 0.22), 0xff0000);
      B.add('wood', new THREE.TorusGeometry(0.52, 0.08, 6, 20), at(c, H + 0.75, 0.23), TIMBER);
      for (const s of [-1, 1]) B.add('wood', box(2.5, 0.16, 0.1), at(c + s * 0.8, H + 0.85, 0.15, 0, 0, s * -0.87), TIMBER);
      for (const s of [-1, 1]) B.add('thatch', box(3.0, 0.55, 3.8), at(c + s * 1.0, H + 1.15, -1.2, 0, 0, s * -0.9), 0xffffff);
    }

    // Chimneys where the roof is high (along the ridges).
    if (o.chimneys) {
      const cands = [];
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const [x, z] of poly) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
      for (let z = minZ; z < maxZ; z += 1.5) for (let x = minX; x < maxX; x += 1.5) if (polyDist(poly, x, z) < -2) cands.push([x, z, roof.userData.heightAt(x, z)]);
      cands.sort((a, b) => b[2] - a[2]);
      const picked = [];
      for (const c of cands) {
        if (picked.length >= o.chimneys) break;
        if (picked.some((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) < 9)) continue;
        picked.push(c);
      }
      for (const [x, z, h] of picked) {
        const top = h + 1.2;
        const brick = o.ochre;
        B.add(brick ? 'brick' : 'stone', box(0.8, top - y - 1, 0.8), mtx(x, (top + y + 1) / 2, z), brick ? 0x9a5236 : STONE);
        B.add('stone', box(1.0, 0.18, 1.0), mtx(x, top, z), STONE_DARK);
        if (brick) B.add('brick', cylinder(0.13, 0.15, 0.4, 10), mtx(x - 0.15, top + 0.25, z), 0xa8603e);
        this.chimneys.push(new THREE.Vector3(x, top + 0.45, z));
      }
    }
  }

  _forecourt(B) {
    const shrubs = this.shrubs;
    // Cobbles in front of the main door, benches and tables on the lawn, the lamp post, the sign.
    const G = GREEN_DRAGON;
    const doors = doorPoints(cleanPoly(G.poly));
    const bx = BRIDGE.x + BRIDGE.dx * BRIDGE.half, bz = BRIDGE.z + BRIDGE.dz * BRIDGE.half;
    doors.sort((a, b) => Math.hypot(a[0] - bx, a[1] - bz) - Math.hypot(b[0] - bx, b[1] - bz));
    const [dx, dz] = doors[0];
    const ux = bx - dx, uz = bz - dz, l = Math.hypot(ux, uz), fx = ux / l, fz = uz / l;
    const yaw = Math.atan2(fx, fz);
    const base = new THREE.Matrix4().makeRotationY(yaw).setPosition(dx, G.y, dz);
    const at = (x, y, z, rx, ry, rz) => base.clone().multiply(mtx(x, y, z, rx, ry, rz));
    const cob = [0x8f897d, 0xa29b8c, 0x7f7a70, 0x968f80];
    let s = 1;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let z = 0.6; z < 7.5; z += 0.42)
      for (let x = -2.6 + (z > 4 ? 0.8 : 0); x <= 2.6 - (z > 4 ? 0.8 : 0); x += 0.42)
        B.add('stone', box(0.38, 0.08, 0.38), at(x + (Math.round(z / 0.42) % 2) * 0.21, 0.02, z, 0, rnd() * 0.3), cob[Math.floor(rnd() * cob.length)]);
    for (const [x, z, r] of [[-5, 5.5, 0.1], [5.5, 6.5, -0.2], [-6.5, 9.5, 0.3]]) {
      B.add('wood', box(1.8, 0.07, 0.4), at(x, 0.45, z, 0, r), 0x6e5238);
      for (const k of [-1, 1]) B.add('wood', box(0.08, 0.45, 0.35), at(x + k * 0.75 * Math.cos(r), 0.22, z - k * 0.75 * Math.sin(r), 0, r), 0x4a3526);
      const p = new THREE.Vector3(x, 0, z).applyMatrix4(base);
      this.colliders.push({ x: p.x, z: p.z, hx: 0.95, hz: 0.3, rot: yaw + r });
    }
    B.add('metal', box(0.09, 2.7, 0.09), at(2.4, 1.35, 7.8), 0x2a2622);
    B.add('metal', box(0.26, 0.36, 0.26), at(2.4, 2.85, 7.8), 0x2a2622);
    B.add('glass', box(0.18, 0.26, 0.18), at(2.4, 2.85, 7.8), 0xff0000);
    this.lamps.push(new THREE.Vector3(2.4, 2.85, 7.8).applyMatrix4(base));

    // Lanterns on posts along the path from the bridge, alternating sides.
    const L = Math.hypot(bx - dx, bz - dz);
    for (let d = 9, k = 0; d < L - 2; d += 5.5, k++) {
      const side = k % 2 ? 1 : -1;
      const m = at(side * 1.9, 0, d);
      B.add('wood', box(0.12, 1.5, 0.12), m.clone().multiply(mtx(0, 0.75, 0)), TIMBER);
      B.add('metal', box(0.2, 0.28, 0.2), m.clone().multiply(mtx(0, 1.62, 0)), 0x2a2622);
      B.add('glass', box(0.14, 0.2, 0.14), m.clone().multiply(mtx(0, 1.62, 0)), 0xff0000);
      this.lamps.push(new THREE.Vector3(side * 1.9, 1.62, d).applyMatrix4(base));
    }

    // Flower beds and shrubs along the inn's walls, and clumps by the forecourt.
    if (shrubs) {
      const edges = polyEdges(cleanPoly(G.poly), G.y);
      const kinds = ['hydrangea', 'roses', 'marigold', 'yellow', 'bush', 'broad'];
      for (const e of edges) {
        const ex = (e.b[0] - e.a[0]) / e.len, ez = (e.b[1] - e.a[1]) / e.len;
        for (let t = 0.8; t < e.len - 0.6; t += 1.3 + rnd() * 1.2) {
          const px = e.a[0] + ex * t + e.n[0] * 0.9, pz = e.a[1] + ez * t + e.n[1] * 0.9;
          if (Math.hypot(px - dx, pz - dz) < 2.2) continue; // keep the main door clear
          if (rnd() < 0.25) continue;
          shrubs.add(kinds[Math.floor(rnd() * kinds.length)], px, pz, 0.55 + rnd() * 0.35, rnd() * 6.28, G.y);
        }
      }
      for (const [x, z] of [[-4.2, 3.2], [4.2, 3.4], [-3.6, 8.5], [5.2, 9.5]]) {
        const p = new THREE.Vector3(x, 0, z).applyMatrix4(base);
        shrubs.add(kinds[Math.floor(rnd() * 4)], p.x, p.z, 0.8, rnd() * 6.28, G.y);
      }
    }
    // The hanging sign on a post by the door.
    B.add('wood', box(0.14, 2.8, 0.14), at(-2.8, 1.4, 1.4), TIMBER);
    B.add('wood', box(0.06, 0.08, 1.0), at(-2.8, 2.7, 1.9), TIMBER);
    B.add('paint', box(0.05, 0.85, 0.7), at(-2.8, 2.15, 2.1), 0x2f5a34);
    B.add('paint', box(0.06, 0.45, 0.4), at(-2.8, 2.15, 2.1), 0xc8a232);
  }
}

// A wall along local x from x0 to x1 with rectangular openings cut out (same as in Buildings.js).
function wall(B, mat, at, x0, x1, z, y0, h, t, openings = [], tint = 0xffffff) {
  const cuts = openings.filter((o) => o.x1 > x0 && o.x0 < x1).sort((a, b) => a.x0 - b.x0);
  let x = x0;
  const seg = (a, b, ya, yb) => {
    if (b - a < 0.01 || yb - ya < 0.01) return;
    B.add(mat, box(b - a, yb - ya, t), at((a + b) / 2, (ya + yb) / 2, z), tint);
  };
  for (const o of cuts) {
    seg(x, o.x0, y0, y0 + h);
    seg(o.x0, o.x1, y0, y0 + o.y0);
    seg(o.x0, o.x1, y0 + o.y1, y0 + h);
    x = o.x1;
  }
  seg(x, x1, y0, y0 + h);
}
