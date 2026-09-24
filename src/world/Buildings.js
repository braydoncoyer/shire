// The set's bigger buildings: the double-arched stone bridge, the Mill with its turning waterwheel,
// and the Green Dragon (exterior shell here; the interior is furnished separately). Built from the
// Kit and merged per material.

import * as THREE from 'three/webgpu';
import { Builder, mtx, box, cylinder, thatchRoof } from './Kit.js';
import { BRIDGE, bridgeDeck, MILL, GREEN_DRAGON } from './Layout.js';

const STONE = 0xb4a992, STONE_DARK = 0x958b78, TIMBER = 0x5a4130, PLASTER = 0xe6dcc3, ROOF = 0x5d4a3e;

/** A wall along local x from x0 to x1 (at z, thickness t), height h from y0, with openings cut out. */
function wall(B, mat, at, x0, x1, z, y0, h, t, openings = [], tint = 0xffffff) {
  const cuts = openings.filter((o) => o.x1 > x0 && o.x0 < x1).sort((a, b) => a.x0 - b.x0);
  let x = x0;
  const seg = (a, b, ya, yb) => {
    if (b - a < 0.01 || yb - ya < 0.01) return;
    B.add(mat, box(b - a, yb - ya, t), at((a + b) / 2, (ya + yb) / 2, z), tint);
  };
  for (const o of cuts) {
    seg(x, o.x0, y0, y0 + h);
    seg(o.x0, o.x1, y0, y0 + o.y0); // sill
    seg(o.x0, o.x1, y0 + o.y1, y0 + h); // lintel
    x = o.x1;
  }
  seg(x, x1, y0, y0 + h);
}

/** Gable roof over a w×d footprint (ridge along x), overhang o, pitch in radians. */
function gableRoof(B, at, w, d, y, pitch, o, tint) {
  const run = d / 2 + o, rise = Math.tan(pitch) * (d / 2), slope = Math.hypot(run, Math.tan(pitch) * run);
  for (const s of [-1, 1]) {
    B.add('roof', box(w + o * 2, 0.16, slope), at(0, y + rise / 2 + 0.05 - Math.tan(pitch) * o / 2, s * (run / 2 - o / 2 + o / 2), s * pitch, 0, 0), tint);
  }
  // Gable ends: triangles of plaster/timber.
  const tri = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rise)]);
  const g = new THREE.ExtrudeGeometry(tri, { depth: 0.25, bevelEnabled: false });
  for (const s of [-1, 1]) B.add('plaster', g.clone(), at(s * (w / 2 - 0.12), y, 0, 0, Math.PI / 2, 0).multiply(mtx(0, 0, -0.125)), PLASTER);
  return rise;
}

export class Buildings {
  constructor(mats) {
    this.mats = mats;
    this.colliders = [];
    this.lamps = []; // warm lights for night (M4)
    this.chimneys = [];
    this.group = new THREE.Group();
    const B = new Builder();
    this._bridge(B);
    this._mill(B);
    this._greenDragon(B);
    this.group.add(B.build(mats));
  }

  // ---------------------------------------------------------------------------------------------

  _bridge(B) {
    const Br = BRIDGE;
    const base = new THREE.Matrix4().makeRotationY(Br.yaw).setPosition(Br.x, 0, Br.z);
    const at = (x, y, z, rx, ry, rz) => base.clone().multiply(mtx(x, y, z, rx, ry, rz));

    // Side profile: humped deck over two round arches with a pier between them.
    const bottom = Br.water - 1.4;
    const spring = Br.water - 0.2, r = 2.45, cxs = [-2.95, 2.95];
    const shape = new THREE.Shape();
    const N = 40;
    shape.moveTo(-Br.half, bottom);
    for (let i = 0; i <= N; i++) {
      const t = -Br.half + (2 * Br.half * i) / N;
      shape.lineTo(t, bridgeDeck(t) - 0.02);
    }
    shape.lineTo(Br.half, bottom);
    shape.closePath();
    for (const cx of cxs) {
      const hole = new THREE.Path();
      hole.moveTo(cx - r, bottom + 0.2);
      hole.lineTo(cx + r, bottom + 0.2);
      hole.lineTo(cx + r, spring);
      hole.absarc(cx, spring, r, 0, Math.PI, false);
      hole.closePath();
      shape.holes.push(hole);
    }
    const body = new THREE.ExtrudeGeometry(shape, { depth: Br.width, bevelEnabled: false, curveSegments: 24 });
    // uv in meters for the stone pattern: side faces use (x, y); ExtrudeGeometry already does.
    B.add('stone', body, at(0, 0, -Br.width / 2), STONE);

    // Arch rings (voussoirs) on both faces.
    for (const cx of cxs)
      for (const s of [-1, 1]) {
        const ring = new THREE.TorusGeometry(r + 0.18, 0.2, 6, 24, Math.PI);
        B.add('stone', ring, at(cx, spring, s * (Br.width / 2 + 0.02)), STONE_DARK);
      }

    // Parapets following the deck.
    for (const s of [-1, 1]) {
      const p = new THREE.Shape();
      p.moveTo(-Br.half, bridgeDeck(-Br.half) - 0.1);
      for (let i = 0; i <= N; i++) {
        const t = -Br.half + (2 * Br.half * i) / N;
        p.lineTo(t, bridgeDeck(t) + 0.75);
      }
      for (let i = N; i >= 0; i--) {
        const t = -Br.half + (2 * Br.half * i) / N;
        p.lineTo(t, bridgeDeck(t) - 0.1);
      }
      const g = new THREE.ExtrudeGeometry(p, { depth: 0.32, bevelEnabled: false });
      B.add('stone', g, at(0, 0, s * (Br.width / 2) - (s > 0 ? 0.32 : 0)), STONE_DARK);
      // Coping stones on top.
      for (let t = -Br.half + 0.4; t < Br.half; t += 0.8)
        B.add('stone', box(0.78, 0.12, 0.4), at(t, bridgeDeck(t) + 0.8, s * (Br.width / 2 - 0.16), 0, 0, Math.atan((bridgeDeck(t + 0.1) - bridgeDeck(t - 0.1)) / 0.2)), 0xa19782);
      // Parapets block walking off the sides.
      const [cxw, czw] = [Br.x + Br.dz * s * (Br.width / 2 - 0.16), Br.z - Br.dx * s * (Br.width / 2 - 0.16)];
      this.colliders.push({ x: cxw, z: czw, hx: Br.half, hz: 0.18, rot: Br.yaw });
    }
  }

  // ---------------------------------------------------------------------------------------------

  _mill(B) {
    const M = MILL;
    const base = new THREE.Matrix4().makeRotationY(M.yaw).setPosition(M.x, M.y, M.z);
    const at = (x, y, z, rx, ry, rz) => base.clone().multiply(mtx(x, y, z, rx, ry, rz));
    const toWorld = (lx, lz) => new THREE.Vector3(lx, 0, lz).applyMatrix4(base);
    // Sandyman's Mill, from its mapped 16 × 9 m footprint: a fieldstone ground course, ochre plaster
    // and dark timber above, heavy thatch, a stone chimney, a blue door, and the wheel on the water
    // side (local −z faces the water).
    const W = Math.min(M.len, 14), D = Math.min(M.wid, 8), H = 3.3, T = 0.4;
    const CREAM = 0xd6b25e;
    B.add('stone', box(W + 0.6, 0.8, D + 0.6), at(0, -0.3, 0), STONE_DARK);
    const door = { x0: 1.2, x1: 2.4, y0: 0, y1: 2.1 };
    const win = (x) => ({ x0: x - 0.5, x1: x + 0.5, y0: 1.1, y1: 2.1 });
    const walls = [
      { m: base.clone().multiply(mtx(0, 0, D / 2 - T / 2)), len: W, open: [door, win(-2.5), win(4.5)] },
      { m: base.clone().multiply(mtx(0, 0, -D / 2 + T / 2, 0, Math.PI, 0)), len: W, open: [win(-1.5), win(3)] },
      { m: base.clone().multiply(mtx(W / 2 - T / 2, 0, 0, 0, Math.PI / 2, 0)), len: D - T * 2, open: [win(0)] },
      { m: base.clone().multiply(mtx(-W / 2 + T / 2, 0, 0, 0, -Math.PI / 2, 0)), len: D - T * 2, open: [] },
    ];
    for (const w of walls) {
      const wat = (x, y, z, rx, ry, rz) => w.m.clone().multiply(mtx(x, y, z, rx, ry, rz));
      // Stone up to the sills, plaster above, timber frame over it.
      wall(B, 'stone', wat, -w.len / 2, w.len / 2, 0, 0, 1.0, T, w.open.filter((o) => o.y0 < 1), STONE);
      wall(B, 'plaster', wat, -w.len / 2, w.len / 2, 0, 1.0, H - 1.0, T, w.open.map((o) => ({ ...o, y0: Math.max(0, o.y0 - 1), y1: o.y1 - 1 })), CREAM);
      B.add('wood', box(w.len + 0.1, 0.18, 0.1), wat(0, 1.0, T / 2 + 0.03), TIMBER);
      B.add('wood', box(w.len + 0.1, 0.2, 0.1), wat(0, H - 0.1, T / 2 + 0.03), TIMBER);
      const n = Math.max(2, Math.round(w.len / 2));
      for (let k = 0; k <= n; k++) {
        const x = -w.len / 2 + (k * w.len) / n;
        if (w.open.some((o) => x > o.x0 - 0.1 && x < o.x1 + 0.1)) continue;
        B.add('wood', box(0.15, H - 1.0, 0.1), wat(x, 1.0 + (H - 1.0) / 2, T / 2 + 0.03), TIMBER);
      }
      for (const o of w.open) {
        if (o === door) continue;
        this._window(B, wat, (o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2, 0, o.x1 - o.x0, o.y1 - o.y0, true);
      }
    }
    // Blue plank door under a little timber hood.
    B.add('paint', box(door.x1 - door.x0 - 0.05, door.y1 - door.y0, 0.07), at((door.x0 + door.x1) / 2, (door.y0 + door.y1) / 2, D / 2 - 0.05), 0x2e5a9a);
    B.add('wood', box(door.x1 - door.x0 + 0.4, 0.14, 0.2), at((door.x0 + door.x1) / 2, door.y1 + 0.1, D / 2 + 0.05), TIMBER);
    // Thatch and a big fieldstone chimney at the east gable.
    B.add('thatch', thatchRoof(W + 1.4, D + 1.6, 3.4, { hip: 5, side: 1.3 }), at(0, H - 0.3, 0), 0xffffff);
    B.add('stone', box(1.3, 7.0, 1.1), at(W / 2 + 0.35, 2.9, -0.8), STONE);
    B.add('stone', box(1.0, 0.25, 0.9), at(W / 2 + 0.35, 6.5, -0.8), STONE_DARK);
    this.chimneys.push(toWorld(W / 2 + 0.35, -0.8).setY(M.y + 6.8));
    this.lamps.push(toWorld(door.x0 - 0.35, D / 2 + 0.3).setY(M.y + 2.2));
    B.add('metal', box(0.2, 0.3, 0.2), at(door.x0 - 0.35, 2.2, D / 2 + 0.15), 0x2a2a2a);
    B.add('glass', box(0.14, 0.22, 0.14), at(door.x0 - 0.35, 2.2, D / 2 + 0.15), 0xff0000);

    // The waterwheel on the water side, turning on its own.
    const wheelB = new Builder();
    const R = 2.2, width = 1.0, paddles = 16;
    for (const sd of [-1, 1]) wheelB.add('wood', new THREE.TorusGeometry(R, 0.1, 6, 32), mtx(0, 0, sd * width / 2), TIMBER);
    for (const sd of [-1, 1]) wheelB.add('wood', new THREE.TorusGeometry(R * 0.45, 0.07, 6, 20), mtx(0, 0, sd * width / 2), TIMBER);
    for (let k = 0; k < paddles; k++) {
      const a = (k / paddles) * Math.PI * 2;
      wheelB.add('wood', box(0.08, 0.55, width), mtx(Math.cos(a) * (R - 0.2), Math.sin(a) * (R - 0.2), 0, 0, 0, a), 0x6e5238);
      if (k % 2 === 0) for (const sd of [-1, 1]) wheelB.add('wood', box(R * 2 * 0.98, 0.1, 0.08), mtx(0, 0, sd * width / 2, 0, 0, a), TIMBER);
    }
    wheelB.add('metal', cylinder(0.14, 0.14, width + 1.4, 10), mtx(0, 0, 0, Math.PI / 2), 0x3a3632);
    this.wheel = wheelB.build(this.mats);
    const axleY = M.water - M.y + R - 0.45; // bottom paddles dip into the water
    this.wheel.matrixAutoUpdate = false;
    this.wheelBase = base.clone().multiply(mtx(-2, axleY, -D / 2 - width / 2 - 0.35, 0, Math.PI / 2, 0));
    this.wheelAngle = 0;
    this.group.add(this.wheel);
    B.add('wood', box(0.25, Math.max(0.5, -axleY + 2.4), 0.25), at(-2, axleY / 2, -D / 2 - width - 1.0), TIMBER);

    this.colliders.push({ x: M.x, z: M.z, hx: W / 2 + 0.3, hz: D / 2 + 0.3, rot: M.yaw });
  }

  // ---------------------------------------------------------------------------------------------

  _greenDragon(B) {
    const G = GREEN_DRAGON;
    const base = new THREE.Matrix4().makeRotationY(G.yaw).setPosition(G.x, G.y, G.z);
    const at = (x, y, z, rx, ry, rz) => base.clone().multiply(mtx(x, y, z, rx, ry, rz));
    const toWorld = (lx, lz) => new THREE.Vector3(lx, 0, lz).applyMatrix4(base);
    // Local frame: +z is the front (facing the bridge and the lake), x along the facade.
    // Single storey, cream plaster between dark oak timbers, round-headed doors and windows, and
    // heavy rounded thatch over several wings (as on the set).
    const H = 2.7, T = 0.35;
    const CREAM = 0xd6b25e; // ochre lime plaster, as on the set
    const THATCH = 0xffffff; // the thatch material carries its own weathered grey-brown
    // Wings: [center x, center z, width, depth, wall height, roof rise]
    const wings = [
      { x: 0, z: 0, w: 19, d: 9, h: H, rise: 4.0 }, // main hall
      { x: -12.4, z: -1.2, w: 6.4, d: 8.4, h: H - 0.1, rise: 3.6 }, // west wing (kitchen, big chimney)
      { x: 12.2, z: 1.2, w: 6, d: 6.6, h: H - 0.2, rise: 3.2 }, // east snug
      { x: 4, z: -8.5, w: 9, d: 6.5, h: H - 0.2, rise: 3.3 }, // back wing
    ];
    const doorW = 1.7;
    for (const [wi, wg] of wings.entries()) {
      const wat = (x, y, z, rx, ry, rz) => at(wg.x + x, y, wg.z + z, rx, ry, rz);
      B.add('stone', box(wg.w + 0.4, 0.45, wg.d + 0.4), wat(0, -0.1, 0), STONE_DARK);
      // Openings on the front: arched windows, and the main door in the hall.
      const front = [];
      const nWin = Math.max(1, Math.round(wg.w / 3.3));
      for (let k = 0; k < nWin; k++) {
        const x = -wg.w / 2 + ((k + 0.5) * wg.w) / nWin;
        if (wi === 0 && Math.abs(x) < 2) continue;
        front.push({ x0: x - 0.55, x1: x + 0.55, y0: 0.85, y1: 2.0, arch: true });
      }
      if (wi === 0) front.push({ x0: -doorW / 2, x1: doorW / 2, y0: 0.15, y1: 2.1, arch: true, door: true });
      if (wi === 2) front.push({ x0: -0.5, x1: 0.5, y0: 0.15, y1: 1.95, arch: true, door: true });
      const sides = [
        { at: (x, y, z, rx, ry, rz) => wat(0, 0, 0, 0, 0, 0).multiply(mtx(0, 0, wg.d / 2 - T / 2)).multiply(mtx(x, y, z, rx, ry, rz)), len: wg.w, open: front },
        { at: (x, y, z, rx, ry, rz) => wat(0, 0, 0, 0, Math.PI, 0).multiply(mtx(0, 0, wg.d / 2 - T / 2)).multiply(mtx(x, y, z, rx, ry, rz)), len: wg.w, open: [{ x0: -0.55, x1: 0.55, y0: 0.85, y1: 2.0, arch: true }] },
        { at: (x, y, z, rx, ry, rz) => wat(0, 0, 0, 0, Math.PI / 2, 0).multiply(mtx(0, 0, wg.w / 2 - T / 2)).multiply(mtx(x, y, z, rx, ry, rz)), len: wg.d, open: wi === 1 ? [] : [{ x0: -0.55, x1: 0.55, y0: 0.85, y1: 2.0, arch: true }] },
        { at: (x, y, z, rx, ry, rz) => wat(0, 0, 0, 0, -Math.PI / 2, 0).multiply(mtx(0, 0, wg.w / 2 - T / 2)).multiply(mtx(x, y, z, rx, ry, rz)), len: wg.d, open: wi === 2 ? [] : [{ x0: -0.55, x1: 0.55, y0: 0.85, y1: 2.0, arch: true }] },
      ];
      for (const sd of sides) {
        // Skip wall faces buried inside a neighboring wing.
        wall(B, 'plaster', sd.at, -sd.len / 2, sd.len / 2, 0, 0, wg.h, T, sd.open, CREAM);
        // Timber: sill beam, wall plate, posts, and curved braces.
        B.add('wood', box(sd.len + 0.1, 0.2, 0.1), sd.at(0, 0.1, T / 2 + 0.03), TIMBER);
        B.add('wood', box(sd.len + 0.1, 0.22, 0.1), sd.at(0, wg.h - 0.11, T / 2 + 0.03), TIMBER);
        const posts = Math.max(2, Math.round(sd.len / 2.2));
        for (let k = 0; k <= posts; k++) {
          const x = -sd.len / 2 + (k * sd.len) / posts;
          if (sd.open.some((o) => x > o.x0 - 0.12 && x < o.x1 + 0.12)) continue;
          B.add('wood', box(0.16, wg.h, 0.1), sd.at(x, wg.h / 2, T / 2 + 0.03), TIMBER);
          for (const s of [-1, 1]) {
            if (sd.open.some((o) => x + s * 0.6 > o.x0 - 0.1 && x + s * 0.6 < o.x1 + 0.1)) continue;
            B.add('wood', new THREE.TorusGeometry(0.55, 0.05, 5, 8, Math.PI / 2), sd.at(x + s * 0.55, wg.h - 0.75, T / 2 + 0.05, 0, 0, s > 0 ? Math.PI / 2 : 0), TIMBER);
          }
          // Diagonal braces across the plain panel to the right of this post.
          const nx = x + sd.len / posts;
          if (k < posts && !sd.open.some((o) => o.x1 > x - 0.1 && o.x0 < nx + 0.1)) {
            const pw = nx - x, ph = wg.h - 0.45, ang = Math.atan2(ph, pw), len = Math.hypot(pw, ph);
            for (const s of [-1, 1]) B.add('wood', box(len, 0.12, 0.08), sd.at(x + pw / 2, 0.22 + ph / 2, T / 2 + 0.06, 0, 0, s * ang), TIMBER);
          }
        }
        // Round-headed openings: timber arch, glazing (lit), or a glowing doorway.
        for (const o of sd.open) {
          const cx = (o.x0 + o.x1) / 2, r = (o.x1 - o.x0) / 2, top = o.y1;
          B.add('wood', new THREE.TorusGeometry(r + 0.06, 0.08, 6, 16, Math.PI), sd.at(cx, top, T / 2 + 0.04), TIMBER);
          B.add('plaster', box(o.x1 - o.x0, r, T), sd.at(cx, top + r / 2, 0), CREAM); // filled above the arch spring
          if (o.door) {
            B.add('glass', box(o.x1 - o.x0 - 0.05, o.y1 - o.y0 + r * 0.6, 0.05), sd.at(cx, (o.y0 + o.y1 + r * 0.6) / 2, -T / 2 + 0.05), 0xff0000);
            B.add('paint', box((o.x1 - o.x0) / 2, o.y1 - o.y0, 0.07), sd.at(o.x0, (o.y0 + o.y1) / 2, T / 2 + 0.3, 0, 1.3, 0).multiply(mtx((o.x1 - o.x0) / 4, 0, 0)), 0x2f5a34);
          } else {
            const disc = new THREE.CircleGeometry(r, 16, 0, Math.PI);
            B.add('glass', box(o.x1 - o.x0, o.y1 - o.y0, 0.04), sd.at(cx, (o.y0 + o.y1) / 2, 0), 0xff0000);
            B.add('glass', disc, sd.at(cx, top, 0.03), 0xff0000);
            B.add('wood', box(0.06, o.y1 - o.y0 + r, 0.06), sd.at(cx, (o.y0 + o.y1 + r) / 2, 0.05), TIMBER);
            for (const y of [o.y0 + (o.y1 - o.y0) * 0.5, o.y1]) B.add('wood', box(o.x1 - o.x0, 0.05, 0.06), sd.at(cx, y, 0.05), TIMBER);
            B.add('wood', box(o.x1 - o.x0 + 0.2, 0.08, 0.28), sd.at(cx, o.y0 - 0.04, T / 2 + 0.08), TIMBER);
          }
        }
      }
      // Thatch.
      B.add('thatch', thatchRoof(wg.w + 1.5, wg.d + 1.7, wg.rise, { hip: 5, side: 1.35 }), wat(0, wg.h - 0.3, 0), THATCH);
    }
    // Eyebrow dormer over the main door: a small thatch hood with a round window.
    B.add('thatch', thatchRoof(3.6, 3.0, 1.6, { hip: 2.4, side: 1.5 }), at(0, H + 1.3, 4.6, 0.1, 0, 0), THATCH);
    B.add('plaster', box(2.8, 1.3, 0.3), at(0, H + 0.6, 4.3), CREAM);
    B.add('glass', new THREE.CircleGeometry(0.42, 20), at(0, H + 0.8, 4.47), 0xff0000);
    B.add('wood', new THREE.TorusGeometry(0.45, 0.06, 6, 20), at(0, H + 0.8, 4.47), TIMBER);

    // Round turret at the west corner, with a conical thatch cap.
    {
      const tx = -16.2, tz = 2.2, r = 2.1;
      B.add('plaster', cylinder(r, r, H + 0.2, 20), at(tx, (H + 0.2) / 2, tz), CREAM);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        B.add('wood', box(0.14, H + 0.2, 0.08), at(tx + Math.cos(a) * (r + 0.02), (H + 0.2) / 2, tz + Math.sin(a) * (r + 0.02), 0, -a + Math.PI / 2, 0), TIMBER);
      }
      B.add('glass', new THREE.CircleGeometry(0.38, 18), at(tx + 0.3, 1.5, tz + r + 0.03, 0, 0.15, 0), 0xff0000);
      B.add('wood', new THREE.TorusGeometry(0.42, 0.06, 6, 18), at(tx + 0.3, 1.5, tz + r + 0.04, 0, 0.15, 0), TIMBER);
      B.add('thatch', thatchRoof(r * 2 + 1.3, r * 2 + 1.3, 3.2, { hip: 2, side: 1.3 }), at(tx, H, tz), THATCH);
      const p = toWorld(tx, tz);
      this.colliders.push({ x: p.x, z: p.z, r: r + 0.1 });
    }

    // Chimneys: a big fieldstone stack on the west end, brick stacks through the thatch.
    B.add('stone', box(1.5, 7.6, 1.3), at(-15.9, 3.6, -1.6), STONE);
    B.add('stone', box(1.1, 0.25, 1.1), at(-15.9, 7.5, -1.6), STONE_DARK);
    this.chimneys.push(toWorld(-15.9, -1.6).setY(G.y + 7.8));
    for (const [x, z, h] of [[-4.4, -1.8, 7.4], [5.6, -1.4, 7.2], [12.4, 1.0, 6.0], [4, -9, 6.4]]) {
      B.add('brick', box(0.75, h - 1.5, 0.75), at(x, 1.5 + (h - 1.5) / 2, z), 0x9a5236);
      B.add('brick', cylinder(0.13, 0.15, 0.4, 10), at(x, h + 0.2, z), 0xa8603e);
      this.chimneys.push(toWorld(x, z).setY(G.y + h + 0.45));
    }

    // Hanging sign on a bracket, lamps by the door, a lamp post on the forecourt.
    B.add('metal', box(0.06, 0.06, 1.2), at(-doorW / 2 - 1.4, 2.6, 4.6), 0x2a2a2a);
    B.add('paint', box(0.06, 0.9, 0.75), at(-doorW / 2 - 1.4, 2.05, 5.0), 0x2f5a34);
    B.add('paint', box(0.07, 0.5, 0.42), at(-doorW / 2 - 1.4, 2.05, 5.0), 0xc8a232);
    for (const s of [-1, 1]) {
      B.add('metal', box(0.2, 0.3, 0.2), at(s * (doorW / 2 + 0.35), 2.15, 4.25), 0x2a2a2a);
      B.add('glass', box(0.14, 0.22, 0.14), at(s * (doorW / 2 + 0.35), 2.15, 4.25), 0xff0000);
      this.lamps.push(toWorld(s * (doorW / 2 + 0.35), 4.45).setY(G.y + 2.15));
    }
    B.add('metal', box(0.09, 2.6, 0.09), at(1.5, 1.3, 9.5), 0x2a2622);
    B.add('metal', box(0.26, 0.36, 0.26), at(1.5, 2.75, 9.5), 0x2a2622);
    B.add('glass', box(0.18, 0.26, 0.18), at(1.5, 2.75, 9.5), 0xff0000);
    this.lamps.push(toWorld(1.5, 9.5).setY(G.y + 2.75));

    // Cobbled forecourt path to the lane, tables, barrels.
    for (let z = 4.5; z < 11; z += 0.5)
      for (let x = -1.4; x <= 1.4; x += 0.45)
        B.add('stone', box(0.4, 0.07, 0.42), at(x + (Math.round(z * 2) % 2) * 0.22, 0.02, z), [0x8f897d, 0xa29b8c, 0x7f7a70][Math.floor(Math.abs(Math.sin(x * 12.9 + z * 78.2)) * 3)]);
    const tables = [[-5.5, 6.8], [5.2, 7.0], [-6.5, 9.8]];
    for (const [x, z] of tables) {
      B.add('wood', box(2.0, 0.08, 0.85), at(x, 0.75, z), 0x7a5a3e);
      for (const s of [-1, 1]) {
        B.add('wood', box(0.1, 0.72, 0.7), at(x + s * 0.8, 0.37, z), 0x5a4130);
        B.add('wood', box(2.0, 0.07, 0.3), at(x, 0.45, z + s * 0.65), 0x7a5a3e);
      }
      const p = toWorld(x, z);
      this.colliders.push({ x: p.x, z: p.z, hx: 1.1, hz: 0.8, rot: G.yaw });
    }
    for (const [x, z] of [[7.9, 4.6], [8.7, 4.9], [-12.4, 3.2]]) {
      B.add('wood', cylinder(0.36, 0.4, 0.95, 14), at(x, 0.47, z), 0x6e4e32);
      for (const y of [0.18, 0.76]) B.add('metal', cylinder(0.405, 0.405, 0.05, 14, true), at(x, y, z), 0x3a3632);
    }

    // Walls as colliders, leaving the doors open.
    for (const [wi, wg] of wings.entries()) {
      const box2 = (lx, lz, hx, hz) => { const p = toWorld(wg.x + lx, wg.z + lz); this.colliders.push({ x: p.x, z: p.z, hx, hz, rot: G.yaw }); };
      const gap = wi === 0 ? doorW / 2 : wi === 2 ? 0.5 : 0;
      if (gap) {
        const fw = (wg.w / 2 - gap) / 2;
        box2(-gap - fw, wg.d / 2 - T / 2, fw, T / 2);
        box2(gap + fw, wg.d / 2 - T / 2, fw, T / 2);
      } else box2(0, wg.d / 2 - T / 2, wg.w / 2, T / 2);
      box2(0, -wg.d / 2 + T / 2, wg.w / 2, T / 2);
      box2(-wg.w / 2 + T / 2, 0, T / 2, wg.d / 2);
      box2(wg.w / 2 - T / 2, 0, T / 2, wg.d / 2);
    }
    this.gdFloorY = G.y + 0.25;
  }

  /** A multi-paned window set into a wall opening (w × h), centered at (x, y) on the wall line z. */
  _window(B, at, x, y, z, w, h, lit) {
    B.add('glass', box(w - 0.04, h - 0.04, 0.04), at(x, y, z), lit ? 0xff0000 : 0x000000);
    B.add('wood', box(w, 0.08, 0.1), at(x, y, z), 0xe8e2d0);
    B.add('wood', box(0.08, h, 0.1), at(x, y, z), 0xe8e2d0);
    B.add('wood', box(w + 0.16, 0.1, 0.25), at(x, y - h / 2 - 0.05, z + 0.08), 0xd8d0bc);
  }

  update(dt) {
    this.wheelAngle -= dt * 0.55;
    this.wheel.matrix.copy(this.wheelBase).multiply(new THREE.Matrix4().makeRotationZ(this.wheelAngle));
  }
}
