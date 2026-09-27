// Bilbo's eleventy-first birthday party on the Party Field, after the film: a striped canvas
// pavilion with long tables laid for the feast, a lantern mast over the dance ring with strings of
// paper lanterns and bunting, a little bandstand, the birthday banner over the path in, kegs by the
// pavilion, and Gandalf's cart of fireworks down by the lake. Everything is set out and waiting; the
// lanterns glow from dusk. Sites are in Layout.js (PARTY).

import * as THREE from 'three/webgpu';
import { Builder, mtx, box, cylinder, barrel, cart } from './Kit.js';
import { growTree } from './TreeGen.js';
import { variantSeed } from './Vegetation.js';
import { heightAt, PARTY } from './Layout.js';
import { mulberry32 } from '../util/noise.js';

const TIMBER = 0x5a4230, OAK = 0x6e5238, ROPE = 0xb8a070;
const CANVAS = 0xf4efe2; // stripes: this and the cloth's own cream
const LANTERNS = [0xff9a3a, 0xe8583a, 0xffd060, 0xfff0c8, 0xff7a4a, 0xf0b040];
const BUNTING = [0xb8322a, 0x2f6b3a, 0xd8b23a, 0x2e5a9a, 0xe8e2d0];
// Cloth with a uv.x of 0.3 shows its tint all over (see the cloth material's stripes).
const SOLID = 0.3;

/** A flat uv so cloth pieces take their tint without stripes. */
function solid(g) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, SOLID, 0);
  return g;
}

export class Party {
  /** `trees`: the planted trees (Vegetation.trees), to hang lanterns in the Party Tree. */
  constructor(mats, trees = []) {
    this.colliders = [];
    this.lamps = [];
    const rand = mulberry32(111);
    const B = new Builder();
    this._pavilion(B, rand);
    this._kegs(B);
    this._danceRing(B, rand);
    this._bandstand(B, rand);
    this._fireworksCart(B, rand);
    const pt = trees.find((t) => t.species === 'partyPine');
    if (pt) this._treeLanterns(B, pt, rand);
    const banner = this._banner(B);
    this.group = B.build(mats);
    this.group.add(banner);
  }

  // ---------------------------------------------------------------------------------------------

  /** A paper lantern hanging at `p` (world), with its little cap and hook. */
  _lantern(B, p, tint, s = 1) {
    B.add('paper', new THREE.SphereGeometry(0.13 * s, 10, 8).scale(1, 1.2, 1), mtx(p.x, p.y, p.z), tint);
    B.add('metal', cylinder(0.05 * s, 0.07 * s, 0.04 * s, 8), mtx(p.x, p.y + 0.17 * s, p.z), 0x2a2622);
    B.add('metal', cylinder(0.05 * s, 0.06 * s, 0.03 * s, 8), mtx(p.x, p.y - 0.17 * s, p.z), 0x2a2622);
  }

  /** A rope from a to b (world) sagging `sag` m in the middle, as points along it. */
  _rope(B, a, b, sag, n = 12) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push(new THREE.Vector3().lerpVectors(a, b, t).setY(a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t)));
    }
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[i + 1], d = q.clone().sub(p), len = d.length();
      const m = new THREE.Matrix4().lookAt(p, q, new THREE.Vector3(0, 1, 0));
      m.setPosition(p.clone().add(q).multiplyScalar(0.5));
      B.add('wood', box(0.018, 0.018, len), m, ROPE);
    }
    return pts;
  }

  /** Point `t` (0..1) along a sagging rope. */
  _along(a, b, sag, t) {
    return new THREE.Vector3().lerpVectors(a, b, t).setY(a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t));
  }

  _pole(B, x, z, h, r = 0.07, tint = OAK) {
    const y = heightAt(x, z);
    B.add('wood', cylinder(r * 0.8, r, h + 0.3, 8), mtx(x, y + h / 2 - 0.15, z), tint);
    this.colliders.push({ x, z, r: r + 0.05 });
    return new THREE.Vector3(x, y + h, z);
  }

  // ---------------------------------------------------------------------------------------------
  // The pavilion: a hipped canvas roof on three king poles, open sides on a ring of short poles
  // with guy ropes, a scalloped valance, and inside two long tables and the head table.

  _pavilion(B, rand) {
    const P = PARTY.pavilion, { hl, hw } = P;
    const yaw = Math.atan2(-P.uz, P.ux);
    const frame = mtx(P.x, P.y, P.z, 0, yaw, 0);
    const at = (x, y, z, rx, ry, rz) => frame.clone().multiply(mtx(x, y, z, rx, ry, rz));
    const world = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(frame);
    const EAVE = 2.2, RISE = 2.3, OVER = 0.35, POLES = [-4.8, 0, 4.8];
    // Roof height over local (x, z): a hipped tent whose ridge dips a little between the king poles.
    const roofY = (x, z) => {
      const side = 1 - Math.abs(z) / hw, hip = 1 - (Math.abs(x) - (hl - hw)) / hw;
      let dip = 1;
      for (let k = 0; k < POLES.length - 1; k++) {
        const a = POLES[k], b = POLES[k + 1];
        if (x > a && x < b) dip = 1 - 0.1 * Math.sin((Math.PI * (x - a)) / (b - a));
      }
      return EAVE + RISE * Math.min(side, hip) * (side < hip ? dip : 1);
    };
    // Canvas as a grid mesh; stripes run down the slopes.
    {
      const nx = Math.round(((hl + OVER) * 2) / 0.25), nz = Math.round(((hw + OVER) * 2) / 0.25);
      const pos = [], uv = [], idx = [];
      for (let j = 0; j <= nz; j++)
        for (let i = 0; i <= nx; i++) {
          const x = -hl - OVER + (i / nx) * (hl + OVER) * 2, z = -hw - OVER + (j / nz) * (hw + OVER) * 2;
          pos.push(x, roofY(x, z), z);
          const onSide = 1 - Math.abs(z) / hw < 1 - (Math.abs(x) - (hl - hw)) / hw;
          uv.push((onSide ? x : z) * 0.4, 0);
        }
      for (let j = 0; j < nz; j++)
        for (let i = 0; i < nx; i++) {
          const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
          idx.push(a, c, b, b, c, d);
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      B.add('cloth', g, frame, CANVAS);
    }
    // Scalloped valance round the edge, in red and cream.
    {
      const X = hl + OVER, Z = hw + OVER;
      const corners = [[-X, -Z], [X, -Z], [X, Z], [-X, Z], [-X, -Z]];
      const pos = [], uv = [], idx = [];
      let s = 0, v = 0;
      for (let c = 0; c < 4; c++) {
        const [ax, az] = corners[c], [bx, bz] = corners[c + 1], len = Math.hypot(bx - ax, bz - az);
        const n = Math.round(len / 0.1);
        for (let i = 0; i <= n; i++) {
          const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, ss = s + t * len;
          const top = roofY(x, z) + 0.02, drop = 0.26 + 0.1 * Math.abs(Math.sin((Math.PI * ss) / 0.6));
          pos.push(x, top, z, x, top - drop, z);
          uv.push(ss / 2.64, 0, ss / 2.64, 0);
          if (i < n) idx.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
          v += 2;
        }
        s += len;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      B.add('cloth', g, frame, 0xa8342a);
    }
    // King poles with finials and pennants.
    for (const x of POLES) {
      const top = roofY(x, 0);
      B.add('wood', cylinder(0.08, 0.1, top + 0.5, 8), at(x, (top + 0.5) / 2 - 0.1, 0), OAK);
      B.add('wood', new THREE.SphereGeometry(0.1, 8, 6), at(x, top + 0.45, 0), 0xd8b23a);
      B.add('cloth', solid(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.28, 0), new THREE.Vector3(0.75, -0.12, 0)]).setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 2)).setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3))), at(x, top + 0.4, 0, 0, rand() * 0.6 - 0.3, 0), 0xa8342a);
      const w = world(x, 0, 0);
      this.colliders.push({ x: w.x, z: w.z, r: 0.15 });
    }
    // Side poles under the eaves, each guyed out to a stake.
    const ring = [];
    for (let x = -hl; x <= hl + 0.01; x += (hl * 2) / 7) for (const z of [-hw, hw]) ring.push([x, z]);
    for (let z = -hw + (hw * 2) / 4; z < hw - 0.01; z += (hw * 2) / 4) for (const x of [-hl, hl]) ring.push([x, z]);
    for (const [x, z] of ring) {
      const top = roofY(x, z);
      B.add('wood', cylinder(0.045, 0.055, top + 0.3, 8), at(x, top / 2 - 0.1, z), OAK);
      const out = Math.abs(z) === hw ? [0, Math.sign(z)] : [Math.sign(x), 0];
      const stake = world(x + out[0] * 1.7, 0, z + out[1] * 1.7);
      stake.y = heightAt(stake.x, stake.z);
      B.add('wood', box(0.05, 0.3, 0.05), mtx(stake.x, stake.y + 0.1, stake.z), TIMBER);
      this._rope(B, world(x, top - 0.05, z), stake.clone().setY(stake.y + 0.2), 0.02, 3);
      const w = world(x, 0, z);
      this.colliders.push({ x: w.x, z: w.z, r: 0.08 });
    }
    // Lanterns hung along the ridge inside.
    for (let x = -6; x <= 6; x += 2.4) {
      const top = roofY(x, 0) - 0.05, p = world(x, Math.min(top, 3.6) - 0.6, 0);
      this._rope(B, world(x, top, 0), p.clone().setY(p.y + 0.2), 0, 1);
      this._lantern(B, p, LANTERNS[Math.floor(rand() * LANTERNS.length)], 1.3);
    }
    this.lamps.push(world(-4, 2.6, 0), world(4, 2.6, 0));

    // The feast: two long tables down the pavilion, the head table across its lakeward end.
    const table = (cx, cz, len, alongX) => {
      const T = (x, y, z) => (alongX ? at(cx + x, y, cz + z) : at(cx + z, y, cz + x, 0, Math.PI / 2, 0));
      const H = 0.62, W = 0.9;
      B.add('cloth', solid(box(len + 0.1, 0.03, W + 0.1)), T(0, H, 0), 0xf2eee4);
      for (const s of [-1, 1]) B.add('cloth', solid(box(len + 0.1, 0.24, 0.02)), T(0, H - 0.12, s * (W / 2 + 0.05)), 0xf2eee4);
      for (let x = -len / 2 + 0.4; x <= len / 2 - 0.39; x += (len - 0.8) / Math.max(1, Math.round((len - 0.8) / 2.5))) {
        for (const s of [-1, 1]) B.add('wood', box(0.07, H, 0.07), T(x, H / 2, s * (W / 2 - 0.12)), TIMBER);
        // Benches either side.
        for (const s of [-1, 1]) B.add('wood', box(0.07, 0.36, 0.24), T(x, 0.18, s * (W / 2 + 0.42)), TIMBER);
      }
      for (const s of [-1, 1]) B.add('wood', box(len, 0.05, 0.3), T(0, 0.38, s * (W / 2 + 0.42)), OAK);
      // Places laid: plates and tankards, with bread, fruit and pies down the middle.
      for (let x = -len / 2 + 0.45; x < len / 2 - 0.3; x += 0.62)
        for (const s of [-1, 1]) {
          B.add('paint', cylinder(0.11, 0.09, 0.02, 12), T(x, H + 0.025, s * 0.27), 0xe8e2d4);
          if (rand() < 0.7) B.add('wood', cylinder(0.045, 0.05, 0.13, 8), T(x + 0.16, H + 0.08, s * 0.3), 0x7a5634);
        }
      for (let x = -len / 2 + 0.6; x < len / 2 - 0.4; x += 0.5 + rand() * 0.4) {
        const k = rand();
        if (k < 0.3) B.add('hide', new THREE.SphereGeometry(0.1, 8, 5).scale(1.6, 0.7, 1), T(x, H + 0.08, (rand() - 0.5) * 0.1), 0xb07838);
        else if (k < 0.55) for (let i = 0; i < 5; i++) B.add('hide', new THREE.IcosahedronGeometry(0.045, 1), T(x + (rand() - 0.5) * 0.18, H + 0.06, (rand() - 0.5) * 0.18), [0xb8322a, 0x8ab040, 0xe0a030][i % 3]);
        else if (k < 0.75) B.add('hide', cylinder(0.14, 0.13, 0.07, 14), T(x, H + 0.05, 0), 0xc8883a);
        else B.add('wood', cylinder(0.07, 0.08, 0.12, 10), T(x, H + 0.07, 0), 0xd8c8a0);
      }
      const c = T(0, 0, 0).elements;
      this.colliders.push({ x: c[12], z: c[14], hx: alongX ? len / 2 + 0.3 : W / 2 + 0.7, hz: alongX ? W / 2 + 0.7 : len / 2 + 0.3, rot: yaw });
    };
    table(-1.4, -1.8, 9, true);
    table(-1.4, 1.8, 9, true);
    table(5.9, 0, 5.2, false);
    // Bilbo's chair at the head table, facing down the pavilion.
    B.add('wood', box(0.5, 0.06, 0.5), at(6.6, 0.45, 0), OAK);
    B.add('wood', box(0.08, 1.2, 0.56), at(6.88, 0.8, 0), OAK);
    B.add('wood', new THREE.CylinderGeometry(0.28, 0.28, 0.08, 12, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateY(Math.PI / 2), at(6.88, 1.4, 0), OAK);
    for (const [x, z] of [[6.4, -0.2], [6.4, 0.2], [6.8, -0.2], [6.8, 0.2]]) B.add('wood', box(0.05, 0.45, 0.05), at(x, 0.22, z), TIMBER);
  }

  /**
   * Lanterns hung all through the Party Tree, as on the night of the party: on short cords from the
   * limbs, from head height up into the crown, found from the tree's own grown skeleton.
   */
  _treeLanterns(B, tree, rand) {
    const skel = growTree('partyPine', variantSeed('partyPine', tree.variant));
    const m = new THREE.Matrix4().fromArray(tree.matrix);
    const spots = [];
    for (const b of skel.branches) {
      if (b.level < 1 || b.level > 2) continue;
      for (const t of [0.3, 0.55, 0.8]) {
        const f = t * (b.pts.length - 1), i = Math.min(b.pts.length - 2, Math.floor(f));
        const p = b.pts[i].clone().lerp(b.pts[i + 1], f - i).applyMatrix4(m);
        const up = (p.y - m.elements[13]);
        if (up > 3.2 && up < 19) spots.push({ p, k: rand() });
      }
    }
    spots.sort((a, b) => a.k - b.k);
    const hung = [];
    for (const { p } of spots) {
      if (hung.length >= 110 || hung.some((q) => q.distanceTo(p) < 1.3)) continue;
      hung.push(p);
      const drop = 0.35 + rand() * 0.5, q = p.clone().setY(p.y - drop);
      this._rope(B, p, q.clone().setY(q.y + 0.2), 0, 1);
      this._lantern(B, q, LANTERNS[Math.floor(rand() * LANTERNS.length)], 1.5);
    }
    // They light the lawn under the tree.
    const [x, y, z] = [m.elements[12], m.elements[13], m.elements[14]];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      this.lamps.push(new THREE.Vector3(x + Math.cos(a) * 5, y + 4.5, z + Math.sin(a) * 5));
    }
  }

  /** Kegs at the pavilion's uphill end: barrels on a rack and a couple stood on end. */
  _kegs(B) {
    const P = PARTY.pavilion, yaw = Math.atan2(-P.uz, P.ux);
    const x = P.x - P.ux * (P.hl + 1.6), z = P.z - P.uz * (P.hl + 1.6);
    const frame = mtx(x, P.y, z, 0, yaw + Math.PI / 2, 0);
    const at = (px, py, pz, rx, ry, rz) => frame.clone().multiply(mtx(px, py, pz, rx, ry, rz));
    for (const s of [-1, 1]) B.add('wood', box(2.4, 0.12, 0.12), at(0, 0.25, s * 0.35), TIMBER);
    for (const px of [-0.75, 0, 0.75]) {
      barrel(B, at(px, 0.62, 0, 0, Math.PI / 2, 0), 0.95, 0.34);
      B.add('metal', cylinder(0.02, 0.02, 0.12, 6), at(px, 0.5, 0.52, Math.PI / 2), 0xb08a3a);
    }
    for (const [px, pz] of [[1.6, 0.6], [1.9, -0.3]]) {
      barrel(B, at(px, 0.48, pz, 0, 0, Math.PI / 2), 0.95, 0.34);
    }
    this.colliders.push({ x, z, hx: 1.6, hz: 0.9, rot: yaw + Math.PI / 2 });
  }

  // ---------------------------------------------------------------------------------------------
  // The dance ring: a tall mast with lantern strings running out to a ring of poles, bunting and
  // more lanterns between the poles.

  _danceRing(B, rand) {
    const D = PARTY.dance;
    const mast = this._pole(B, D.x, D.z, 5.6, 0.12);
    B.add('wood', new THREE.SphereGeometry(0.13, 8, 6), mtx(mast.x, mast.y + 0.25, mast.z), 0xd8b23a);
    // A long pennant from the mast head.
    {
      const pts = [0, 0, 0, 0, -0.4, 0, 1.6, -0.25, 0];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([SOLID, 0, SOLID, 0, SOLID, 0], 2));
      B.add('cloth', g, mtx(mast.x, mast.y + 0.15, mast.z, 0, 0.8, 0), 0xa8342a);
    }
    const N = 8, poles = [];
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2 + 0.2;
      poles.push(this._pole(B, D.x + Math.cos(a) * D.r, D.z + Math.sin(a) * D.r, 3.0, 0.07));
    }
    const head = mast.clone().setY(mast.y - 0.3);
    for (const p of poles) {
      const top = p.clone().setY(p.y - 0.1), sag = 0.35;
      this._rope(B, head, top, sag);
      for (let t = 0.14; t < 0.95; t += 0.16) {
        const q = this._along(head, top, sag, t);
        this._lantern(B, q.setY(q.y - 0.22), LANTERNS[Math.floor(rand() * LANTERNS.length)]);
      }
      this.lamps.push(p.clone().setY(p.y - 0.4));
    }
    this.lamps.push(head.clone().setY(head.y - 1.5));
    // Between the poles: bunting on a rope, and a lantern at the middle of each span.
    for (let k = 0; k < N; k++) {
      const a = poles[k].clone().setY(poles[k].y - 0.2), b = poles[(k + 1) % N].clone().setY(poles[(k + 1) % N].y - 0.2), sag = 0.3;
      this._rope(B, a, b, sag, 8);
      const n = Math.round(a.distanceTo(b) / 0.32);
      for (let i = 1; i < n; i++) {
        const p = this._along(a, b, sag, i / n), dir = b.clone().sub(a).setY(0).normalize();
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute([-0.1, 0, 0, 0.1, 0, 0, 0, -0.24, 0], 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute([SOLID, 0, SOLID, 0, SOLID, 0], 2));
        B.add('cloth', g, mtx(p.x, p.y - 0.01, p.z, 0, Math.atan2(-dir.z, dir.x), 0), BUNTING[(k * 7 + i) % BUNTING.length]);
      }
      const m = this._along(a, b, sag, 0.5);
      this._lantern(B, m.setY(m.y - 0.25), LANTERNS[Math.floor(rand() * LANTERNS.length)]);
    }
  }

  /** The bandstand: a low plank stage facing the dance ring, with stools, a drum and a garland. */
  _bandstand(B, rand) {
    const S = PARTY.bandstand, D = PARTY.dance;
    const yaw = Math.atan2(D.x - S.x, D.z - S.z); // local +z faces the ring
    const W = 4, Dp = 3;
    let hi = -Infinity;
    for (let x = -W / 2; x <= W / 2; x += 0.5) for (let z = -Dp / 2; z <= Dp / 2; z += 0.5) {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      hi = Math.max(hi, heightAt(S.x + x * c + z * s, S.z - x * s + z * c));
    }
    const top = hi + 0.45;
    const frame = mtx(S.x, top, S.z, 0, yaw, 0);
    const at = (x, y, z, rx, ry, rz) => frame.clone().multiply(mtx(x, y, z, rx, ry, rz));
    const ground = (x, z) => { const p = new THREE.Vector3(x, 0, z).applyMatrix4(frame); return heightAt(p.x, p.z) - top; };
    for (let z = -Dp / 2 + 0.1; z < Dp / 2; z += 0.2) B.add('wood', box(W, 0.05, 0.18), at(0, -0.025, z), rand() < 0.5 ? 0x8a6a48 : 0x7a5c3e);
    for (const [x, z] of [[-W / 2, -Dp / 2], [W / 2, -Dp / 2], [-W / 2, Dp / 2], [W / 2, Dp / 2], [0, -Dp / 2], [0, Dp / 2]]) {
      const g = ground(x, z) - 0.2;
      B.add('wood', box(0.14, -g, 0.14), at(x * 0.97, g / 2, z * 0.97), TIMBER);
    }
    // Skirt boards round the front and sides, down to the lowest ground.
    const low = Math.min(ground(-W / 2, Dp / 2), ground(W / 2, Dp / 2), ground(-W / 2, -Dp / 2), ground(W / 2, -Dp / 2));
    B.add('wood', box(W, -low, 0.04), at(0, low / 2 - 0.05, Dp / 2), TIMBER);
    for (const s of [-1, 1]) B.add('wood', box(0.04, -low, Dp), at((s * W) / 2, low / 2 - 0.05, 0), TIMBER);
    // Steps up the front.
    const gs = ground(0, Dp / 2 + 0.6);
    // (Solid treads, so none hangs in the air where the ground falls away.)
    for (let k = 1; k <= 2; k++) {
      const top = gs + (k * -gs) / 3, z = Dp / 2 + 0.55 - k * 0.3, foot = ground(0, z) - 0.1;
      B.add('wood', box(1.2, top - foot, 0.32), at(0, (top + foot) / 2, z), OAK);
    }
    // A rail and two garland posts at the back.
    for (const s of [-1, 1]) B.add('wood', cylinder(0.05, 0.06, 2.1, 8), at((s * W) / 2 - s * 0.1, 1.0, -Dp / 2 + 0.1), OAK);
    B.add('wood', box(W - 0.2, 0.06, 0.06), at(0, 0.8, -Dp / 2 + 0.1), OAK);
    const ga = new THREE.Vector3(-W / 2 + 0.1, 2.0, -Dp / 2 + 0.1).applyMatrix4(frame), gb = new THREE.Vector3(W / 2 - 0.1, 2.0, -Dp / 2 + 0.1).applyMatrix4(frame);
    this._rope(B, ga, gb, 0.35, 8);
    for (let t = 0.12; t < 0.95; t += 0.19) {
      const q = this._along(ga, gb, 0.35, t);
      this._lantern(B, q.setY(q.y - 0.2), LANTERNS[Math.floor(rand() * LANTERNS.length)]);
    }
    this.lamps.push(new THREE.Vector3(0, 1.8, -Dp / 2 + 0.3).applyMatrix4(frame));
    // Stools, a drum, a bench and two music stands.
    for (const [x, z] of [[-1.2, -0.3], [0, -0.6], [1.2, -0.3]]) {
      B.add('wood', cylinder(0.17, 0.17, 0.05, 10), at(x, 0.42, z), OAK);
      for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; B.add('wood', box(0.04, 0.42, 0.04), at(x + Math.cos(a) * 0.11, 0.2, z + Math.sin(a) * 0.11), TIMBER); }
    }
    B.add('wood', cylinder(0.3, 0.3, 0.45, 16), at(1.55, 0.3, -0.95, Math.PI / 2 - 0.3, 0, 0), 0x8a3a2a);
    for (const s of [-1, 1]) B.add('hide', cylinder(0.3, 0.3, 0.01, 16), at(1.55, 0.3, -0.95, Math.PI / 2 - 0.3, 0, 0).multiply(mtx(0, s * 0.228, 0)), 0xe8dcc0);
    B.add('wood', box(1.4, 0.05, 0.3), at(-1.1, 0.4, -1.1), OAK);
    for (const x of [-0.7, 0.7]) {
      B.add('metal', cylinder(0.015, 0.015, 1.0, 6), at(x, 0.5, 0.35), 0x2a2622);
      B.add('wood', box(0.42, 0.3, 0.02), at(x, 1.05, 0.35, -0.5, 0, 0), OAK);
    }
    const c = frame.elements;
    this.colliders.push({ x: c[12], z: c[14], hx: W / 2 + 0.1, hz: Dp / 2 + 0.1, rot: yaw });
  }

  /** Gandalf's cart by the lake, loaded with crates of fireworks under a half-thrown-back tarp. */
  _fireworksCart(B, rand) {
    const C = PARTY.cart, yaw = 2.4;
    const frame = mtx(C.x, heightAt(C.x, C.z) - 0.03, C.z, 0, yaw, 0);
    const at = (x, y, z, rx, ry, rz) => frame.clone().multiply(mtx(x, y, z, rx, ry, rz));
    const bed = cart(B, frame, { length: 2.0, width: 1.2, wheel: 0.55 });
    const crate = (x, y, z, w, h, d, ry = 0) => {
      B.add('wood', box(w, h, d), at(x, y + h / 2, z, 0, ry, 0), 0x9a7a52);
      for (const s of [-1, 1]) B.add('wood', box(w + 0.02, 0.05, 0.04), at(x, y + h / 2 + s * h * 0.3, z + d / 2, 0, ry, 0), 0x6e5238);
    };
    crate(-0.45, bed + 0.04, -0.25, 0.7, 0.4, 0.5);
    crate(-0.45, bed + 0.04, 0.3, 0.7, 0.4, 0.5, 0.05);
    crate(-0.4, bed + 0.44, 0.0, 0.6, 0.32, 0.45, -0.1);
    // An open crate bristling with rockets: paper tubes on long sticks, pointed caps.
    B.add('wood', box(0.8, 0.3, 0.6), at(0.45, bed + 0.19, 0), 0x9a7a52);
    const ROCKETS = [0xb8322a, 0x2e5a9a, 0x2f6b3a, 0xd8b23a, 0x7a3a8a];
    for (let i = 0; i < 14; i++) {
      const x = 0.45 + (rand() - 0.5) * 0.6, z = (rand() - 0.5) * 0.45, lean = (rand() - 0.5) * 0.3, lz = (rand() - 0.5) * 0.3;
      const tint = ROCKETS[i % ROCKETS.length];
      B.add('paint', cylinder(0.024, 0.024, 0.22, 8), at(x, bed + 0.45, z, lz, 0, lean), tint);
      B.add('paint', new THREE.ConeGeometry(0.026, 0.07, 8), at(x - Math.sin(lean) * 0.14, bed + 0.59, z + Math.sin(lz) * 0.14, lz, 0, lean), 0xd8c8a0);
      B.add('wood', box(0.015, 0.8, 0.015), at(x + Math.sin(lean) * 0.25, bed + 0.3, z - Math.sin(lz) * 0.25, lz, 0, lean), 0xa88858);
    }
    // The tarp, thrown back off the front of the load and hanging over the tail.
    // (Draped over the stacked crates, hanging down the back and both sides.)
    const TARP = 0x6e725c;
    B.add('cloth', solid(box(0.95, 0.03, 1.36)), at(-0.55, bed + 0.79, 0, 0, 0, 0.04), TARP);
    B.add('cloth', solid(box(0.03, 0.62, 1.36)), at(-1.03, bed + 0.5, 0, 0, 0, -0.08), TARP);
    for (const s of [-1, 1]) B.add('cloth', solid(box(0.95, 0.5, 0.03)), at(-0.55, bed + 0.55, s * 0.68, s * 0.12, 0, 0), TARP);
    this.colliders.push({ x: C.x + Math.cos(yaw) * 0.7, z: C.z - Math.sin(yaw) * 0.7, hx: 2.0, hz: 0.9, rot: yaw });
  }

  // ---------------------------------------------------------------------------------------------

  /** The birthday banner across the path in, painted on canvas between two poles. */
  _banner(B) {
    const S = PARTY.banner, nx = -PARTY.uz, nz = PARTY.ux; // across the path
    const half = 2.6;
    const a = this._pole(B, S.x - nx * half, S.z - nz * half, 3.1, 0.07);
    const b = this._pole(B, S.x + nx * half, S.z + nz * half, 3.1, 0.07);
    const y = Math.max(a.y, b.y) - 0.45;
    for (const p of [a, b]) B.add('wood', new THREE.SphereGeometry(0.09, 8, 6), mtx(p.x, p.y + 0.18, p.z), 0xd8b23a);
    // Painted canvas: cream with a red border and hand-lettered words.
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 176;
    const g = c.getContext('2d');
    const FONT = 'italic 600 78px "Cormorant Garamond", Georgia, serif';
    const paint = () => {
      const r = mulberry32(7);
      g.fillStyle = '#efe6cf';
      g.fillRect(0, 0, 1024, 176);
      for (let i = 0; i < 300; i++) {
        g.fillStyle = `rgba(120,90,50,${r() * 0.05})`;
        g.fillRect(r() * 1024, r() * 176, 40 + r() * 120, 1 + r() * 2);
      }
      g.strokeStyle = '#a8342a';
      g.lineWidth = 14;
      g.strokeRect(10, 10, 1004, 156);
      g.fillStyle = '#2f5a2a';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = FONT;
      g.fillText('Happy Birthday Bilbo Baggins', 512, 92);
    };
    paint();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    // The lettering's font may still be loading: paint again once it's in.
    document.fonts?.load(FONT).then(() => { paint(); tex.needsUpdate = true; }).catch(() => {});
    const mat = new THREE.MeshStandardNodeMaterial({ map: tex, roughness: 0.9 });
    const W = half * 2 - 0.3, H = W * (176 / 1024);
    const mid = new THREE.Vector3((a.x + b.x) / 2, y - H / 2, (a.z + b.z) / 2);
    const face = Math.atan2(nx, nz) - Math.PI / 2;
    const banner = new THREE.Group();
    for (const flip of [0, Math.PI]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
      m.position.copy(mid);
      m.rotation.y = face + flip;
      m.castShadow = m.receiveShadow = true;
      banner.add(m);
    }
    // Cords from the banner's corners to the poles.
    for (const [p, s] of [[a, -1], [b, 1]]) {
      const corner = mid.clone().add(new THREE.Vector3(nx * s * (W / 2), H / 2, nz * s * (W / 2)));
      this._rope(B, corner, p.clone().setY(y + 0.02), 0, 2);
    }
    return banner;
  }
}
