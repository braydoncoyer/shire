// The Green Dragon's common room: the hall where the inn's three wings meet, entered by the main
// door from the bridge. Flagstone floor, low beamed ceiling on timber posts, ochre plaster between
// dark framing, a bar with barrels along the north partition, a big stone hearth with a fire on the
// east, and tables, benches and stools under hanging lanterns. The wings beyond are closed off by
// partitions with shut doors.
//
// The room has its own lights: the fire, the lanterns, a little daylight bouncing in through the
// windows, and the sun itself (shadowed by the walls and roof, so it only falls through windows and
// the door). Interior materials use that light set instead of the scene's, so the fire never lights
// the lawn and the sky's ambient doesn't flood the room.

import * as THREE from 'three/webgpu';
import {
  Fn, uniform, uv, vec2, vec3, vec4, float, texture, attribute, color, smoothstep, abs, pow, lights, saturate,
  mx_worley_noise_vec2,
} from 'three/tsl';
import { mtx, box, cylinder, polyDist, cleanPoly } from './Kit.js';
import { GREEN_DRAGON } from './Layout.js';

const TIMBER = 0x3e2c20, OAK = 0x6a4a30, OAK_LIGHT = 0x8a6440, PLASTER = 0xd6bf8c, FLAG = 0x7a6e5c;
export const CEILING = 2.45; // above the floor

const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/**
 * The hall's outline and its partitions, from the inn's mapped footprint: the central part where the
 * west, north and east wings meet, cut off from each wing by a partition across it.
 */
function hallPlan() {
  const v = cleanPoly(GREEN_DRAGON.poly);
  const A1 = lerp2(v[16], v[15], 0.45), A2 = lerp2(v[1], v[2], 0.91);
  const B2 = lerp2(v[8], v[7], 0.21);
  const C1 = lerp2(v[7], v[6], 0.14), C2 = lerp2(v[4], v[5], 0.24);
  const poly = [A1, v[15], v[14], v[13], v[12], B2, v[7], C1, C2, v[4], v[3], v[2], A2];
  return {
    poly,
    partitions: { west: [A2, A1], north: [v[12], B2], east: [C1, C2] },
  };
}
export const HALL = hallPlan();

export class GreenDragonInterior {
  constructor(mats, { sky, lighting, noiseTex }) {
    this.sky = sky;
    this.lighting = lighting;
    this.y = GREEN_DRAGON.y;
    this.colliders = [];
    this.time = uniform(0);
    this.flicker = uniform(1);

    // Lights, outside the scene graph so only interior materials see them.
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
    this.hemi.updateMatrixWorld();
    this.fire = new THREE.PointLight(0xff8a3a, 5, 14, 2);
    this.lanterns = [];
    this.lightList = [lighting.light, this.hemi, this.fire];
    this.mats = this._materials(mats, noiseTex);
  }

  /** Clones of the building kit lit by the room's own lights, plus the room's special materials. */
  _materials(mats, noiseTex) {
    // (Lit materials get the room's light set once the lanterns are placed; see build().)
    const out = {};
    this.litMats = [];
    for (const k of ['stone', 'wood', 'paint', 'brick', 'plaster', 'metal', 'rock']) {
      out['in_' + k] = mats[k].clone();
      this.litMats.push(out['in_' + k]);
    }
    // Flagstones: big irregular slabs, worn smooth, with dark joints.
    const floor = new THREE.MeshStandardNodeMaterial({ roughness: 0.75 });
    floor.colorNode = Fn(() => {
      const p = uv().mul(vec2(2.3, 1.9));
      const w = mx_worley_noise_vec2(p.add(texture(noiseTex, p.mul(0.13)).rg.mul(0.6)));
      const joint = float(1).sub(smoothstep(0.012, 0.05, w.y.sub(w.x)));
      const tone = texture(noiseTex, uv().mul(0.21)).g.mul(0.35).add(0.78);
      const wear = texture(noiseTex, uv().mul(2.7)).a.mul(0.2).add(0.85);
      const slab = attribute('color', 'vec3').mul(tone).mul(wear).mul(w.x.mul(0.25).add(0.85));
      return slab.mul(float(1).sub(joint.mul(0.75)));
    })();
    this.litMats.push((out.in_floor = floor));
    // Bottles: glossy, colored by vertex tint.
    const bottle = new THREE.MeshStandardNodeMaterial({ roughness: 0.15, metalness: 0 });
    bottle.colorNode = attribute('color', 'vec3');
    this.litMats.push((out.in_bottle = bottle));
    // Lamp glass and candle flames: warm light, always on, gently flickering.
    const lamp = new THREE.MeshBasicNodeMaterial();
    lamp.colorNode = attribute('color', 'vec3').mul(color(0xffb060)).mul(this.flicker).mul(2.6);
    out.in_lamp = lamp;
    // The fire: crossed cards of scrolling noise, added on top of what's behind.
    const flame = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    flame.colorNode = Fn(() => {
      const p = uv();
      const t = this.time;
      const n = texture(noiseTex, vec2(p.x.mul(0.9).add(attribute('color', 'vec3').g), p.y.mul(0.55).sub(t.mul(0.9)))).r;
      const n2 = texture(noiseTex, vec2(p.x.mul(2.1), p.y.mul(1.3).sub(t.mul(1.7)))).a;
      // A tongue narrowing upward, torn by the noise.
      const width = float(1).sub(p.y).pow(0.7).mul(0.5);
      const body = smoothstep(width, width.mul(0.35), abs(p.x.sub(0.5)).add(n.sub(0.5).mul(0.22)));
      const heat = saturate(body.mul(n2.mul(0.7).add(0.5)).sub(p.y.mul(0.55)).mul(1.8));
      const col = vec3(1.0, 0.32, 0.06).mul(heat).add(vec3(1.0, 0.75, 0.35).mul(pow(heat, 3)));
      return vec4(col.mul(3.2).mul(this.flicker), 1);
    })();
    out.in_flame = flame;
    this.flameMat = flame;
    // The painting over the mantel.
    const art = new THREE.MeshStandardNodeMaterial({ roughness: 0.8 });
    art.colorNode = texture(dragonPainting(), uv()).rgb;
    this.litMats.push((out.in_art = art));
    return out;
  }

  inside(x, z) {
    return polyDist(HALL.poly, x, z) < 0;
  }

  /** Everything inside, added to the inn's builder (in interior materials). */
  build(B) {
    const y = this.y;
    const hall = HALL.poly;
    this._floorAndCeiling(B, hall, y);
    const zones = [];
    this.partitions = {};
    for (const [name, [a, b]] of Object.entries(HALL.partitions)) this.partitions[name] = this._partition(B, a, b, y, name);
    this._bar(B, this.partitions.north, y, zones);
    this._hearth(B, this.partitions.east, y, zones);
    this._beamsAndPosts(B, hall, y, zones);
    this._tables(B, hall, y, zones);
    const lightsNode = lights(this.lightList);
    for (const m of this.litMats) m.lightsNode = lightsNode;
  }

  /** Where the hearth (and so a chimney) stands: against the east partition, facing the room. */
  hearthXZ() {
    const [a, b] = HALL.partitions.east;
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l;
    if (polyDist(HALL.poly, mx + nx, mz + nz) > 0) { nx = -nx; nz = -nz; }
    return [mx + nx * 0.5, mz + nz * 0.5];
  }

  // ---------------------------------------------------------------------------------------------

  _floorAndCeiling(B, hall, y) {
    const contour = hall.map(([x, z]) => new THREE.Vector2(x, z));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    const make = (h, up) => {
      const pos = [], nor = [], uvs = [];
      for (const t of tris) {
        const [p0, p1, p2] = t.map((i) => hall[i]);
        const ny = (p1[1] - p0[1]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[1] - p0[1]);
        const order = ny > 0 === up ? t : [t[0], t[2], t[1]];
        for (const i of order) {
          const [x, z] = hall[i];
          pos.push(x, h, z);
          nor.push(0, up ? 1 : -1, 0);
          uvs.push(x * 0.42, z * 0.42);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      return g;
    };
    B.add('in_floor', make(y + 0.03, true), new THREE.Matrix4(), FLAG);
    B.add('in_plaster', make(y + CEILING, false), new THREE.Matrix4(), 0xcbb487);
  }

  /** A partition across a wing: plastered, framed on the hall side, with a shut door in it. */
  _partition(B, a, b, y, name) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
    let nx = -uz, nz = ux;
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    if (polyDist(HALL.poly, mx + nx * 0.6, mz + nz * 0.6) > 0) { nx = -nx; nz = -nz; }
    // Frame: x along the partition, z into the hall.
    const base = new THREE.Matrix4().makeBasis(new THREE.Vector3(ux, 0, uz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, 0, nz)).setPosition(a[0], y, a[1]);
    const at = (x, yy, z, rx, ry, rz) => base.clone().multiply(mtx(x, yy, z, rx, ry, rz));
    const T = 0.24, H = CEILING + 0.05;
    const door = name === 'east' ? null : { c: len * (name === 'west' ? 0.5 : 0.8), w: 1.0, h: 1.95 };
    const seg = (x0, x1, y0, y1) => x1 - x0 > 0.01 && y1 - y0 > 0.01 && B.add('in_plaster', box(x1 - x0, y1 - y0, T), at((x0 + x1) / 2, (y0 + y1) / 2, 0), PLASTER);
    if (door) {
      seg(-0.3, door.c - door.w / 2, 0, H);
      seg(door.c + door.w / 2, len + 0.3, 0, H);
      seg(door.c - door.w / 2, door.c + door.w / 2, door.h, H);
      // The shut door: planks, iron strap hinges, a ring handle.
      B.add('in_paint', box(door.w, door.h, 0.07), at(door.c, door.h / 2, 0.02), 0x3b5a2c);
      for (const hy of [0.4, 1.55]) B.add('in_metal', box(door.w * 0.7, 0.05, 0.02), at(door.c - door.w * 0.12, hy, 0.07), 0x222222);
      B.add('in_metal', new THREE.TorusGeometry(0.06, 0.012, 6, 12), at(door.c + door.w * 0.33, 1.0, 0.08), 0x333333);
      for (const s of [-1, 1]) B.add('in_wood', box(0.12, door.h + 0.1, 0.1), at(door.c + s * (door.w / 2 + 0.06), door.h / 2, T / 2), TIMBER);
      B.add('in_wood', box(door.w + 0.36, 0.14, 0.1), at(door.c, door.h + 0.05, T / 2), TIMBER);
    } else seg(-0.3, len + 0.3, 0, H);
    // Framing on the hall side.
    const n = Math.max(1, Math.round(len / 1.8));
    for (let k = 0; k <= n; k++) {
      const x = (k * len) / n;
      if (door && Math.abs(x - door.c) < door.w / 2 + 0.2) continue;
      B.add('in_wood', box(0.16, H, 0.08), at(x, H / 2, T / 2 + 0.03), TIMBER);
    }
    B.add('in_wood', box(len, 0.16, 0.09), at(len / 2, CEILING - 0.1, T / 2 + 0.03), TIMBER);
    B.add('in_wood', box(len, 0.14, 0.09), at(len / 2, 0.07, T / 2 + 0.03), TIMBER);
    this.colliders.push({ x: mx, z: mz, hx: len / 2 + 0.2, hz: T / 2 + 0.05, rot: Math.atan2(-uz, ux) });
    return { a, b, len, ux, uz, nx, nz, at, T };
  }

  _bar(B, P, y, zones) {
    // Counter parallel to the north partition, barrels and shelves against the wall behind it.
    const { len, at } = P;
    const L = Math.min(len - 2.2, 6.2), c = len * 0.42, d = 2.0;
    zones.push({ at: P, x0: c - L / 2 - 1.2, x1: c + L / 2 + 1.2, z1: d + 1.6 });
    // Counter: paneled front, thick top.
    B.add('in_wood', box(L, 1.0, 0.55), at(c, 0.5, d), OAK);
    B.add('in_wood', box(L + 0.2, 0.07, 0.8), at(c, 1.05, d + 0.05), OAK_LIGHT);
    for (let x = c - L / 2 + 0.35; x < c + L / 2 - 0.2; x += 0.7) B.add('in_wood', box(0.5, 0.7, 0.03), at(x + 0.1, 0.5, d + 0.29), 0x5a3e28);
    B.add('in_wood', box(L, 0.1, 0.1), at(c, 0.06, d + 0.25), TIMBER);
    // Counter end returning to the wall.
    B.add('in_wood', box(0.55, 1.0, d - 0.9), at(c - L / 2 + 0.27, 0.5, (d + 0.9) / 2 - 0.2), OAK);
    // Ale on the counter: a tap barrel and tankards.
    B.add('in_wood', cylinder(0.24, 0.24, 0.5, 14), at(c + L / 2 - 0.5, 1.33, d, 0, 0, Math.PI / 2), 0x7a5634);
    for (const s of [-1, 1]) B.add('in_metal', cylinder(0.25, 0.25, 0.03, 14), at(c + L / 2 - 0.5 + s * 0.17, 1.33, d, 0, 0, Math.PI / 2), 0x2d2a26);
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 7; k++) tankard(B, at(c - L / 2 + 0.4 + rnd() * (L - 1.4), 1.09, d + (rnd() - 0.5) * 0.3, 0, rnd() * 6));
    // Barrels on a rack along the wall, a second row on top.
    const n = Math.floor((L + 1) / 0.95);
    for (let k = 0; k < n; k++) {
      const x = c - (n - 1) * 0.475 + k * 0.95;
      barrel(B, at(x, 0.48, 0.62, 0, 0, 0), 0.42, 0.85);
      if (k % 2 === 0 && k < n - 1) barrel(B, at(x + 0.47, 1.25, 0.62, 0, 0, 0), 0.36, 0.75);
    }
    B.add('in_wood', box(L + 1, 0.1, 0.2), at(c, 0.06, 0.3), TIMBER);
    B.add('in_wood', box(L + 1, 0.1, 0.2), at(c, 0.06, 0.95), TIMBER);
    // Shelves of bottles above.
    for (const sy of [1.75, 2.1]) {
      B.add('in_wood', box(L + 0.6, 0.05, 0.28), at(c, sy, 0.3), OAK_LIGHT);
      for (let x = c - L / 2; x < c + L / 2; x += 0.13 + rnd() * 0.1) {
        const tint = [0x1f4a28, 0x4a2a14, 0x2a3a1a, 0x6a5a30][Math.floor(rnd() * 4)];
        const h = 0.2 + rnd() * 0.08;
        B.add('in_bottle', cylinder(0.035, 0.04, h, 8), at(x, sy + 0.025 + h / 2, 0.3), tint);
        B.add('in_bottle', cylinder(0.012, 0.02, 0.06, 6), at(x, sy + 0.025 + h + 0.03, 0.3), tint);
      }
    }
    this._collideBox(at, c, d, L / 2 + 0.1, 0.35);
    this._collideBox(at, c - L / 2 + 0.27, (d + 0.9) / 2 - 0.2, 0.3, (d - 0.9) / 2);
    this._collideBox(at, c, 0.62, L / 2 + 0.5, 0.45);
  }

  _hearth(B, P, y, zones) {
    // A big fieldstone chimney breast on the east partition, the fire in its mouth.
    const { len, at } = P;
    const c = len / 2, W = 3.0, D = 0.95, H = CEILING;
    zones.push({ at: P, x0: c - 3.2, x1: c + 3.2, z1: 4.6 });
    const ow = 1.5, oh = 1.25, od = 0.75; // fire opening
    for (const s of [-1, 1]) B.add('in_stone', box((W - ow) / 2, oh, D), at(c + s * (ow / 2 + (W - ow) / 4), oh / 2, D / 2), 0x8a7c66);
    B.add('in_stone', box(W, H - oh, D), at(c, oh + (H - oh) / 2, D / 2), 0x8a7c66);
    B.add('in_rock', box(ow, oh, 0.1), at(c, oh / 2, D - od - 0.05), 0x1e1812); // sooty back
    for (const s of [-1, 1]) B.add('in_rock', box(0.06, oh, od), at(c + s * (ow / 2 - 0.03), oh / 2, D - od / 2), 0x2a221a);
    B.add('in_wood', box(W + 0.2, 0.26, 0.28), at(c, oh + 0.13, D + 0.02), TIMBER); // lintel
    B.add('in_wood', box(W + 0.4, 0.07, 0.34), at(c, oh + 0.5, D + 0.1), OAK); // mantel shelf
    B.add('in_rock', box(W + 0.8, 0.08, 1.1), at(c, 0.04, D + 0.5), 0x7a7266); // hearthstone
    // Logs on firedogs, the fire above them.
    for (const s of [-1, 1]) B.add('in_metal', box(0.05, 0.22, 0.5), at(c + s * 0.4, 0.11, D - od / 2), 0x222222);
    for (let k = 0; k < 3; k++) B.add('in_wood', cylinder(0.08, 0.09, 1.0, 8), at(c + (k - 1) * 0.07, 0.24 + (k % 2) * 0.1, D - od / 2 + (k - 1) * 0.14, 0, 0.2 * (k - 1), Math.PI / 2), 0x2a1c12);
    B.add('in_lamp', box(0.9, 0.06, 0.45), at(c, 0.2, D - od / 2), 0x7a2a08); // embers
    for (let k = 0; k < 3; k++) {
      const card = new THREE.PlaneGeometry(1.0, 0.95).translate(0, 0.47, 0);
      B.add('in_flame', card, at(c + (k - 1) * 0.12, 0.26, D - od / 2, 0, (k * Math.PI) / 3, 0), new THREE.Color(0, k * 0.37, 0).getHex());
    }
    const fp = new THREE.Vector3(c, 0.7, D + 0.25).applyMatrix4(at(0, 0, 0));
    this.fire.position.copy(fp);
    this.fire.updateMatrixWorld();
    // Over the mantel: the painting of the green dragon, candles and pots.
    B.add('in_wood', box(1.34, 0.84, 0.05), at(c, oh + 1.0, D + 0.01), TIMBER);
    B.add('in_art', new THREE.PlaneGeometry(1.2, 0.7), at(c, oh + 1.0, D + 0.04), 0xffffff);
    for (const s of [-1, 1]) {
      B.add('in_plaster', cylinder(0.035, 0.035, 0.18, 8), at(c + s * 1.1, oh + 0.62, D + 0.1), 0xf0e6cc);
      B.add('in_lamp', new THREE.SphereGeometry(0.025, 6, 4).scale(1, 1.8, 1), at(c + s * 1.1, oh + 0.75, D + 0.1), 0xffffff);
      tankard(B, at(c + s * 0.8, oh + 0.54, D + 0.12, 0, s));
    }
    this._collideBox(at, c, D / 2, W / 2 + 0.05, D / 2 + 0.1);
    // Fireside: two high-backed settles facing each other and a low table, on a rug.
    B.add('in_paint', box(2.4, 0.02, 1.8), at(c, 0.045, D + 2.1), 0x7a3024);
    B.add('in_paint', box(2.1, 0.022, 1.5), at(c, 0.047, D + 2.1), 0x9a5a2a);
    for (const s of [-1, 1]) {
      const m = at(c + s * 1.35, 0, D + 2.1, 0, (s * Math.PI) / 2);
      settle(B, m);
      const p = new THREE.Vector3(c + s * 1.35, 0, D + 2.1).applyMatrix4(at(0, 0, 0));
      this.colliders.push({ x: p.x, z: p.z, hx: 0.35, hz: 0.75, rot: Math.atan2(-P.uz, P.ux) });
    }
    roundTable(B, at(c, 0, D + 2.1), 0.4, 0.5);
    tankard(B, at(c + 0.1, 0.52, D + 2.0, 0, 1));
  }

  _beamsAndPosts(B, hall, y, zones) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of hall) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    // Joists every 1.7 m, clipped to the room.
    const spans = (fixed, alongX) => {
      const out = [];
      let s = null;
      for (let t = (alongX ? minX : minZ) - 0.2; t <= (alongX ? maxX : maxZ) + 0.2; t += 0.1) {
        const inside = polyDist(hall, alongX ? t : fixed, alongX ? fixed : t) < -0.15;
        if (inside && s === null) s = t;
        if (!inside && s !== null) { out.push([s, t]); s = null; }
      }
      return out;
    };
    for (let z = minZ + 1.2; z < maxZ; z += 1.7)
      for (const [x0, x1] of spans(z, true)) B.add('in_wood', box(x1 - x0 + 0.3, 0.18, 0.2), mtx((x0 + x1) / 2, y + CEILING - 0.09, z), TIMBER);
    // Two girders across them on timber posts.
    this.posts = [];
    for (const x of [61.5, 67.5]) {
      for (const [z0, z1] of spans(x, false)) {
        B.add('in_wood', box(0.28, 0.3, z1 - z0 + 0.3), mtx(x, y + CEILING - 0.33, (z0 + z1) / 2), TIMBER);
        for (let z = z0 + 3.6; z < z1 - 2.5; z += 4.5) {
          if (this._blocked(x, z, zones, 0.3)) continue;
          B.add('in_wood', box(0.26, CEILING, 0.26), mtx(x, y + CEILING / 2, z), 0x4a3526);
          for (const s of [-1, 1]) B.add('in_wood', box(0.12, 0.7, 0.12), mtx(x, y + CEILING - 0.6, z + s * 0.3, s * 0.78, 0, 0), 0x4a3526);
          this.colliders.push({ x, z, r: 0.2 });
          this.posts.push([x, z]);
        }
      }
    }
  }

  _tables(B, hall, y, zones) {
    // Tables on a loose grid across the floor, clear of the bar, the hearth, the posts and the way
    // in from each open door; a lantern over most of them.
    const door = this.doorPoints || [];
    const at = (x, z, yaw) => mtx(x, y, z, 0, yaw, 0);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const placed = [];
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of hall) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    let k = 0;
    for (let z = minZ + 1; z < maxZ; z += 3.3)
      for (let x = minX + 1 + ((Math.round(z) % 2) * 1.6); x < maxX; x += 3.6) {
        const px = x + (rnd() - 0.5) * 0.8, pz = z + (rnd() - 0.5) * 0.8;
        if (polyDist(hall, px, pz) > -1.9) continue;
        if (this._blocked(px, pz, zones, 1.4)) continue;
        if (door.some(([dx, dz, ix, iz]) => segDist(px, pz, dx, dz, ix, iz) < 1.9)) continue;
        if (this.posts.some(([qx, qz]) => Math.hypot(px - qx, pz - qz) < 1.6)) continue;
        if (placed.some(([qx, qz]) => Math.hypot(px - qx, pz - qz) < 3)) continue;
        placed.push([px, pz]);
        const yaw = rnd() * 0.5 - 0.25 + (k % 2 ? Math.PI / 2 : 0);
        if (k % 3 === 1) {
          trestle(B, at(px, pz, yaw), rnd);
          this.colliders.push({ x: px, z: pz, hx: 1.2, hz: 0.85, rot: yaw });
        } else {
          roundTable(B, at(px, pz, yaw), 0.6, 0.76);
          this.colliders.push({ x: px, z: pz, r: 0.62 });
          const n = 3 + Math.floor(rnd() * 2);
          for (let s = 0; s < n; s++) {
            const a = yaw + (s / n) * Math.PI * 2 + rnd() * 0.3;
            const sx = px + Math.cos(a) * 0.95, sz = pz + Math.sin(a) * 0.95;
            stool(B, at(sx, sz, rnd() * 3));
          }
          for (let s = 0; s < 1 + Math.floor(rnd() * 3); s++) tankard(B, mtx(px + (rnd() - 0.5) * 0.6, y + 0.79, pz + (rnd() - 0.5) * 0.6, 0, rnd() * 6));
          B.add('in_plaster', cylinder(0.14, 0.14, 0.015, 14), mtx(px + 0.15, y + 0.775, pz - 0.1), 0xe8e0cc); // plate
        }
        candle(B, mtx(px, y + 0.77, pz));
        if (k % 4 !== 3) this._lantern(B, px, pz, y);
        k++;
      }
  }

  _lantern(B, x, z, y) {
    const h = CEILING - 0.72;
    B.add('in_metal', box(0.02, 0.55, 0.02), mtx(x, y + CEILING - 0.3, z), 0x222222);
    B.add('in_metal', box(0.24, 0.04, 0.24), mtx(x, y + h + 0.17, z), 0x2a2622);
    B.add('in_metal', box(0.26, 0.03, 0.26), mtx(x, y + h - 0.17, z), 0x2a2622);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.add('in_metal', box(0.025, 0.34, 0.025), mtx(x + sx * 0.11, y + h, z + sz * 0.11), 0x2a2622);
    B.add('in_lamp', box(0.19, 0.28, 0.19), mtx(x, y + h, z), 0xffffff);
    if (this.lanterns.length < 6) {
      const l = new THREE.PointLight(0xffa860, 1.35, 9, 2);
      l.position.set(x, y + h - 0.05, z);
      l.updateMatrixWorld();
      this.lanterns.push(l);
      this.lightList.push(l);
    }
  }

  _blocked(x, z, zones, pad) {
    return zones.some((zn) => {
      const { a, ux, uz, nx, nz } = zn.at;
      const lx = (x - a[0]) * ux + (z - a[1]) * uz, lz = (x - a[0]) * nx + (z - a[1]) * nz;
      return lx > zn.x0 - pad && lx < zn.x1 + pad && lz < zn.z1 + pad;
    });
  }

  _collideBox(at, x, z, hx, hz) {
    const m = at(x, 0, z);
    const e = m.elements;
    this.colliders.push({ x: e[12], z: e[14], hx, hz, rot: Math.atan2(-e[2], e[0]) });
  }

  update(dt) {
    this.time.value += dt;
    const t = this.time.value;
    const f = 1 + Math.sin(t * 7.3) * 0.05 + Math.sin(t * 13.1 + 1) * 0.04 + Math.sin(t * 23.7 + 2) * 0.03;
    this.flicker.value = f;
    this.fire.intensity = 5 * f;
    // Daylight bouncing in through the windows and door, plus lamplight bouncing around the room.
    const L = this.lighting;
    const sky = L.info?.skyIrradiance || [0, 0, 0];
    this.hemi.color.setRGB(sky[0] * 0.12 + 0.014, sky[1] * 0.12 + 0.009, sky[2] * 0.12 + 0.005);
    this.hemi.groundColor.setRGB(sky[0] * 0.05 + 0.012, sky[1] * 0.05 + 0.008, sky[2] * 0.05 + 0.004);
  }
}

// ---------------------------------------------------------------------------------------------
// Furniture

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
}

function barrel(B, m, r, len) {
  // On its side along local z.
  const g = new THREE.CylinderGeometry(r, r, len, 16, 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const yy = p.getY(i) / (len / 2), bulge = 1 + 0.12 * (1 - yy * yy);
    p.setX(i, p.getX(i) * bulge);
    p.setZ(i, p.getZ(i) * bulge);
  }
  g.computeVertexNormals();
  const rot = m.clone().multiply(mtx(0, 0, 0, Math.PI / 2, 0, 0));
  B.add('in_wood', g, rot, 0x7a5634);
  for (const t of [-0.36, -0.12, 0.12, 0.36]) {
    const rr = r * (1 + 0.12 * (1 - (t / 0.5) ** 2)) + 0.006;
    B.add('in_metal', cylinder(rr, rr, 0.04, 16, true), rot.clone().multiply(mtx(0, t * len, 0)), 0x2d2a26);
  }
}

function tankard(B, m) {
  B.add('in_wood', cylinder(0.045, 0.05, 0.13, 10), m.clone().multiply(mtx(0, 0.065, 0)), 0x8a6a44);
  B.add('in_metal', cylinder(0.052, 0.052, 0.012, 10), m.clone().multiply(mtx(0, 0.02, 0)), 0x5a5048);
  B.add('in_wood', new THREE.TorusGeometry(0.035, 0.008, 5, 10, Math.PI), m.clone().multiply(mtx(0.05, 0.065, 0, 0, 0, -Math.PI / 2)), 0x6a4a30);
}

function candle(B, m) {
  B.add('in_metal', cylinder(0.05, 0.06, 0.02, 10), m.clone().multiply(mtx(0, 0.01, 0)), 0x6a5a40);
  B.add('in_plaster', cylinder(0.022, 0.022, 0.12, 8), m.clone().multiply(mtx(0, 0.08, 0)), 0xf0e6cc);
  B.add('in_lamp', new THREE.SphereGeometry(0.018, 6, 4).scale(1, 1.9, 1), m.clone().multiply(mtx(0, 0.165, 0)), 0xffffff);
}

function roundTable(B, m, r, h) {
  B.add('in_wood', cylinder(r, r, 0.06, 20), m.clone().multiply(mtx(0, h - 0.03, 0)), OAK_LIGHT);
  B.add('in_wood', cylinder(0.07, 0.09, h - 0.06, 8), m.clone().multiply(mtx(0, (h - 0.06) / 2, 0)), OAK);
  for (const a of [0, Math.PI / 2]) B.add('in_wood', box(r * 1.2, 0.06, 0.08), m.clone().multiply(mtx(0, 0.03, 0, 0, a, 0)), OAK);
}

function stool(B, m) {
  B.add('in_wood', cylinder(0.19, 0.19, 0.05, 12), m.clone().multiply(mtx(0, 0.46, 0)), OAK_LIGHT);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    B.add('in_wood', cylinder(0.022, 0.028, 0.46, 6), m.clone().multiply(mtx(Math.cos(a) * 0.12, 0.22, Math.sin(a) * 0.12, Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12)), OAK);
  }
}

function trestle(B, m, rnd) {
  B.add('in_wood', box(2.3, 0.07, 0.85), m.clone().multiply(mtx(0, 0.76, 0)), OAK_LIGHT);
  for (const s of [-1, 1]) {
    B.add('in_wood', box(0.08, 0.72, 0.6), m.clone().multiply(mtx(s * 0.85, 0.36, 0)), OAK);
    B.add('in_wood', box(0.1, 0.06, 0.75), m.clone().multiply(mtx(s * 0.85, 0.03, 0)), OAK);
  }
  B.add('in_wood', box(1.7, 0.08, 0.06), m.clone().multiply(mtx(0, 0.25, 0)), OAK);
  for (const s of [-1, 1]) {
    B.add('in_wood', box(2.1, 0.06, 0.3), m.clone().multiply(mtx(0, 0.45, s * 0.72)), OAK_LIGHT);
    for (const t of [-0.85, 0.85]) B.add('in_wood', box(0.07, 0.42, 0.24), m.clone().multiply(mtx(t, 0.21, s * 0.72)), OAK);
  }
  for (let k = 0; k < 4; k++) tankard(B, m.clone().multiply(mtx((rnd() - 0.5) * 1.8, 0.795, (rnd() - 0.5) * 0.5, 0, rnd() * 6)));
  for (const t of [-0.6, 0.55]) B.add('in_plaster', cylinder(0.14, 0.14, 0.015, 14), m.clone().multiply(mtx(t, 0.8, 0.18)), 0xe8e0cc);
  // A loaf on a board.
  B.add('in_wood', box(0.4, 0.03, 0.26), m.clone().multiply(mtx(0.1, 0.81, -0.15)), OAK);
  B.add('in_plaster', new THREE.SphereGeometry(0.12, 10, 6).scale(1.3, 0.6, 0.8), m.clone().multiply(mtx(0.1, 0.87, -0.15)), 0xb07838);
}

function settle(B, m) {
  // High-backed bench, seat along local x, facing +z.
  B.add('in_wood', box(1.4, 0.07, 0.5), m.clone().multiply(mtx(0, 0.45, 0)), OAK);
  B.add('in_wood', box(1.4, 1.3, 0.07), m.clone().multiply(mtx(0, 0.65, -0.24)), 0x5a3e28);
  for (const s of [-1, 1]) B.add('in_wood', box(0.07, 0.95, 0.55), m.clone().multiply(mtx(s * 0.7, 0.47, 0)), 0x5a3e28);
  B.add('in_paint', box(1.3, 0.06, 0.44), m.clone().multiply(mtx(0, 0.5, 0.02)), 0x6a2a20); // cushion
}

/** A painting of a green dragon curled on a hill, in the inn's own naive style. */
function dragonPainting() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 150;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 150);
  sky.addColorStop(0, '#c9b07a');
  sky.addColorStop(1, '#8a7a4a');
  g.fillStyle = sky;
  g.fillRect(0, 0, 256, 150);
  g.fillStyle = '#5a6a30';
  g.beginPath();
  g.ellipse(128, 160, 170, 60, 0, 0, Math.PI * 2);
  g.fill();
  // The dragon: a long curling body, wings, head raised.
  g.strokeStyle = '#2f6a2a';
  g.lineWidth = 16;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(40, 110);
  g.bezierCurveTo(80, 60, 130, 130, 170, 80);
  g.bezierCurveTo(185, 62, 200, 60, 212, 50);
  g.stroke();
  g.fillStyle = '#2f6a2a';
  g.beginPath();
  g.moveTo(205, 44); g.lineTo(232, 38); g.lineTo(214, 58); g.closePath();
  g.fill();
  g.fillStyle = '#3f7a34';
  g.beginPath();
  g.moveTo(120, 95); g.quadraticCurveTo(110, 30, 150, 25); g.quadraticCurveTo(140, 55, 160, 85); g.closePath();
  g.fill();
  g.fillStyle = '#e8c040';
  g.fillRect(216, 44, 4, 4);
  g.strokeStyle = '#1e4a1c';
  g.lineWidth = 3;
  for (let x = 60; x < 190; x += 14) { g.beginPath(); g.moveTo(x, 92 - Math.sin(x / 20) * 12); g.lineTo(x + 5, 84 - Math.sin(x / 20) * 12); g.stroke(); }
  // Craquelure and an aged varnish.
  g.fillStyle = 'rgba(80,50,10,0.18)';
  g.fillRect(0, 0, 256, 150);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

