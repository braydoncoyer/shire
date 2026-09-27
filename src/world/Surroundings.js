// Life round the Green Dragon, after the film: a railed porch under a thatched lean-to on the inn's
// south wing, a little round thatched hut by the bridge, market stalls with striped awnings and
// produce on the lawn beside the lane, and sheep, cows and horses grazing the paddocks beyond.

import * as THREE from 'three/webgpu';
import { Builder, mtx, box, cylinder, footprintRoof, archLeaf, arcTimber, lantern, barrel, cart } from './Kit.js';
import { heightAt, laneMask, lakeDist, GREEN_DRAGON, GEO } from './Layout.js';
import { PORCH, HUT, STALLS } from './Sites.js';
import { paddock, farmWeight } from './Farmland.js';
import { mulberry32 } from '../util/noise.js';
import { LAYERS } from '../core/Layers.js';

const TIMBER = 0x4a3526, OAK = 0x6e5238, OCHRE = 0xd8b060, STONE_DARK = 0x8c8474;

export class Surroundings {
  constructor(mats) {
    this.colliders = [];
    this.lamps = [];
    const rand = mulberry32(4711);
    const B = new Builder();
    this._porch(B, rand);
    this._hut(B, rand);
    for (const s of STALLS) this._stall(B, s, rand);
    this._aleCart(B);
    this.group = B.build(mats);
    // Livestock in its own group: shadows, but not in the lake's reflection.
    const L = new Builder();
    this._livestock(L, rand);
    const animals = L.build(mats);
    animals.traverse((o) => o.layers.set(LAYERS.DETAIL));
    this.group.add(animals);
  }

  _porch(B, rand) {
    const { e, x0, x1, z0, z1, y } = PORCH;
    const at = (x, yy, z, rx, ry, rz) => e.m.clone().multiply(mtx(x, yy, z, rx, ry, rz));
    const world = (x, z) => new THREE.Vector3(x, 0, z).applyMatrix4(e.m);
    const gy = (x, z) => { const p = world(x, z); return heightAt(p.x, p.z) - y; };
    const L = x1 - x0, cx = (x0 + x1) / 2, deck = 0.2;
    // Deck: boards across it on a sill, stepped down to the ground at the front.
    for (let z = z0 + 0.1; z < z1 + 0.05; z += 0.2) B.add('wood', box(L, 0.05, 0.18), at(cx, deck, z), rand() < 0.5 ? 0x7a5c3e : 0x6e5236);
    const low = Math.min(gy(x0, z1), gy(x1, z1), gy(cx, z1)) - 0.1;
    B.add('wood', box(L + 0.1, deck - low, 0.12), at(cx, (deck + low) / 2 - 0.02, z1 + 0.04), TIMBER);
    for (const x of [x0, x1]) B.add('wood', box(0.12, deck - low, z1 - z0), at(x, (deck + low) / 2 - 0.02, (z0 + z1) / 2), TIMBER);
    const gap = 1.3;
    for (let k = 1; k <= 2; k++) B.add('rock', box(gap + 0.3, 0.14, 0.36), at(cx, deck - k * 0.17 + 0.05, z1 + 0.1 + k * 0.33), 0x8c8474);
    // Posts carrying the lean-to, railings with cross braces between them (open at the steps).
    const n = Math.max(2, Math.round(L / 2.3)), posts = [];
    for (let k = 0; k <= n; k++) posts.push(x0 + (L * k) / n);
    const top = 2.45, rail = 0.95;
    for (const x of posts) {
      B.add('wood', box(0.16, top - deck, 0.16), at(x, (top + deck) / 2, z1 - 0.08), TIMBER);
      B.add('wood', box(0.16, top - deck, 0.16), at(x, (top + deck) / 2 + 0.25, z0 + 0.1), TIMBER);
    }
    B.add('wood', box(L + 0.3, 0.18, 0.18), at(cx, top, z1 - 0.08), TIMBER); // plate
    const railRun = (xa, xb, z, along = true) => {
      const len = xb - xa, m = along ? (u, yy) => at(xa + u, yy, z) : (u, yy) => at(z, yy, xa + u, 0, Math.PI / 2, 0);
      if (len < 0.3) return;
      B.add('wood', box(len, 0.08, 0.1), m(len / 2, deck + rail), OAK);
      B.add('wood', box(len, 0.07, 0.07), m(len / 2, deck + 0.12), OAK);
      const ang = Math.atan2(rail - 0.14, len);
      for (const s of [-1, 1]) B.add('wood', box(Math.hypot(len, rail - 0.14) - 0.05, 0.06, 0.05), m(len / 2, deck + 0.12 + (rail - 0.12) / 2).multiply(mtx(0, 0, 0, 0, 0, s * ang)), OAK);
      const c = m(len / 2, 0).elements;
      this.colliders.push({ x: c[12], z: c[14], hx: len / 2, hz: 0.1, rot: Math.atan2(-c[2], c[0]) });
    };
    for (let k = 0; k < posts.length - 1; k++) {
      const a = posts[k] + 0.08, b = posts[k + 1] - 0.08;
      if (a < cx + gap / 2 && b > cx - gap / 2) {
        railRun(a, cx - gap / 2, z1 - 0.08);
        railRun(cx + gap / 2, b, z1 - 0.08);
      } else railRun(a, b, z1 - 0.08);
    }
    for (const x of [x0, x1]) railRun(z0 + 0.2, z1 - 0.16, x, false);
    // The lean-to: a thatched slope from under the inn's eaves out over the posts, a fringe of straw.
    const rz0 = 0.4, ry0 = 3.25, rz1 = z1 + 0.6, ry1 = top + 0.05;
    const slope = Math.hypot(rz1 - rz0, ry0 - ry1), tilt = Math.atan2(ry0 - ry1, rz1 - rz0);
    B.add('thatch', box(L + 1.0, 0.34, slope), at(cx, (ry0 + ry1) / 2 + 0.15, (rz0 + rz1) / 2, tilt, 0, 0), 0xffffff);
    for (let x = x0 - 0.5; x < x1 + 0.5; x += 0.32) {
      const len = 0.25 + rand() * 0.2;
      B.add('straw', new THREE.PlaneGeometry(0.45, len).translate(0, -len / 2, 0), at(x, ry1 + 0.05, rz1 + 0.05, 0.25 + rand() * 0.2, (rand() - 0.5) * 0.3, 0), 0xffffff);
    }
    // A bench along the wall, a table and a keg, a lantern hung from the plate.
    B.add('wood', box(2.2, 0.07, 0.42), at(x0 + 2.2, deck + 0.45, z0 + 0.45), OAK);
    for (const s of [-1, 1]) B.add('wood', box(0.08, 0.45, 0.36), at(x0 + 2.2 + s * 0.95, deck + 0.22, z0 + 0.45), TIMBER);
    B.add('wood', cylinder(0.45, 0.45, 0.05, 18), at(x1 - 2.0, deck + 0.74, (z0 + z1) / 2), 0x8a6440);
    B.add('wood', cylinder(0.07, 0.1, 0.72, 8), at(x1 - 2.0, deck + 0.36, (z0 + z1) / 2), OAK);
    for (let k = 0; k < 2; k++) B.add('wood', cylinder(0.24, 0.26, 0.6, 12), at(x1 - 0.6, deck + 0.3, z0 + 0.45 + k * 0.6), 0x7a5634);
    const lp = world(cx, z1 - 0.35);
    lantern(B, at(cx, top - 0.35, z1 - 0.35), 0.2);
    B.add('metal', box(0.02, 0.2, 0.02), at(cx, top - 0.1, z1 - 0.35), 0x2a2622);
    this.lamps.push(new THREE.Vector3(lp.x, y + top - 0.4, lp.z));
  }

  _hut(B, rand) {
    const { x, z, y, r, face, poly } = HUT;
    const H = 2.0, T = 0.2;
    // A local frame with +z out through the door.
    const base = mtx(x, y, z, 0, Math.atan2(Math.cos(face), Math.sin(face)), 0);
    const at = (px, py, pz, rx, ry, rz) => base.clone().multiply(mtx(px, py, pz, rx, ry, rz));
    B.add('stone', cylinder(r + 0.12, r + 0.18, 0.5, 8), at(0, 0.05, 0).multiply(mtx(0, 0, 0, 0, Math.PI / 8, 0)), STONE_DARK);
    // Eight wall panels of ochre plaster between timber posts; the door in the front one, a round
    // window in the back.
    const side = 2 * r * Math.sin(Math.PI / 8), apo = r * Math.cos(Math.PI / 8);
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4; // panel k's outward direction, 0 = front (+z)
      const m = at(0, 0, 0, 0, a, 0).multiply(mtx(0, 0, apo));
      if (k === 0) {
        const dw = 0.8, dh = 1.7;
        for (const s of [-1, 1]) B.add('plaster', box((side - dw) / 2, H, T), m.clone().multiply(mtx(s * (dw / 2 + (side - dw) / 4), H / 2 + 0.25, 0)), OCHRE);
        B.add('plaster', box(dw, H - dh, T), m.clone().multiply(mtx(0, dh + 0.25 + (H - dh) / 2, 0)), OCHRE);
        B.add('paint', archLeaf(dw, dh, 0.06), m.clone().multiply(mtx(0, 0.28, 0.02)), 0x2f6b3a);
        B.add('wood', arcTimber(dw / 2 + 0.08, 0.08, 0.1, 0, Math.PI, 12), m.clone().multiply(mtx(0, 0.28 + dh - dw / 2, T / 2)), TIMBER);
        B.add('metal', cylinder(0.03, 0.03, 0.03, 8), m.clone().multiply(mtx(0.25, 1.1, 0.08, Math.PI / 2)), 0x2a2622);
      } else {
        B.add('plaster', box(side + 0.02, H, T), m.clone().multiply(mtx(0, H / 2 + 0.25, 0)), OCHRE);
        if (k === 4) {
          B.add('glass', new THREE.CircleGeometry(0.28, 16), m.clone().multiply(mtx(0, 1.4, T / 2 + 0.01)), 0xff0000);
          B.add('wood', arcTimber(0.33, 0.07, 0.08, 0, Math.PI * 2, 16), m.clone().multiply(mtx(0, 1.4, T / 2 + 0.02)), TIMBER);
        }
        B.add('wood', box(side + 0.04, 0.1, 0.06), m.clone().multiply(mtx(0, 0.95, T / 2 + 0.02)), TIMBER);
      }
      B.add('wood', box(0.12, H, 0.12), at(0, 0, 0, 0, a + Math.PI / 8, 0).multiply(mtx(0, H / 2 + 0.25, r)), TIMBER);
    }
    // Thatch, a rounded cap to a point, with straw hanging at the eaves.
    const roof = footprintRoof(poly, { eaveY: y + H + 0.15, overhang: 0.45, rise: 2.3, reach: 1.9, lip: 0.35, res: 0.25 });
    B.add('thatch', roof, new THREE.Matrix4(), 0xffffff);
    for (let a = 0; a < Math.PI * 2; a += 0.16) {
      const len = 0.25 + rand() * 0.2, R = r + 0.72;
      const m = new THREE.Matrix4().makeRotationY(-a + Math.PI / 2).setPosition(x + Math.cos(a) * R, y + H - 0.05, z + Math.sin(a) * R).multiply(mtx(0, 0, 0, 0.35 + rand() * 0.2, 0, 0));
      B.add('straw', new THREE.PlaneGeometry(0.4, len).translate(0, -len / 2, 0), m, 0xffffff);
    }
    this.colliders.push({ x, z, r: r + 0.15 });
  }

  /**
   * The Delving & Oatlock Fine Ale Cart by the Bywater Road: a great hooped barrel lying on a
   * two-wheeled cart, its shafts resting on the grass. Local x runs along the cart toward the shafts.
   */
  _aleCart(B) {
    const site = GEO.trees.find((t) => t.name && /Ale Cart/.test(t.name));
    if (!site) return;
    const [x, z] = site.p;
    // Parallel to the road beside it.
    const yaw = Math.atan2(-(122 - 101), 6 - -49);
    const y = heightAt(x, z) - 0.03;
    const base = mtx(x, y, z, 0, yaw, 0);
    const at = (px, py, pz, rx, ry, rz) => base.clone().multiply(mtx(px, py, pz, rx, ry, rz));
    const bedY = cart(B, base);
    // The barrel on two chocks, with a brass tap in the front end.
    const L = 1.75, BR = 0.58, barrelY = bedY + 0.04 + BR * 0.92;
    for (const cx of [-0.5, 0.5]) B.add('wood', box(0.16, 0.18, 0.9), at(cx, bedY + 0.1, 0), 0x5a4230);
    barrel(B, at(0, barrelY, 0), L, BR);
    B.add('metal', cylinder(0.03, 0.03, 0.14, 8), at(L / 2 + 0.05, barrelY - 0.3, 0, 0, 0, Math.PI / 2), 0xb08a3a);
    B.add('metal', cylinder(0.022, 0.022, 0.1, 8), at(L / 2 + 0.11, barrelY - 0.35, 0), 0xb08a3a);
    this.colliders.push({ x: x + Math.cos(yaw) * 0.8, z: z - Math.sin(yaw) * 0.8, hx: 2.2, hz: 0.95, rot: yaw });
  }

  _stall(B, s, rand) {
    const at = (x, y, z, rx, ry, rz) => mtx(s.x, s.y, s.z, 0, s.yaw, 0).multiply(mtx(x, y, z, rx, ry, rz));
    const W = 2.2, D = 1.0;
    const tint = [0xa8322a, 0x2f6b3a, 0x2e5a9a, 0xc8902a][STALLS.indexOf(s) % 4];
    // Counter on trestles, four posts, a sloping striped awning with a scalloped valance.
    B.add('wood', box(W, 0.06, D), at(0, 0.85, 0), 0x8a6440);
    B.add('wood', box(W - 0.1, 0.72, 0.04), at(0, 0.46, D / 2 - 0.02), 0x6e5238);
    for (const x of [-1, 1]) for (const z of [-1, 1]) B.add('wood', box(0.09, z > 0 ? 2.05 : 2.35, 0.09), at(x * (W / 2 - 0.05), (z > 0 ? 2.05 : 2.35) / 2, z * (D / 2 - 0.05)), TIMBER);
    const aw = new THREE.PlaneGeometry(W + 0.5, D + 0.9).rotateX(-Math.PI / 2);
    const uv = aw.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (W + 0.5), uv.getY(i) * (D + 0.9));
    B.add('cloth', aw, at(0, 2.2, 0.1, 0.28, 0, 0), tint);
    for (let x = -W / 2 - 0.2; x < W / 2 + 0.25; x += 0.3) {
      const g = new THREE.CircleGeometry(0.15, 8, Math.PI, Math.PI);
      const u = g.attributes.uv;
      for (let i = 0; i < u.count; i++) u.setXY(i, x + W, 0);
      B.add('cloth', g, at(x + 0.15, 1.96, D / 2 + 0.52), tint);
    }
    // Wares: crates of apples, pumpkins, cabbages, loaves, jars; baskets and a barrel alongside.
    const produce = [
      [0xb8322a, 0.045, 'ico'], [0xd8742a, 0.09, 'pumpkin'], [0x6a9a3a, 0.08, 'ico'], [0xb07838, 0.07, 'loaf'], [0xd8c040, 0.04, 'ico'],
    ];
    for (let k = 0; k < 3; k++) {
      const cx = -W / 2 + 0.4 + k * 0.7, [col, rr, kind] = produce[Math.floor(rand() * produce.length)];
      B.add('wood', box(0.55, 0.18, 0.42), at(cx, 0.97, 0), 0x9a7a4e);
      for (let i = 0; i < 7; i++) {
        const px = cx + (rand() - 0.5) * 0.4, pz = (rand() - 0.5) * 0.3, py = 1.06 + rr * 0.6 + rand() * 0.04;
        const g = kind === 'loaf' ? new THREE.SphereGeometry(rr, 8, 5).scale(1.5, 0.7, 1) : kind === 'pumpkin' ? new THREE.SphereGeometry(rr, 10, 6).scale(1.2, 0.8, 1.2) : new THREE.IcosahedronGeometry(rr, 1);
        B.add('hide', g, at(px, py, pz, 0, rand() * 6, 0), col);
      }
    }
    B.add('wood', cylinder(0.26, 0.28, 0.62, 12), at(W / 2 + 0.4, 0.31, 0.2), 0x7a5634);
    B.add('wood', cylinder(0.24, 0.18, 0.28, 10, true), at(-W / 2 - 0.35, 0.14, 0.35), 0xa8864e);
    for (let i = 0; i < 5; i++) B.add('hide', new THREE.IcosahedronGeometry(0.05, 1), at(-W / 2 - 0.35 + (rand() - 0.5) * 0.25, 0.26, 0.35 + (rand() - 0.5) * 0.25), 0xb8322a);
    this.colliders.push({ x: s.x, z: s.z, hx: W / 2 + 0.2, hz: D / 2 + 0.1, rot: s.yaw });
  }

  _livestock(B, rand) {
    // Flocks and herds, each kept to one paddock, out on the farms round the inn.
    const spots = [];
    const gx = GREEN_DRAGON.x, gz = GREEN_DRAGON.z;
    const ok = (x, z, id) => {
      if (farmWeight(x, z) < 0.95 || laneMask(x, z) > 0 || lakeDist(x, z) < 6) return false;
      const p = paddock(x, z);
      return !p.ploughed && p.edge > 3 && (id === undefined || p.id === id);
    };
    const herd = (kind, count, spread, rMin, rMax) => {
      for (let tries = 0; tries < 400; tries++) {
        const a = rand() * Math.PI * 2, R = rMin + rand() * (rMax - rMin);
        const cx = gx + Math.cos(a) * R, cz = gz + Math.sin(a) * R;
        if (!ok(cx, cz) || spots.some((s) => Math.hypot(s.x - cx, s.z - cz) < 30)) continue;
        const id = paddock(cx, cz).id;
        const yaw0 = rand() * Math.PI * 2;
        for (let i = 0, n = 0; i < count * 6 && n < count; i++) {
          const x = cx + (rand() - 0.5) * spread * 2, z = cz + (rand() - 0.5) * spread * 2;
          if (!ok(x, z, id) || spots.some((s) => Math.hypot(s.x - x, s.z - z) < (kind === 'sheep' ? 1.6 : 3))) continue;
          spots.push({ x, z, kind, yaw: yaw0 + (rand() - 0.5) * 2.2, graze: rand() < 0.65 });
          n++;
        }
        return;
      }
    };
    for (let k = 0; k < 5; k++) herd('sheep', 9 + Math.floor(rand() * 5), 9, 50, 230);
    for (let k = 0; k < 2; k++) herd('cow', 5, 12, 60, 220);
    herd('horse', 3, 10, 45, 120);
    this.spots = spots;
    for (const s of spots) {
      const m = mtx(s.x, heightAt(s.x, s.z), s.z, 0, s.yaw, 0);
      if (s.kind === 'sheep') sheep(B, m, s.graze, rand);
      else if (s.kind === 'cow') cow(B, m, s.graze, rand);
      else horse(B, m, s.graze, rand);
      this.colliders.push({ x: s.x, z: s.z, r: s.kind === 'sheep' ? 0.55 : 1.0 });
    }
  }
}

// Animals, facing local +z, feet at y = 0, sized from life. Low-poly shapes in the 'hide' material.
const at = (m, x, y, z, rx = 0, ry = 0, rz = 0) => m.clone().multiply(mtx(x, y, z, rx, ry, rz));
const blob = (sx, sy, sz, seg = 10) => new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)).scale(sx, sy, sz);
const _u = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion(), _v = new THREE.Vector3();
/** A rounded limb `w` × `d` thick running from local point p0 to p1 (tapering `taper` toward p1). */
function beam(B, m, p0, p1, w, d, tint, geo = null, taper = 0.85) {
  _v.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
  const len = _v.length();
  _q.setFromUnitVectors(_u, _v.normalize());
  const mm = new THREE.Matrix4().compose(new THREE.Vector3((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2), _q, new THREE.Vector3(1, 1, 1));
  B.add('hide', geo || new THREE.CylinderGeometry(0.5 * taper, 0.5, len * 1.08, 9).scale(w, 1, d), m.clone().multiply(mm), tint);
}
function legs(B, m, w, l, h, r, tint, hoof = 0x1a1612) {
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    B.add('hide', cylinder(r * 0.8, r, h, 6), at(m, sx * w, h / 2, sz * l), tint);
    B.add('hide', cylinder(r * 0.9, r * 1.05, 0.08, 6), at(m, sx * w, 0.04, sz * l), hoof);
  }
}

function sheep(B, m, graze, rand) {
  const wool = [0xe6dfcc, 0xddd4bc, 0xefe8d8, 0xd6ccb4][Math.floor(rand() * 4)];
  legs(B, m, 0.13, 0.27, 0.42, 0.04, 0x2a2522);
  B.add('hide', blob(0.28, 0.28, 0.48), at(m, 0, 0.68, 0), wool);
  for (let k = 0; k < 5; k++) B.add('hide', blob(0.17, 0.14, 0.17, 7), at(m, (rand() - 0.5) * 0.24, 0.8 + rand() * 0.1, (rand() - 0.5) * 0.6), wool);
  const neck = [0, 0.74, 0.38], head = graze ? [0, 0.3, 0.62] : [0, 0.86, 0.62];
  beam(B, m, neck, head, 0.14, 0.14, wool);
  beam(B, m, head, [head[0], head[1] - (graze ? 0.16 : 0.08), head[2] + (graze ? 0.06 : 0.16)], 0, 0, 0x2a2522, blob(0.08, 0.13, 0.08, 8));
  for (const s of [-1, 1]) B.add('hide', box(0.12, 0.03, 0.05), at(m, head[0] + s * 0.1, head[1] + 0.02, head[2] - 0.02, 0, 0, s * 0.4), 0x2a2522);
}

function cow(B, m, graze, rand) {
  const tint = [0x5a3a24, 0x1e1c1a, 0x7a4a2a, 0x3a2a20][Math.floor(rand() * 4)];
  legs(B, m, 0.22, 0.62, 0.82, 0.075, tint);
  B.add('hide', blob(0.36, 0.42, 0.95, 12), at(m, 0, 1.15, 0), tint);
  B.add('hide', blob(0.12, 0.09, 0.14), at(m, 0, 0.74, -0.3), 0xd0a898); // udder
  const neck = [0, 1.28, 0.8], head = graze ? [0, 0.42, 1.28] : [0, 1.32, 1.3];
  beam(B, m, neck, head, 0.3, 0.36, tint);
  const muzzle = graze ? [0, 0.18, 1.36] : [0, 1.12, 1.62];
  beam(B, m, head, muzzle, 0.3, 0.28, tint);
  B.add('hide', box(0.24, 0.14, 0.14), at(m, muzzle[0], muzzle[1], muzzle[2]), 0x4a3a32);
  for (const s of [-1, 1]) {
    B.add('hide', box(0.16, 0.05, 0.08), at(m, s * 0.2, head[1] + 0.08, head[2]), tint);
    B.add('hide', cylinder(0.015, 0.03, 0.16, 5), at(m, s * 0.12, head[1] + 0.16, head[2] - 0.02, 0, 0, s * 0.8), 0xd8d0b8);
  }
  beam(B, m, [0, 1.35, -0.92], [0, 0.6, -1.02], 0.04, 0.04, tint);
}

function horse(B, m, graze, rand) {
  const tint = [0x5a3420, 0x2a1e16, 0x8a6a4a, 0x6a4a34][Math.floor(rand() * 4)];
  const dark = 0x1a1410;
  legs(B, m, 0.17, 0.6, 1.05, 0.055, tint);
  B.add('hide', blob(0.3, 0.38, 0.88, 12), at(m, 0, 1.4, 0), tint);
  // Neck from the withers to the poll, then the head hanging from the poll.
  const base = [0, 1.55, 0.62], poll = graze ? [0, 0.72, 1.28] : [0, 2.15, 1.02], nose = graze ? [0, 0.1, 1.38] : [0, 1.75, 1.42];
  beam(B, m, base, poll, 0.2, 0.34, tint, null, 0.7);
  beam(B, m, [base[0], base[1] + 0.12, base[2] - 0.12], [poll[0], poll[1] + 0.05, poll[2] - 0.1], 0.07, 0.1, dark); // mane
  beam(B, m, poll, nose, 0.17, 0.24, tint, null, 0.7);
  for (const s of [-1, 1]) B.add('hide', box(0.04, 0.14, 0.05), at(m, s * 0.07, poll[1] + 0.07, poll[2]), tint);
  beam(B, m, [0, 1.55, -0.8], [0, 0.72, -0.98], 0.1, 0.1, dark); // tail
}
