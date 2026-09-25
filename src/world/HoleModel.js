// A hobbit-hole facade, modeled on the Hobbiton set: a row of bays divided by timber posts, each bay
// capped by its own arch so the roofline is scalloped. Plaster fills the bays; the round door and
// round windows are ringed with brick (or stone) arches; a thick turf hood overhangs the whole front.
//
// Local frame: the door's threshold is the origin, the facade is the plane z = 0 facing +z, y is up,
// meters at full (1.0) scale.

import * as THREE from 'three/webgpu';
import { mtx, box, cylinder } from './Kit.js';
import { mulberry32 } from '../util/noise.js';
import { layoutBays, archY } from './FacadeLayout.js';

export { layoutBays, archY, facadeTop } from './FacadeLayout.js';

const TIMBER = 0x5c4330;
const BRICKS = [0x9c4a33, 0xae5638, 0x8a3f2c, 0xb4623f, 0x93503a];
const STONES = [0x9d968a, 0xb0a794, 0x8e877a, 0xa89e88];

// Shape following the arch curves of all bays, offset by `off` meters above the arch.
function archPoints(bays, off, N = 14) {
  const pts = [];
  for (const b of bays)
    for (let i = 0; i <= N; i++) {
      const v = b.a + (b.w * i) / N;
      pts.push(new THREE.Vector2(v, archY(b, v) + off));
    }
  return pts;
}

function band(bays, off0, off1, depth, z0) {
  const lo = archPoints(bays, off0), hi = archPoints(bays, off1);
  const shape = new THREE.Shape([...lo, ...hi.reverse()]);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, z0);
  return g;
}

/** Bricks laid radially around a circular opening. */
function brickRing(add, at, cx, cy, r, rand, material = 'brick', palette = BRICKS, depth = 0.16) {
  const course = material === 'brick' ? 0.24 : 0.34;
  const n = Math.max(10, Math.round((2 * Math.PI * (r + course / 2)) / (material === 'brick' ? 0.13 : 0.3)));
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const rr = r + course / 2;
    const w = ((2 * Math.PI * rr) / n) * 0.9;
    add(material, box(w, course, depth), at(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 0.02, 0, 0, a - Math.PI / 2),
      palette[Math.floor(rand() * palette.length)]);
  }
}

function roundWindow(add, at, spec, cx, cy, r, rand, lit) {
  // Recessed glass, painted frame, mullions clipped to the circle.
  add('glass', cylinder(r, r, 0.03, 28).rotateX(Math.PI / 2), at(cx, cy, -0.14), lit ? 0xff0000 : 0x000000);
  add('paint', new THREE.TorusGeometry(r, 0.055, 6, 28), at(cx, cy, -0.06), spec.frame);
  const bars = spec.windowStyle === 'grid' ? [-0.5, 0, 0.5] : [0];
  for (const t of bars) {
    const o = t * r, len = 2 * Math.sqrt(Math.max(0, r * r - o * o));
    add('paint', box(len, 0.035, 0.03), at(cx, cy + o, -0.11), spec.frame);
    add('paint', box(0.035, len, 0.03), at(cx + o, cy, -0.11), spec.frame);
  }
  // Sill.
  add('wood', box(r * 1.5, 0.07, 0.22), at(cx, cy - r - 0.12, 0.08), TIMBER);
}

/**
 * Add a hobbit-hole facade to builder B. `base` places the local frame in the world.
 * Returns attachment points (lantern, chimney tops) in world space.
 */
export function buildFacade(B, spec, base) {
  const rand = mulberry32(spec.seed);
  const add = (m, g, mat, tint) => B.add(m, g, mat, tint);
  const at = (x, y, z, rx, ry, rz) => base.clone().multiply(mtx(x, y, z, rx, ry, rz));
  const bays = layoutBays(spec);
  const doorR = spec.doorR;
  const arch = spec.arch; // 'brick' | 'stone' | 'none'
  const archMat = arch === 'stone' ? 'stone' : 'brick';
  const archPal = arch === 'stone' ? STONES : BRICKS;
  const lanterns = [];

  // Plaster infill for each bay, with openings.
  for (const b of bays) {
    const shape = new THREE.Shape();
    shape.moveTo(b.a, -0.3);
    for (const p of archPoints([b], 0.02)) shape.lineTo(p.x, p.y);
    shape.lineTo(b.b, -0.3);
    shape.closePath();
    if (b.kind === 'door') {
      const hole = new THREE.Path();
      hole.absarc(0, doorR + 0.02, doorR + 0.02, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    } else if (b.kind === 'bay') {
      // Tall arched window with timber tracery (like Bag End's study bay).
      const r = Math.min(0.62, b.h - 0.3), y0 = 0.55, y1 = 1.55;
      b.arched = { x: b.c, r, y0, y1 };
      const hole = new THREE.Path();
      hole.moveTo(b.c + r, y0);
      hole.lineTo(b.c + r, y1);
      hole.absarc(b.c, y1, r, 0, Math.PI, false);
      hole.lineTo(b.c - r, y0);
      hole.closePath();
      shape.holes.push(hole);
    } else if (b.kind === 'window' || b.kind === 'bigwindow' || b.kind === 'small') {
      const r = b.kind === 'bigwindow' ? Math.min(0.62, b.h - 0.3) : b.kind === 'small' ? Math.min(0.26, b.h - 0.25) : Math.min(0.36, b.h - 0.28);
      b.win = { x: b.c, y: b.kind === 'bigwindow' ? 1.25 : b.kind === 'small' ? 1.05 : 1.2, r };
      const hole = new THREE.Path();
      hole.absarc(b.win.x, b.win.y, r + 0.01, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false, curveSegments: 28 });
    g.translate(0, 0, -0.3);
    add('plaster', g, at(0, 0, 0), spec.plaster);
  }

  const hasDoor = bays.some((b) => b.kind === 'door');
  let hs = 1;
  if (hasDoor) {
  // Door: planked, painted, recessed within a timber ring and a brick arch.
  add('paint', cylinder(doorR, doorR, 0.08, 36).rotateX(Math.PI / 2), at(0, doorR + 0.02, -0.18), spec.doorColor);
  add('wood', new THREE.TorusGeometry(doorR + 0.02, 0.07, 6, 36), at(0, doorR + 0.02, -0.08), TIMBER);
  const kx = spec.knob === 'center' ? 0 : spec.knob === 'left' ? -doorR * 0.62 : doorR * 0.62;
  add('metal', new THREE.SphereGeometry(0.07, 12, 8), at(kx, doorR + 0.02, -0.1), 0xc9a24a);
  // Iron strap hinges on the side away from the knob.
  hs = kx > 0.01 ? -1 : 1;
  for (const y of [0.45, 1.45].map((t) => t * doorR))
    add('metal', box(doorR * 0.9, 0.05, 0.02), at(hs * doorR * 0.45, y + 0.02, -0.13), 0x2a2622);
  if (arch !== 'none') brickRing(add, at, 0, doorR + 0.02, doorR + 0.09, rand, archMat, archPal);
  // Threshold stone.
  add('stone', box(doorR * 2, 0.14, 0.5), at(0, 0.0, 0.2), 0xa39c8e);
  }

  // Arched bay windows: glass, a mullion grid, a timber arch and a sill.
  for (const b of bays) {
    if (!b.arched) continue;
    const { x, r, y0, y1 } = b.arched;
    add('glass', box(r * 2, y1 - y0, 0.03), at(x, (y0 + y1) / 2, -0.14), spec.lit ? 0xff0000 : 0x000000);
    add('glass', new THREE.CircleGeometry(r, 18, 0, Math.PI), at(x, y1, -0.13), spec.lit ? 0xff0000 : 0x000000);
    add('wood', new THREE.TorusGeometry(r + 0.04, 0.07, 6, 18, Math.PI), at(x, y1, -0.04), TIMBER);
    for (const s of [-1, 1]) add('wood', box(0.1, y1 - y0, 0.1), at(x + s * (r + 0.04), (y0 + y1) / 2, -0.04), TIMBER);
    for (const t of [-0.5, 0, 0.5]) add('paint', box(0.035, y1 - y0 + r * Math.sqrt(1 - t * t), 0.03), at(x + t * r, (y0 + y1 + r * Math.sqrt(1 - t * t)) / 2, -0.11), spec.frame);
    for (const yy of [y0 + (y1 - y0) / 3, y0 + (2 * (y1 - y0)) / 3, y1]) add('paint', box(r * 2, 0.035, 0.03), at(x, yy, -0.11), spec.frame);
    add('wood', box(r * 2 + 0.3, 0.09, 0.3), at(x, y0 - 0.05, 0.1), TIMBER);
    // A central king post rising to the arch crown, like the set's timber tracery.
    add('wood', box(0.12, b.spring + b.rise - y1 - r, 0.1), at(x, (y1 + r + b.spring + b.rise) / 2, 0.02), TIMBER);
  }

  // Windows.
  for (const b of bays) {
    if (!b.win) continue;
    roundWindow(add, at, spec, b.win.x, b.win.y, b.win.r, rand, spec.lit);
    if (arch !== 'none') brickRing(add, at, b.win.x, b.win.y, b.win.r + 0.06, rand, archMat, archPal, 0.12);
  }

  // Timber posts between bays with curved brackets, and a timber rib along each arch.
  const posts = [bays[0].a, ...bays.map((b) => b.b)];
  for (const v of posts) {
    const sp = Math.min(...bays.filter((b) => Math.abs(b.a - v) < 1e-3 || Math.abs(b.b - v) < 1e-3).map((b) => b.spring));
    add('wood', box(0.17, sp + 0.35, 0.17), at(v, (sp + 0.35) / 2 - 0.3, 0.06), TIMBER);
    add('wood', box(0.26, 0.1, 0.26), at(v, -0.25, 0.06), TIMBER);
    for (const s of [-1, 1]) {
      const br = new THREE.TorusGeometry(0.28, 0.045, 5, 8, Math.PI / 2);
      add('wood', br, at(v + s * 0.28, sp - 0.28, 0.06, 0, 0, s > 0 ? Math.PI / 2 : 0), TIMBER);
    }
  }
  add('wood', band(bays, 0.0, 0.13, 0.22, -0.08), at(0, 0, 0), TIMBER);

  // The turf hood: a thick overhanging lip of grassy earth following the arches.
  add('turf', band(bays, 0.12, 0.55, 2.15, -1.6), at(0, 0, 0), 0xffffff);
  // Shaggy grass: strands hanging from the hood's front lip, tufts along its top.
  for (const p of archPoints(bays, 0.14, 22)) {
    const len = 0.18 + rand() * 0.28, w = 0.22 + rand() * 0.14;
    const card = new THREE.PlaneGeometry(w, len).translate(0, -len / 2, 0);
    add('fringe', card, at(p.x + (rand() - 0.5) * 0.1, p.y + 0.02, 0.56 + rand() * 0.04, -0.25 - rand() * 0.3, (rand() - 0.5) * 0.4, 0), 0xffffff);
  }
  for (const p of archPoints(bays, 0.5, 16)) {
    const len = 0.2 + rand() * 0.2, w = 0.3;
    const card = new THREE.PlaneGeometry(w, len).rotateZ(Math.PI).translate(0, len / 2, 0);
    add('fringe', card, at(p.x, p.y, 0.35 + rand() * 0.15, 0.3, (rand() - 0.5) * 0.8, 0), 0xffffff);
  }

  // Lantern on the post beside the door (away from the knob side).
  const lv = bays.find((b) => b.kind === 'door');
  if (!lv) return { lanterns, bays };
  const lx = hs > 0 ? lv.b : lv.a;
  add('metal', box(0.03, 0.03, 0.35), at(lx, lv.spring - 0.2, 0.28), 0x2a2622);
  add('metal', box(0.17, 0.24, 0.17), at(lx, lv.spring - 0.38, 0.42), 0x2a2622);
  add('glass', box(0.12, 0.17, 0.12), at(lx, lv.spring - 0.38, 0.42), 0xff0000);
  lanterns.push(new THREE.Vector3(lx, lv.spring - 0.38, 0.55).applyMatrix4(base));

  return { lanterns, bays };
}
