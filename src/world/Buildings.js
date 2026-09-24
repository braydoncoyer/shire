// The set's bigger buildings: the double-arched stone bridge, the Mill with its turning waterwheel,
// and the Green Dragon (exterior shell here; the interior is furnished separately). Built from the
// Kit and merged per material.

import * as THREE from 'three/webgpu';
import { Builder, mtx, box, cylinder } from './Kit.js';
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
    const W = 8, D = 7, H1 = 3.4, H2 = 2.8, T = 0.45;
    // Local frame: +z points away from the stream; the wheel side is -z.
    const door = [{ x0: -0.7, x1: 0.7, y0: 0, y1: 2.2 }];
    const win = (x) => ({ x0: x - 0.45, x1: x + 0.45, y0: 1.1, y1: 2.2 });
    B.add('stone', box(W + 0.6, 0.6, D + 0.6), at(0, -0.2, 0), STONE_DARK); // plinth
    wall(B, 'stone', at, -W / 2, W / 2, D / 2 - T / 2, 0, H1, T, [...door, win(-2.3), win(2.3)], STONE);
    wall(B, 'stone', at, -W / 2, W / 2, -D / 2 + T / 2, 0, H1, T, [win(-2)], STONE);
    for (const s of [-1, 1]) B.add('stone', box(T, H1, D - T * 2), at(s * (W / 2 - T / 2), H1 / 2, 0), STONE);
    B.add('wood', box(1.4, 2.2, 0.06), at(0, 1.1, D / 2 - 0.1), 0x6a4a30); // door
    for (const x of [-2.3, 2.3]) this._window(B, at, x, 1.65, D / 2 - T / 2, 0.9, 1.1, x < 0);
    this._window(B, at, -2, 1.65, -D / 2 + T / 2, 0.9, 1.1, false);

    // Upper storey: plaster with dark timber framing, slightly jettied.
    const j = 0.25;
    B.add('plaster', box(W + j * 2, H2, D + j * 2), at(0, H1 + H2 / 2, 0), PLASTER);
    for (const s of [-1, 1]) {
      for (let x = -W / 2 - j; x <= W / 2 + j + 0.01; x += (W + 2 * j) / 5)
        B.add('wood', box(0.16, H2, 0.06), at(x, H1 + H2 / 2, s * (D / 2 + j + 0.02)), TIMBER);
      B.add('wood', box(W + j * 2 + 0.1, 0.18, 0.08), at(0, H1 + 0.09, s * (D / 2 + j + 0.03)), TIMBER);
      B.add('wood', box(W + j * 2 + 0.1, 0.16, 0.08), at(0, H1 + H2 - 0.08, s * (D / 2 + j + 0.03)), TIMBER);
      for (const x of [-2.4, 2.4]) {
        B.add('glass', box(0.9, 0.9, 0.05), at(x, H1 + 1.4, s * (D / 2 + j + 0.05)), 0xff0000);
        B.add('wood', box(1.05, 1.05, 0.04), at(x, H1 + 1.4, s * (D / 2 + j + 0.035)), TIMBER);
      }
    }
    const rise = gableRoof(B, at, W + j * 2, D + j * 2, H1 + H2, 0.78, 0.5, ROOF);
    void rise;
    // Chimney.
    B.add('brick', box(0.7, 3.2, 0.7), at(W / 2 - 1.2, H1 + H2 + 1.6, 1.2), 0x9a5236);
    this.chimneys.push(new THREE.Vector3(W / 2 - 1.2, H1 + H2 + 3.3, 1.2).applyMatrix4(base));
    this.lamps.push(new THREE.Vector3(1.2, 2.4, D / 2 + 0.4).applyMatrix4(base));
    B.add('metal', box(0.2, 0.3, 0.2), at(1.2, 2.4, D / 2 + 0.25), 0x2a2a2a);
    B.add('glass', box(0.14, 0.22, 0.14), at(1.2, 2.4, D / 2 + 0.25), 0xff0000);

    // Waterwheel on the stream side, turning on its own.
    const wheelB = new Builder();
    const R = 2.3, width = 1.0, paddles = 16;
    for (const s of [-1, 1]) wheelB.add('wood', new THREE.TorusGeometry(R, 0.1, 6, 32), mtx(0, 0, s * width / 2), TIMBER);
    for (const s of [-1, 1]) wheelB.add('wood', new THREE.TorusGeometry(R * 0.45, 0.07, 6, 20), mtx(0, 0, s * width / 2), TIMBER);
    for (let k = 0; k < paddles; k++) {
      const a = (k / paddles) * Math.PI * 2;
      wheelB.add('wood', box(0.08, 0.55, width), mtx(Math.cos(a) * (R - 0.2), Math.sin(a) * (R - 0.2), 0, 0, 0, a), 0x6e5238);
      if (k % 2 === 0) for (const s of [-1, 1]) wheelB.add('wood', box(R * 2 * 0.98, 0.1, 0.08), mtx(0, 0, s * width / 2, 0, 0, a), TIMBER);
    }
    wheelB.add('metal', cylinder(0.14, 0.14, width + 1.4, 10), mtx(0, 0, 0, Math.PI / 2), 0x3a3632);
    this.wheel = wheelB.build(this.mats);
    const axleY = M.water - M.y + R - 0.45; // bottom paddles dip into the stream
    this.wheel.matrixAutoUpdate = false;
    this.wheelBase = base.clone().multiply(mtx(0, axleY, -D / 2 - width / 2 - 0.35, 0, Math.PI / 2, 0));
    this.wheelAngle = 0;
    this.group.add(this.wheel);
    // Timber frame holding the axle.
    B.add('wood', box(0.25, axleY + 1.2, 0.25), at(0, (axleY - 1.2) / 2 + 0.6 - 0.6, -D / 2 - width - 1.0), TIMBER);

    const c = Math.cos(M.yaw), s2 = Math.sin(M.yaw);
    void c; void s2;
    this.colliders.push({ x: M.x, z: M.z, hx: W / 2 + 0.3, hz: D / 2 + 0.3, rot: M.yaw });
  }

  // ---------------------------------------------------------------------------------------------

  _greenDragon(B) {
    const G = GREEN_DRAGON;
    const base = new THREE.Matrix4().makeRotationY(G.yaw).setPosition(G.x, G.y, G.z);
    const at = (x, y, z, rx, ry, rz) => base.clone().multiply(mtx(x, y, z, rx, ry, rz));
    const W = G.w, D = G.d, H1 = 3.4, H2 = 2.9, T = 0.5, j = 0.3;
    // Local frame: +z is the front (facing the bridge), x along the facade.

    // Floor and plinth.
    B.add('stone', box(W + 0.6, 0.5, D + 0.6), at(0, -0.1, 0), STONE_DARK);
    B.add('wood', box(W - T * 2, 0.1, D - T * 2), at(0, 0.2, 0), 0x6b4c34);

    // Ground floor: stone, with a round-topped door and wide windows.
    const doorW = 1.5;
    const front = [{ x0: -doorW / 2, x1: doorW / 2, y0: 0.15, y1: 2.5 }];
    for (const x of [-5, -2.6, 2.6, 5]) front.push({ x0: x - 0.7, x1: x + 0.7, y0: 0.95, y1: 2.35 });
    wall(B, 'stone', at, -W / 2, W / 2, D / 2 - T / 2, 0, H1, T, front, STONE);
    const back = [{ x0: 4.2, x1: 5.4, y0: 0.15, y1: 2.3 }, { x0: -4.7, x1: -3.3, y0: 0.95, y1: 2.35 }, { x0: -0.7, x1: 0.7, y0: 0.95, y1: 2.35 }];
    wall(B, 'stone', at, -W / 2, W / 2, -D / 2 + T / 2, 0, H1, T, back, STONE);
    const sideAt = (s) => (x, y, z, rx = 0, ry = 0, rz = 0) => at(s * (W / 2 - T / 2) + 0 * x, y, -x, rx, ry + Math.PI / 2, rz).multiply(mtx(0, 0, 0));
    for (const s of [-1, 1]) {
      const side = [{ x0: -1.6, x1: -0.2, y0: 0.95, y1: 2.35 }, { x0: 1.2, x1: 2.6, y0: 0.95, y1: 2.35 }];
      wall(B, 'stone', (x, y, z, rx, ry, rz) => base.clone().multiply(mtx(s * (W / 2 - T / 2), 0, 0, 0, s * Math.PI / 2, 0)).multiply(mtx(x, y, z, rx, ry, rz)),
        -D / 2 + T, D / 2 - T, 0, 0, H1, T, side, STONE);
    }
    void sideAt;
    // Round arch over the door, the door itself (ajar), glazing with lit panes.
    B.add('stone', new THREE.TorusGeometry(doorW / 2 + 0.12, 0.16, 6, 20, Math.PI), at(0, 2.5, D / 2 + 0.02), STONE_DARK);
    B.add('stone', box(doorW, doorW / 2, T), at(0, 2.5 + doorW / 4, D / 2 - T / 2), STONE);
    B.add('paint', box(doorW - 0.1, 2.3, 0.08), at(-doorW / 2 + 0.05, 1.3, D / 2 + 0.55, 0, 1.2, 0).multiply(mtx((doorW - 0.1) / 2, 0, 0)), 0x2f6b3a);
    for (const o of front.slice(1)) this._window(B, at, (o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2, D / 2 - T / 2, o.x1 - o.x0, o.y1 - o.y0, true);
    for (const o of back.slice(1)) this._window(B, at, (o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2, -D / 2 + T / 2, o.x1 - o.x0, o.y1 - o.y0, true);
    for (const s of [-1, 1])
      for (const z of [0.9, -1.9]) {
        const m = base.clone().multiply(mtx(s * (W / 2 - T / 2), 0, z, 0, Math.PI / 2, 0));
        this._window(B, (x, y, zz, rx, ry, rz) => m.clone().multiply(mtx(x, y, zz, rx, ry, rz)), 0, 1.65, 0, 1.4, 1.4, true);
      }

    // Upper storey: jettied, plaster between dark timbers, with a row of windows.
    B.add('plaster', box(W + j * 2, H2, D + j * 2), at(0, H1 + H2 / 2, 0), PLASTER);
    for (const s of [-1, 1]) {
      const zf = s * (D / 2 + j + 0.02);
      for (let x = -W / 2 - j; x <= W / 2 + j + 0.01; x += (W + 2 * j) / 8) B.add('wood', box(0.18, H2, 0.07), at(x, H1 + H2 / 2, zf), TIMBER);
      B.add('wood', box(W + j * 2 + 0.1, 0.22, 0.1), at(0, H1 + 0.11, zf), TIMBER);
      B.add('wood', box(W + j * 2 + 0.1, 0.18, 0.1), at(0, H1 + H2 - 0.09, zf), TIMBER);
      for (let k = 0; k < 7; k++) {
        const x = -W / 2 - j + ((k + 0.5) * (W + 2 * j)) / 8;
        B.add('wood', box(0.12, 1.8, 0.07), at(x, H1 + H2 / 2, zf, 0, 0, (k % 2 ? 1 : -1) * 0.55), TIMBER);
      }
      for (const x of [-4.3, 0, 4.3]) this._window(B, at, x, H1 + 1.45, s * (D / 2 + j), 1.1, 1.0, s > 0 || x !== 0);
    }
    for (const s of [-1, 1]) {
      const zf = s * (W / 2 + j + 0.02);
      const m = base.clone().multiply(mtx(0, 0, 0, 0, Math.PI / 2, 0));
      for (let x = -D / 2 - j; x <= D / 2 + j + 0.01; x += (D + 2 * j) / 5) B.add('wood', box(0.18, H2, 0.07), m.clone().multiply(mtx(x, H1 + H2 / 2, zf)), TIMBER);
    }

    // Main roof, plus a cross gable over the entrance, two chimneys.
    gableRoof(B, at, W + j * 2, D + j * 2, H1 + H2, 0.72, 0.55, ROOF);
    const cg = base.clone().multiply(mtx(0, 0, D / 2 - 1.0, 0, Math.PI / 2, 0));
    gableRoof(B, (x, y, z, rx, ry, rz) => cg.clone().multiply(mtx(x, y, z, rx, ry, rz)), 4.0, 4.4, H1 + H2 - 0.2, 0.8, 0.4, ROOF);
    for (const x of [-W / 2 + 1.5, W / 2 - 2.2]) {
      B.add('brick', box(0.8, 5.5, 0.8), at(x, H1 + H2 + 1.6, -1.4), 0x9a5236);
      B.add('brick', cylinder(0.12, 0.14, 0.4, 10), at(x, H1 + H2 + 4.5, -1.4), 0xa8603e);
      this.chimneys.push(new THREE.Vector3(x, H1 + H2 + 4.8, -1.4).applyMatrix4(base));
    }

    // Porch canopy over the door with the hanging sign.
    for (const s of [-1, 1]) B.add('wood', box(0.2, 2.9, 0.2), at(s * 1.35, 1.45, D / 2 + 1.7), TIMBER);
    B.add('roof', box(3.3, 0.12, 2.1), at(0, 3.05, D / 2 + 1.0, 0.22), ROOF);
    B.add('metal', box(0.06, 0.06, 1.3), at(-2.3, 3.0, D / 2 + 0.65), 0x2a2a2a);
    B.add('paint', box(0.06, 0.95, 0.8), at(-2.3, 2.45, D / 2 + 1.0), 0x2f6b3a); // the sign
    B.add('paint', box(0.07, 0.55, 0.45), at(-2.3, 2.45, D / 2 + 1.0), 0xc8a232); // dragon emblem

    // Lanterns either side of the door.
    for (const s of [-1, 1]) {
      B.add('metal', box(0.22, 0.34, 0.22), at(s * 1.1, 2.55, D / 2 + 0.2), 0x2a2a2a);
      B.add('glass', box(0.16, 0.26, 0.16), at(s * 1.1, 2.55, D / 2 + 0.2), 0xff0000);
      this.lamps.push(new THREE.Vector3(s * 1.1, 2.55, D / 2 + 0.4).applyMatrix4(base));
    }

    // Outdoor tables and benches in the forecourt, and barrels.
    const tables = [[-4.5, 4.2], [4.5, 4.2], [-4.8, 7.4], [4.2, 7.6]];
    for (const [x, z] of tables) {
      B.add('wood', box(2.0, 0.08, 0.85), at(x, 0.75, D / 2 + z - D / 2 + 1), 0x7a5a3e);
      for (const s of [-1, 1]) {
        B.add('wood', box(0.1, 0.72, 0.7), at(x + s * 0.8, 0.37, D / 2 + z - D / 2 + 1), 0x5a4130);
        B.add('wood', box(2.0, 0.07, 0.3), at(x, 0.45, D / 2 + z - D / 2 + 1 + s * 0.65), 0x7a5a3e);
      }
      const [wx, wz] = [G.x + (x * Math.cos(G.yaw) + (z + 1) * Math.sin(G.yaw)), G.z + (-x * Math.sin(G.yaw) + (z + 1) * Math.cos(G.yaw))];
      this.colliders.push({ x: wx, z: wz, hx: 1.1, hz: 0.8, rot: G.yaw });
    }
    for (const [x, z] of [[W / 2 + 0.7, 2.2], [W / 2 + 0.7, 3.1], [-W / 2 - 0.7, 3.8]]) {
      B.add('wood', cylinder(0.36, 0.4, 0.95, 14), at(x, 0.47, z), 0x6e4e32);
      for (const y of [0.18, 0.76]) B.add('metal', cylinder(0.405, 0.405, 0.05, 14, true), at(x, y, z), 0x3a3632);
    }

    // Walls as colliders, leaving the door open.
    const toWorld = (lx, lz) => [G.x + lx * Math.cos(G.yaw) + lz * Math.sin(G.yaw), G.z - lx * Math.sin(G.yaw) + lz * Math.cos(G.yaw)];
    const wallC = (lx, lz, hx, hz) => { const [x, z] = toWorld(lx, lz); this.colliders.push({ x, z, hx, hz, rot: G.yaw }); };
    const fw = (W / 2 - doorW / 2) / 2;
    wallC(-doorW / 2 - fw, D / 2 - T / 2, fw, T / 2);
    wallC(doorW / 2 + fw, D / 2 - T / 2, fw, T / 2);
    wallC(0, -D / 2 + T / 2, W / 2, T / 2);
    wallC(-W / 2 + T / 2, 0, T / 2, D / 2);
    wallC(W / 2 - T / 2, 0, T / 2, D / 2);
    // Porch posts.
    for (const s of [-1, 1]) { const [x, z] = toWorld(s * 1.35, D / 2 + 1.7); this.colliders.push({ x, z, r: 0.15 }); }
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
