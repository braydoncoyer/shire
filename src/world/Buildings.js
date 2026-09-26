// The set's bigger buildings: the double-arched stone bridge, the Mill with its turning waterwheel,
// and the Green Dragon (exterior shell here; the interior is furnished separately). Built from the
// Kit and merged per material.

import * as THREE from 'three/webgpu';
import { Builder, mtx, box, cylinder, thatchRoof, lantern } from './Kit.js';
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
    this.group.add(B.build(mats));
  }

  // ---------------------------------------------------------------------------------------------

  _bridge(B) {
    const Br = BRIDGE;
    const base = new THREE.Matrix4().makeRotationY(Br.yaw).setPosition(Br.x, 0, Br.z);
    const at = (x, y, z, rx, ry, rz) => base.clone().multiply(mtx(x, y, z, rx, ry, rz));
    // Side profile: a gently humped deck over two low round arches with a pier between.
    const bottom = Br.water - 1.4;
    const r = 1.75, spring = Br.water - 0.35, cxs = [-2.3, 2.3];
    const N = 40, W = Br.width;
    const shape = new THREE.Shape();
    shape.moveTo(-Br.half, bottom);
    for (let i = 0; i <= N; i++) {
      const t = -Br.half + (2 * Br.half * i) / N;
      shape.lineTo(t, bridgeDeck(t) - 0.12);
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
    B.add('stone', new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: false, curveSegments: 24 }), at(0, 0, -W / 2), STONE);
    for (const cx of cxs)
      for (const s of [-1, 1]) B.add('stone', new THREE.TorusGeometry(r + 0.16, 0.18, 6, 24, Math.PI), at(cx, spring, s * (W / 2 + 0.02)), STONE_DARK);

    // Gravel deck: the lane runs straight over.
    for (let i = 0; i < N; i++) {
      const t0 = -Br.half + (2 * Br.half * i) / N, t1 = t0 + (2 * Br.half) / N;
      const y0 = bridgeDeck(t0), y1 = bridgeDeck(t1);
      B.add('plaster', box(t1 - t0 + 0.02, 0.12, W - 0.9), at((t0 + t1) / 2, (y0 + y1) / 2 - 0.05, 0, 0, 0, Math.atan2(y1 - y0, t1 - t0)), 0xb09c7c);
    }

    // Thick, low parapets with big flat capstones; at each end they splay outward.
    const pw = 0.5, ph = 0.6;
    for (const s of [-1, 1]) {
      const inner = W / 2 - pw / 2;
      const pts = [];
      for (let i = 0; i <= N; i++) {
        const t = -Br.half + (2 * Br.half * i) / N;
        pts.push([t, inner]);
      }
      // Splayed wing walls beyond the ends.
      const wing = (sign) => {
        for (let k = 1; k <= 4; k++) pts[sign > 0 ? 'push' : 'unshift']([sign * (Br.half + k * 0.8), inner + k * 0.45]);
      };
      wing(1); wing(-1);
      for (let i = 0; i < pts.length - 1; i++) {
        const [t0, w0] = pts[i], [t1, w1] = pts[i + 1];
        const len = Math.hypot(t1 - t0, w1 - w0), ang = Math.atan2(w1 - w0, t1 - t0);
        const deck = (t) => (Math.abs(t) <= Br.half ? bridgeDeck(t) : lerpEnd(t));
        const lerpEnd = (t) => (t > 0 ? Br.end1 : Br.end0) + 0.1;
        const ya = deck(t0), yb = deck(t1), ym = (ya + yb) / 2;
        const tilt = Math.atan2(yb - ya, len);
        const mid = at((t0 + t1) / 2, 0, s * (w0 + w1) / 2, 0, -s * ang, 0);
        B.add('stone', box(len + 0.04, ph + 0.6, pw), mid.clone().multiply(mtx(0, ym + ph / 2 - 0.3, 0, 0, 0, tilt)), STONE);
        B.add('stone', box(len + 0.06, 0.14, pw + 0.12), mid.clone().multiply(mtx(0, ym + ph + 0.07, 0, 0, 0, tilt)), 0xc2bcae);
      }
      const [cxw, czw] = [Br.x + Br.dz * s * inner, Br.z - Br.dx * s * inner];
      this.colliders.push({ x: cxw, z: czw, hx: Br.half, hz: pw / 2, rot: Br.yaw });
    }
  }

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
    B.add('metal', box(0.04, 0.04, 0.3), at(door.x0 - 0.35, 2.45, D / 2 + 0.1), 0x2a2a2a);
    lantern(B, at(door.x0 - 0.35, 2.2, D / 2 + 0.25), 0.2);

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
    this.wheel = wheelB.build(this.mats, 1e6); // one piece: it turns as a whole
    const axleY = M.water - M.y + R - 0.45; // bottom paddles dip into the water
    this.wheel.matrixAutoUpdate = false;
    this.wheelBase = base.clone().multiply(mtx(-2, axleY, -D / 2 - width / 2 - 0.35, 0, Math.PI / 2, 0));
    this.wheelAngle = 0;
    this.group.add(this.wheel);
    B.add('wood', box(0.25, Math.max(0.5, -axleY + 2.4), 0.25), at(-2, axleY / 2, -D / 2 - width - 1.0), TIMBER);

    this.colliders.push({ x: M.x, z: M.z, hx: W / 2 + 0.3, hz: D / 2 + 0.3, rot: M.yaw });
  }

  // ---------------------------------------------------------------------------------------------

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
