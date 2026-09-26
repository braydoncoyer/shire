// The Green Dragon's common room: the hall where the inn's three wings meet, entered by the main
// door from the bridge. After the film set: worn flagstones, ochre plaster between dark timbers
// with curved braces, a ceiling of close-set joists and boards carried on heavy beams, turned
// columns with arched knee braces, big round windows, iron chandeliers and wall sconces, a bar
// with barrels set into a boarded wall and jugs hanging from its arch, and a rough fieldstone hearth
// with leather armchairs on a rug. The wings beyond are closed off by partitions with round-headed
// doors.
//
// The room has its own lights: the fire, the chandeliers, a little daylight bouncing in through the
// windows, and the sun itself (shadowed by the walls and roof, so it only falls through windows and
// the door). Interior materials use that light set instead of the scene's, so the fire never lights
// the lawn and the sky's ambient doesn't flood the room.

import * as THREE from 'three/webgpu';
import {
  Fn, uniform, uv, vec2, vec3, vec4, float, texture, attribute, color, smoothstep, abs, pow, lights, saturate,
  floor, fract, hash, min, max, mix, sin, length,
} from 'three/tsl';
import { mtx, box, cylinder, polyDist, cleanPoly, arcTimber, archHead, archLeaf, slab } from './Kit.js';
import { GREEN_DRAGON } from './Layout.js';

const TIMBER = 0x3a2618, BEAM = 0x44301f, OAK = 0x6e4428, OAK_LIGHT = 0x8a5a34, OCHRE = 0xd8b060, IRON = 0x1f1d1b;
const LEATHER = 0x7a4222;
export const CEILING = 2.45; // above the floor
const MAX_LIGHTS = 6; // chandeliers with a real light (the rest glow without one)

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
    this.lamps = [];
    this.lightList = [lighting.light, this.hemi, this.fire];
    this.mats = this._materials(mats, noiseTex);
  }

  /** Clones of the building kit lit by the room's own lights, plus the room's special materials. */
  _materials(mats, noiseTex) {
    // (Lit materials get the room's light set once the chandeliers are placed; see build().)
    const out = {};
    this.litMats = [];
    const lit = (name, m) => {
      out[name] = m;
      this.litMats.push(m);
      return m;
    };
    for (const k of ['stone', 'wood', 'paint', 'brick', 'plaster', 'metal', 'rock']) lit('in_' + k, mats[k].clone());
    const vcol = attribute('color', 'vec3');

    // Flagstones: coursed rows of big slabs (each row its own slab length), sandstone tan to grey,
    // mottled and worn smooth, with thin dark joints. uv is world meters.
    const flag = lit('in_floor', new THREE.MeshStandardNodeMaterial());
    const flagSlab = Fn(() => {
      const p = uv();
      const q = p;
      const rowH = 0.74;
      const row = floor(q.y.div(rowH));
      const rh = hash(row.add(71));
      const len = rh.mul(0.55).add(0.75);
      const x = q.x.add(rh.mul(3.7)).div(len);
      const col = floor(x);
      const fx = fract(x).mul(len), fy = fract(q.y.div(rowH)).mul(rowH);
      const edge = min(min(fx, len.sub(fx)), min(fy, float(rowH).sub(fy)));
      const id = hash(col.add(row.mul(113)).add(9)), id2 = hash(col.mul(7).add(row.mul(31)).add(3));
      return vec4(id, id2, edge, 0);
    });
    flag.colorNode = Fn(() => {
      const p = uv();
      const s = flagSlab();
      const joint = float(1).sub(smoothstep(0.005, 0.02, s.z));
      const base = mix(vec3(0.47, 0.4, 0.31), vec3(0.4, 0.37, 0.33), s.x).mul(s.y.mul(0.4).add(0.72));
      const mottle = texture(noiseTex, p.mul(0.3)).g.mul(0.45).add(0.72).mul(texture(noiseTex, p.mul(1.7)).a.mul(0.25).add(0.87));
      const worn = smoothstep(0.0, 0.06, s.z).mul(0.15).add(0.85);
      return mix(base.mul(mottle).mul(worn), vec3(0.2, 0.17, 0.14), joint.mul(0.8));
    })();
    flag.roughnessNode = Fn(() => {
      const s = flagSlab();
      return mix(float(0.42), float(0.95), float(1).sub(smoothstep(0.006, 0.03, s.z))).add(texture(noiseTex, uv().mul(0.8)).b.mul(0.25));
    })();

    // Boards: planks along uv.y (≈17 cm wide), each its own tone, with dark seams. uv in meters.
    const boards = lit('in_boards', new THREE.MeshStandardNodeMaterial({ roughness: 0.8 }));
    boards.colorNode = Fn(() => {
      const q = uv();
      const x = q.x.div(0.17);
      const plank = floor(x), f = fract(x);
      const seam = smoothstep(0.0, 0.05, f).mul(smoothstep(1.0, 0.95, f));
      const tone = hash(plank.add(500)).mul(0.35).add(0.75);
      const g = texture(noiseTex, vec2(q.x.mul(0.6), q.y.mul(0.07).add(plank.mul(0.37)))).b;
      const grain = sin(q.x.mul(37).add(g.mul(9))).mul(0.5).add(0.5);
      return vcol.mul(tone).mul(grain.mul(0.1).add(0.86)).mul(seam.mul(0.6).add(0.4));
    })();

    // Leather: worn, a little glossy, darker in the creases.
    const leather = lit('in_leather', new THREE.MeshStandardNodeMaterial({ roughness: 0.48 }));
    leather.colorNode = Fn(() => {
      const n = texture(noiseTex, uv().mul(1.3)).g, n2 = texture(noiseTex, uv().mul(6)).a;
      return vcol.mul(n.mul(0.35).add(0.75)).mul(n2.mul(0.15).add(0.9));
    })();

    // Bottles and glazed jugs: glossy, colored by vertex tint.
    const bottle = lit('in_bottle', new THREE.MeshStandardNodeMaterial({ roughness: 0.15, metalness: 0 }));
    bottle.colorNode = vcol;

    // The rug before the hearth and the pictures on the walls: painted canvases.
    const rug = lit('in_rug', new THREE.MeshStandardNodeMaterial({ roughness: 1 }));
    rug.colorNode = texture(rugTexture(), uv()).rgb;
    const pics = lit('in_art', new THREE.MeshStandardNodeMaterial({ roughness: 0.75 }));
    pics.colorNode = texture(paintings(), uv()).rgb;

    // Candle flames and lamp glass: warm light, always on, gently flickering.
    const lamp = new THREE.MeshBasicNodeMaterial();
    lamp.colorNode = vcol.mul(color(0xffb060)).mul(this.flicker).mul(2.6);
    out.in_lamp = lamp;
    // Light pooled on the wall around a sconce: a soft disc added over the plaster.
    const glow = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    glow.colorNode = Fn(() => {
      const r = length(uv().sub(0.5)).mul(2);
      const f = pow(saturate(float(1).sub(r)), 2.4);
      return vec4(color(0xff9a48).mul(f).mul(this.flicker).mul(0.4), 1);
    })();
    out.in_glow = glow;
    // The fire: crossed cards of scrolling noise, added on top of what's behind.
    const flame = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    flame.colorNode = Fn(() => {
      const p = uv();
      const t = this.time;
      const n = texture(noiseTex, vec2(p.x.mul(0.9).add(vcol.g), p.y.mul(0.55).sub(t.mul(0.9)))).r;
      const n2 = texture(noiseTex, vec2(p.x.mul(2.1), p.y.mul(1.3).sub(t.mul(1.7)))).a;
      // A tongue narrowing upward, torn by the noise.
      const width = float(1).sub(p.y).pow(0.7).mul(0.5);
      const body = smoothstep(width, width.mul(0.35), abs(p.x.sub(0.5)).add(n.sub(0.5).mul(0.22)));
      const heat = saturate(body.mul(n2.mul(0.7).add(0.5)).sub(p.y.mul(0.55)).mul(1.8));
      const col = vec3(1.0, 0.32, 0.06).mul(heat).add(vec3(1.0, 0.75, 0.35).mul(pow(heat, 3)));
      return vec4(col.mul(3.2).mul(this.flicker), 1);
    })();
    out.in_flame = flame;
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
    this._bar(B, this.partitions.north, zones);
    this._hearth(B, this.partitions.east, zones);
    this._structure(B, hall, y, zones);
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

  /** A wall sconce at `m` (on the wall's face, +z into the room): iron arm, glass chimney, a pool of light. */
  sconce(B, m) {
    const at = (x, y, z, rx = 0) => m.clone().multiply(mtx(x, y, z, rx));
    B.add('in_wood', box(0.12, 0.3, 0.03), at(0, 0, 0.015), TIMBER);
    B.add('in_metal', box(0.022, 0.022, 0.2), at(0, -0.06, 0.12), IRON);
    B.add('in_metal', cylinder(0.045, 0.03, 0.04, 10), at(0, -0.04, 0.22), 0x6a5030);
    B.add('in_lamp', cylinder(0.032, 0.036, 0.13, 10), at(0, 0.045, 0.22), 0xffffff);
    B.add('in_metal', cylinder(0.02, 0.042, 0.03, 10), at(0, 0.125, 0.22), 0x6a5030);
    B.add('in_glow', new THREE.PlaneGeometry(1.8, 1.8), at(0, 0.05, 0.035), 0xffffff);
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
          uvs.push(x, z);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      return g;
    };
    B.add('in_floor', make(y + 0.03, true), new THREE.Matrix4(), 0xffffff);
    B.add('in_boards', make(y + CEILING, false), new THREE.Matrix4(), 0x70482c);
  }

  /** A partition across a wing: plastered and framed on the hall side, with a round-headed door. */
  _partition(B, a, b, y, name) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
    let nx = -uz, nz = ux;
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    if (polyDist(HALL.poly, mx + nx * 0.6, mz + nz * 0.6) > 0) { nx = -nx; nz = -nz; }
    // Frame: x along the partition, z into the hall.
    const base = new THREE.Matrix4().makeBasis(new THREE.Vector3(ux, 0, uz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, 0, nz)).setPosition(a[0], y, a[1]);
    const at = (x, yy, z, rx, ry, rz) => base.clone().multiply(mtx(x, yy, z, rx, ry, rz));
    const T = 0.24, H = CEILING + 0.05, F = T / 2 + 0.04;
    const door = name === 'east' ? null : { c: len * (name === 'west' ? 0.5 : 0.84), w: 1.1, h: 2.1 };
    const seg = (x0, x1, y0, y1) => x1 - x0 > 0.01 && y1 - y0 > 0.01 && B.add('in_plaster', box(x1 - x0, y1 - y0, T), at((x0 + x1) / 2, (y0 + y1) / 2, 0), OCHRE);
    const posts = [];
    if (door) {
      const spring = door.h - door.w / 2;
      seg(-0.3, door.c - door.w / 2, 0, H);
      seg(door.c + door.w / 2, len + 0.3, 0, H);
      B.add('in_plaster', archHead(door.w, H - spring, T), at(door.c, spring, 0), OCHRE);
      // The shut door: a round-headed leaf of oak planks, iron strap hinges, a ring handle.
      B.add('in_paint', archLeaf(door.w, door.h, 0.07), at(door.c, 0, 0.02), 0x7a4e2c);
      for (const hy of [0.4, 1.5]) B.add('in_metal', box(door.w * 0.75, 0.05, 0.02), at(door.c - door.w * 0.1, hy, 0.065), IRON);
      B.add('in_metal', new THREE.TorusGeometry(0.06, 0.012, 6, 12), at(door.c + door.w * 0.3, 1.0, 0.075), 0x333333);
      // Its timber frame: jambs and an arched head.
      for (const s of [-1, 1]) B.add('in_wood', box(0.14, spring, 0.14), at(door.c + s * (door.w / 2 + 0.07), spring / 2, F), TIMBER);
      B.add('in_wood', arcTimber(door.w / 2 + 0.14, 0.14, 0.14, 0, Math.PI, 14), at(door.c, spring, F), TIMBER);
      posts.push(door.c - door.w / 2 - 0.3, door.c + door.w / 2 + 0.3);
    } else seg(-0.3, len + 0.3, 0, H);
    // Framing on the hall side: posts, a wall plate and sole plate, curved braces in clear panels.
    const n = Math.max(1, Math.round(len / 1.8));
    for (let k = 0; k <= n; k++) {
      const x = (k * len) / n;
      if (door && Math.abs(x - door.c) < door.w / 2 + 0.5) continue;
      posts.push(x);
    }
    posts.sort((p, q) => p - q);
    for (const x of posts) B.add('in_wood', box(0.18, H, 0.1), at(x, H / 2, F), TIMBER);
    B.add('in_wood', box(len, 0.18, 0.11), at(len / 2, CEILING - 0.09, F), TIMBER);
    B.add('in_wood', box(len, 0.16, 0.11), at(len / 2, 0.08, F), TIMBER);
    const panels = [];
    for (let k = 0; k + 1 < posts.length; k++) {
      const xa = posts[k], xb = posts[k + 1];
      if (xb - xa < 0.8 || (door && xa < door.c + door.w / 2 && xb > door.c - door.w / 2)) continue;
      panels.push([xa, xb]);
      const R = Math.min(0.85, (xb - xa) / 2 - 0.05);
      B.add('in_wood', arcTimber(R, 0.13, 0.08, Math.PI / 2, Math.PI, 8), at(xa + 0.09 + R, CEILING - 0.18 - R, F), TIMBER);
      B.add('in_wood', arcTimber(R, 0.13, 0.08, 0, Math.PI / 2, 8), at(xb - 0.09 - R, CEILING - 0.18 - R, F), TIMBER);
    }
    // On the west partition, pictures and sconces between the braces.
    if (name === 'west')
      panels.forEach(([xa, xb], k) => {
        const x = (xa + xb) / 2;
        if (k % 2) this.sconce(B, at(x, 1.6, F + 0.05));
        else {
          B.add('in_wood', box(0.62, 0.44, 0.04), at(x, 1.45, F + 0.07), TIMBER);
          B.add('in_art', picture(1 + (k % 3), 0.54, 0.36), at(x, 1.45, F + 0.095), 0xffffff);
        }
      });
    this.colliders.push({ x: mx, z: mz, hx: len / 2 + 0.2, hz: T / 2 + 0.05, rot: Math.atan2(-uz, ux) });
    return { a, b, len, ux, uz, nx, nz, at, T, F, door, panels };
  }

  _bar(B, P, zones) {
    // The counter parallel to the north partition; behind it a boarded wall with barrels set into
    // it, shelves of bottles, and an arched frame over the counter hung with jugs.
    const { len, at, F } = P;
    const L = Math.min(len - 2.4, 6.0), c = len * 0.4, d = 2.0;
    zones.push({ at: P, x0: c - L / 2 - 1.2, x1: c + L / 2 + 1.2, z1: d + 1.6 });
    // Boarded wall.
    B.add('in_boards', box(L + 1.4, CEILING - 0.2, 0.04), at(c, (CEILING - 0.2) / 2 + 0.02, F + 0.07), 0x6a4226);
    // Cupboards along the wall under the barrels.
    B.add('in_wood', box(L + 0.8, 0.85, 0.5), at(c, 0.43, F + 0.34), OAK);
    B.add('in_wood', box(L + 0.9, 0.05, 0.56), at(c, 0.875, F + 0.35), OAK_LIGHT);
    for (let x = c - L / 2; x < c + L / 2 + 0.2; x += 0.62) B.add('in_wood', box(0.46, 0.6, 0.03), at(x + 0.05, 0.45, F + 0.6), 0x5a3820);
    // Barrels set into the wall, heads out, on a cradle, each with a tap.
    const nb = L > 4.5 ? 3 : 2;
    for (let k = 0; k < nb; k++) {
      const x = c + (k - (nb - 1) / 2) * 1.45;
      barrel(B, at(x, 1.33, F + 0.34), 0.42, 0.56);
      B.add('in_wood', cylinder(0.36, 0.36, 0.02, 20), at(x, 1.33, F + 0.63, Math.PI / 2), 0x9a6a3e); // head
      B.add('in_metal', cylinder(0.018, 0.018, 0.12, 6), at(x, 1.12, F + 0.68, Math.PI / 2), 0x6a5030);
      B.add('in_metal', box(0.02, 0.07, 0.02), at(x, 1.16, F + 0.73), 0x6a5030);
      B.add('in_wood', box(0.7, 0.08, 0.5), at(x, 0.9, F + 0.34), TIMBER);
    }
    // Shelves of bottles over the barrels and beside them.
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const shelf = (x0, x1, sy) => {
      B.add('in_wood', box(x1 - x0 + 0.1, 0.05, 0.26), at((x0 + x1) / 2, sy, F + 0.22), OAK_LIGHT);
      for (let x = x0 + 0.06; x < x1 - 0.04; x += 0.12 + rnd() * 0.1) {
        const tint = [0x1f4a28, 0x4a2a14, 0x2a3a1a, 0x6a5a30, 0x5a2a1a][Math.floor(rnd() * 5)];
        const h = 0.18 + rnd() * 0.08;
        B.add('in_bottle', cylinder(0.035, 0.04, h, 8), at(x, sy + 0.025 + h / 2, F + 0.2), tint);
        B.add('in_bottle', cylinder(0.012, 0.02, 0.06, 6), at(x, sy + 0.025 + h + 0.03, F + 0.2), tint);
      }
    };
    shelf(c - L / 2 - 0.3, c + L / 2 + 0.3, 1.95);
    // The counter: arched panels on its front, a thick top.
    B.add('in_wood', box(L, 1.0, 0.55), at(c, 0.5, d), OAK);
    B.add('in_wood', box(L + 0.2, 0.08, 0.8), at(c, 1.04, d + 0.05), OAK_LIGHT);
    B.add('in_wood', box(L, 0.12, 0.08), at(c, 0.06, d + 0.27), TIMBER);
    const bays = Math.round(L / 0.75), bw = L / bays;
    for (let k = 0; k <= bays; k++) B.add('in_wood', box(0.08, 0.86, 0.04), at(c - L / 2 + k * bw, 0.55, d + 0.29), 0x5a3820);
    for (let k = 0; k < bays; k++) {
      const x = c - L / 2 + (k + 0.5) * bw;
      B.add('in_wood', arcTimber(bw / 2 - 0.04, 0.06, 0.04, 0, Math.PI, 10), at(x, 0.98 - bw / 2, d + 0.29), 0x5a3820);
      B.add('in_wood', box(bw - 0.08, 0.05, 0.04), at(x, 0.16, d + 0.29), 0x5a3820);
    }
    // Counter end returning to the wall.
    B.add('in_wood', box(0.55, 1.0, d - 0.9), at(c - L / 2 + 0.27, 0.5, (d + 0.9) / 2 - 0.2), OAK);
    for (let k = 0; k < 6; k++) tankard(B, at(c - L / 2 + 0.5 + rnd() * (L - 1.2), 1.08, d + (rnd() - 0.5) * 0.3, 0, rnd() * 6));
    // The arched frame over the counter: carved posts at its ends, a beam, a shallow arch, jugs.
    const S = L + 0.5, sag = 0.4, R = (S * S) / 4 / (2 * sag) + sag / 2, top = CEILING - 0.34;
    for (const s of [-1, 1]) {
      B.add('in_wood', box(0.26, CEILING, 0.26), at(c + s * S / 2, CEILING / 2, d), 0x4a3020);
      B.add('in_wood', box(0.34, 0.5, 0.34), at(c + s * S / 2, 0.25, d), TIMBER);
    }
    B.add('in_wood', box(S + 0.3, 0.3, 0.26), at(c, CEILING - 0.17, d), TIMBER);
    const th = Math.asin(S / 2 / R);
    B.add('in_wood', arcTimber(R, 0.2, 0.2, Math.PI / 2 - th, Math.PI / 2 + th, 16), at(c, top - R + 0.02, d), BEAM);
    for (let x = c - S / 2 + 0.45; x < c + S / 2 - 0.4; x += 0.34) {
      const ax = x - c, yArc = Math.sqrt(R * R - ax * ax) - R + top - 0.2;
      const tint = rnd() < 0.7 ? [0x2f6a38, 0x3d7a3a, 0x285a30][Math.floor(rnd() * 3)] : 0x7a5a38;
      B.add('in_metal', box(0.012, 0.1, 0.012), at(x, yArc - 0.05, d + 0.13), IRON);
      jug(B, at(x, yArc - 0.34, d + 0.13, 0, rnd() * 6), tint, 0.8 + rnd() * 0.3);
    }
    // Bar stools.
    for (let k = 0; k < 4; k++) barStool(B, at(c - L / 2 + (k + 0.6) * (L / 4), 0, d + 0.75, 0, rnd()));
    this._collideBox(at, c, d, L / 2 + 0.1, 0.35);
    this._collideBox(at, c - L / 2 + 0.27, (d + 0.9) / 2 - 0.2, 0.3, (d - 0.9) / 2);
    this._collideBox(at, c, F + 0.34, L / 2 + 0.5, 0.35);
    for (const s of [-1, 1]) {
      const p = new THREE.Vector3(c + s * S / 2, 0, d).applyMatrix4(at(0, 0, 0));
      this.colliders.push({ x: p.x, z: p.z, r: 0.25 });
    }
  }

  _hearth(B, P, zones) {
    // A big rough fieldstone chimney breast on the east partition, the fire in its mouth.
    const { len, at, F } = P;
    const c = len / 2, W = 2.8, D = 0.95, H = CEILING;
    zones.push({ at: P, x0: c - 3.3, x1: c + 3.3, z1: 4.6 });
    const ow = 1.3, oh = 1.1, od = 0.72; // fire opening
    const z0 = F - 0.04;
    const STONE = 0x8a7c66;
    for (const s of [-1, 1]) B.add('in_stone', box((W - ow) / 2, oh, D), at(c + s * (ow / 2 + (W - ow) / 4), oh / 2, z0 + D / 2), STONE);
    B.add('in_stone', box(W, 0.5, D), at(c, oh + 0.25, z0 + D / 2), STONE);
    B.add('in_stone', box(W - 0.6, H - oh - 0.5, D - 0.2), at(c, oh + 0.5 + (H - oh - 0.5) / 2, z0 + (D - 0.2) / 2), STONE); // stack
    // Rough faces: stones standing proud of the breast.
    let seed = 17;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const tints = [0x8e8270, 0x7a7060, 0x9a8c74, 0x6e665a, 0x847866];
    // Coursed rubble over the front and sides of the breast, the fire opening and painting left clear.
    const course = (x0, x1, face, yy, rh, side) => {
      for (let x = x0; x < x1 - 0.08;) {
        const w = Math.min(x1 - x, 0.2 + rnd() * 0.22), cx = x + w / 2;
        x += w + 0.025;
        if (!side && yy - rh / 2 < oh + 0.02 && Math.abs(cx - c) < ow / 2 + w / 2) continue;
        if (!side && Math.abs(cx - c) < 0.62 && yy > oh + 0.4 && yy < oh + 1.3) continue;
        const dz = 0.05 + rnd() * 0.04;
        const m = side ? at(face, yy, cx, 0, Math.PI / 2, 0) : at(cx, yy, face);
        B.add('in_rock', box(w - 0.02, rh - 0.025, dz), m.multiply(mtx(0, 0, 0, (rnd() - 0.5) * 0.06, (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.08)), tints[Math.floor(rnd() * tints.length)]);
      }
    };
    for (let yy = 0; yy < H - 0.05;) {
      const rh = Math.min(H - yy, 0.14 + rnd() * 0.1), cy = yy + rh / 2;
      const low = cy < oh + 0.5, wide = low ? W : W - 0.6, face = low ? z0 + D : z0 + D - 0.2;
      course(c - wide / 2 + 0.02, c + wide / 2 - 0.02, face, cy, rh, false);
      for (const s of [-1, 1]) course(z0 + 0.02, face - 0.04, c + s * wide / 2, cy, rh, true);
      yy += rh;
    }
    B.add('in_rock', box(ow, oh, 0.1), at(c, oh / 2, z0 + D - od - 0.05), 0x1e1812); // sooty back
    for (const s of [-1, 1]) B.add('in_rock', box(0.06, oh, od), at(c + s * (ow / 2 - 0.03), oh / 2, z0 + D - od / 2), 0x2a221a);
    B.add('in_rock', box(ow, 0.06, od), at(c, oh - 0.03, z0 + D - od / 2), 0x1a1510);
    // A great oak beam for a mantel, and the hearthstone.
    B.add('in_wood', box(W + 0.3, 0.26, 0.34), at(c, oh + 0.13, z0 + D + 0.02), TIMBER);
    B.add('in_rock', box(W + 0.8, 0.08, 1.1), at(c, 0.04, z0 + D + 0.5), 0x7a7266);
    // Logs on firedogs, embers, the fire above them.
    const fz = z0 + D - od / 2;
    for (const s of [-1, 1]) B.add('in_metal', box(0.05, 0.22, 0.5), at(c + s * 0.35, 0.11, fz), IRON);
    for (let k = 0; k < 3; k++) B.add('in_wood', cylinder(0.08, 0.09, 0.95, 8), at(c + (k - 1) * 0.07, 0.24 + (k % 2) * 0.1, fz + (k - 1) * 0.14, 0, 0.2 * (k - 1), Math.PI / 2), 0x2a1c12);
    B.add('in_lamp', box(0.85, 0.06, 0.42), at(c, 0.2, fz), 0x7a2a08);
    for (let k = 0; k < 3; k++) {
      const card = new THREE.PlaneGeometry(0.95, 0.9).translate(0, 0.45, 0);
      B.add('in_flame', card, at(c + (k - 1) * 0.12, 0.26, fz, 0, (k * Math.PI) / 3, 0), new THREE.Color(0, k * 0.37, 0).getHex());
    }
    const fp = new THREE.Vector3(c, 0.7, z0 + D + 0.25).applyMatrix4(at(0, 0, 0));
    this.fire.position.copy(fp);
    this.fire.updateMatrixWorld();
    // Over the mantel: the painting of the green dragon, candles and pots.
    const my = oh + 0.26;
    B.add('in_wood', box(1.1, 0.72, 0.05), at(c, my + 0.62, z0 + D - 0.17), TIMBER);
    B.add('in_art', picture(0), at(c, my + 0.62, z0 + D - 0.14), 0xffffff);
    for (const s of [-1, 1]) {
      candle(B, at(c + s * 1.15, my, z0 + D));
      tankard(B, at(c + s * 0.75, my, z0 + D + 0.02, 0, s));
    }
    this._collideBox(at, c, z0 + D / 2, W / 2 + 0.05, D / 2 + 0.1);
    // Beside it: a stack of firewood and a log basket.
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4 - r; k++) B.add('in_wood', cylinder(0.075, 0.075, 0.55, 7), at(c + W / 2 + 0.3 + (k + r / 2) * 0.155, 0.08 + r * 0.135, z0 + 0.4, Math.PI / 2, 0, 0), [0x5a4028, 0x6a4a2e, 0x4e3824][(r + k) % 3]);
    this._collideBox(at, c + W / 2 + 0.55, z0 + 0.4, 0.4, 0.35);
    B.add('in_wood', cylinder(0.26, 0.22, 0.4, 14, true), at(c - W / 2 - 0.45, 0.2, z0 + 0.6), 0x9a7a48);
    for (let k = 0; k < 3; k++) B.add('in_wood', cylinder(0.05, 0.05, 0.5, 6), at(c - W / 2 - 0.45 + (k - 1) * 0.1, 0.42, z0 + 0.6, 0.3, 0, (k - 1) * 0.2), 0x5a4028);
    // Fireside: two leather armchairs turned toward the fire, a low table between them, on a rug.
    const rz = z0 + D + 2.0;
    B.add('in_rug', new THREE.PlaneGeometry(2.8, 1.9).rotateX(-Math.PI / 2), at(c, 0.045, rz), 0xffffff);
    for (const s of [-1, 1]) {
      const m = at(c + s * 1.0, 0, rz + 0.1, 0, Math.PI + s * 0.55);
      armchair(B, m);
      const p = new THREE.Vector3(c + s * 1.0, 0, rz + 0.1).applyMatrix4(at(0, 0, 0));
      this.colliders.push({ x: p.x, z: p.z, r: 0.5 });
    }
    roundTable(B, at(c, 0, rz + 0.25), 0.32, 0.5);
    tankard(B, at(c + 0.08, 0.5, rz + 0.2, 0, 1));
  }

  _structure(B, hall, y, zones) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of hall) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    const spans = (fixed, alongX, inset = 0.15) => {
      const out = [];
      let s = null;
      for (let t = (alongX ? minX : minZ) - 0.2; t <= (alongX ? maxX : maxZ) + 0.2; t += 0.1) {
        const inside = polyDist(hall, alongX ? t : fixed, alongX ? fixed : t) < -inset;
        if (inside && s === null) s = t;
        if (!inside && s !== null) { out.push([s, t]); s = null; }
      }
      return out;
    };
    // Close-set joists under the boards.
    for (let z = minZ + 0.35; z < maxZ; z += 0.68)
      for (const [x0, x1] of spans(z, true, 0.05)) B.add('in_wood', box(x1 - x0 + 0.1, 0.15, 0.12), mtx((x0 + x1) / 2, y + CEILING - 0.075, z), BEAM);
    // Two heavy girders across them, on turned columns; a tie beam through each column across the
    // room; arched knee braces where they meet.
    this.posts = [];
    const GB = 0.38, bottom = CEILING - GB;
    for (const x of [61.5, 67.5]) {
      for (const [z0, z1] of spans(x, false)) {
        B.add('in_wood', box(0.32, GB, z1 - z0 + 0.3), mtx(x, y + CEILING - GB / 2, (z0 + z1) / 2), TIMBER);
        for (let z = z0 + 3.6; z < z1 - 2.5; z += 4.5) {
          if (this._blocked(x, z, zones, 0.3)) continue;
          column(B, mtx(x, y, z), bottom);
          for (const s of [-1, 1]) brace(B, mtx(x, y, z, 0, Math.PI / 2), s, bottom);
          this.colliders.push({ x, z, r: 0.28 });
          this.posts.push([x, z]);
          for (const [x0, x1] of spans(z, true)) {
            if (x < x0 || x > x1) continue;
            B.add('in_wood', box(x1 - x0 + 0.3, 0.3, 0.26), mtx((x0 + x1) / 2, y + CEILING - 0.15, z), TIMBER);
            for (const s of [-1, 1]) brace(B, mtx(x, y, z), s, CEILING - 0.3);
          }
        }
      }
    }
    // Bunting strung along the girders.
    const flags = [0xc89a38, 0x3a6a3a, 0x9a3a2a, 0x3a5a8a, 0xd8c8a0];
    for (const x of [61.5, 67.5])
      for (const [z0, z1] of spans(x, false, 0.6)) {
        let k = 0;
        for (let z = z0; z < z1; z += 0.2, k++) {
          const t = (z - z0) / (z1 - z0), sag = Math.sin(t * Math.PI * Math.max(1, Math.round((z1 - z0) / 4.5))) ** 2 * 0.1;
          const tri = new THREE.Shape([new THREE.Vector2(-0.065, 0), new THREE.Vector2(0.065, 0), new THREE.Vector2(0, -0.15)]);
          B.add('in_plaster', slab(tri, 0.004, 1), mtx(x + 0.17, y + bottom + 0.06 - sag, z, 0, Math.PI / 2, (k % 2 - 0.5) * 0.12), flags[k % flags.length]);
        }
      }
  }

  _tables(B, hall, y, zones) {
    // Tables on a loose grid across the floor, clear of the bar, the hearth, the columns and the way
    // in from each open door; chairs around them, a candle on each, a chandelier over most.
    const door = this.doorPoints || [];
    const at = (x, z, yaw) => mtx(x, y, z, 0, yaw, 0);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const placed = [];
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of hall) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    let k = 0;
    for (let z = minZ + 1; z < maxZ; z += 3.1)
      for (let x = minX + 1 + ((Math.round(z) % 2) * 1.5); x < maxX; x += 3.3) {
        const px = x + (rnd() - 0.5) * 0.8, pz = z + (rnd() - 0.5) * 0.8;
        if (polyDist(hall, px, pz) > -1.6) continue;
        if (this._blocked(px, pz, zones, 1.3)) continue;
        if (door.some(([dx, dz, ix, iz]) => segDist(px, pz, dx, dz, ix, iz) < 1.8)) continue;
        if (this.posts.some(([qx, qz]) => Math.hypot(px - qx, pz - qz) < 1.5)) continue;
        if (placed.some(([qx, qz]) => Math.hypot(px - qx, pz - qz) < 2.8)) continue;
        placed.push([px, pz]);
        const yaw = rnd() * 0.5 - 0.25;
        const square = k % 3 === 1;
        if (square) squareTable(B, at(px, pz, yaw));
        else roundTable(B, at(px, pz, yaw), 0.55, 0.76);
        this.colliders.push({ x: px, z: pz, r: 0.62 });
        // Chairs, drawn up (or pushed back) all round.
        const n = square ? 4 : 3 + Math.floor(rnd() * 2);
        for (let s = 0; s < n; s++) {
          const a = yaw + (s / n) * Math.PI * 2 + (square ? Math.PI / 4 : rnd() * 0.4);
          const r = (square ? 0.72 : 0.78) + rnd() * 0.18;
          const dx = Math.cos(a), dz = Math.sin(a);
          chair(B, at(px + dx * r, pz + dz * r, Math.atan2(-dx, -dz) + (rnd() - 0.5) * 0.5));
        }
        const ty = y + 0.76;
        // A runner, a candle, tankards and plates; flowers on some.
        if (!square) B.add('in_plaster', box(0.55, 0.004, 0.55), mtx(px, ty + 0.03, pz, 0, yaw + Math.PI / 4), 0xe6dcc4);
        candle(B, mtx(px, ty + 0.03, pz));
        for (let s = 0; s < 1 + Math.floor(rnd() * 3); s++) tankard(B, mtx(px + (rnd() - 0.5) * 0.6, ty + 0.03, pz + (rnd() - 0.5) * 0.6, 0, rnd() * 6));
        B.add('in_plaster', cylinder(0.13, 0.13, 0.015, 14), mtx(px + 0.2, ty + 0.035, pz - 0.12), 0xe8e0cc);
        if (k % 2 === 0) flowers(B, mtx(px - 0.14, ty + 0.03, pz + 0.12), rnd);
        this._chandelier(B, px, pz, y);
        k++;
      }
  }

  _chandelier(B, x, z, y) {
    // An iron ring of candles hung on three chains from a ceiling hook.
    const h = y + CEILING - 0.6, R = 0.36, hub = 0.3;
    B.add('in_metal', box(0.03, 0.03, 0.03), mtx(x, y + CEILING - 0.02, z), IRON);
    B.add('in_metal', box(0.012, CEILING - 0.6 - hub, 0.012), mtx(x, (y + CEILING + h + hub) / 2, z), IRON);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2, len = Math.hypot(R, hub), tilt = Math.atan2(R, hub);
      B.add('in_metal', box(0.01, len, 0.01), mtx(x + (Math.cos(a) * R) / 2, h + hub / 2, z + (Math.sin(a) * R) / 2).multiply(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)), tilt)), IRON);
    }
    B.add('in_metal', new THREE.TorusGeometry(R, 0.018, 6, 28).rotateX(Math.PI / 2), mtx(x, h, z), IRON);
    B.add('in_metal', new THREE.TorusGeometry(0.1, 0.014, 5, 12).rotateX(Math.PI / 2), mtx(x, h - 0.06, z), IRON);
    B.add('in_metal', cylinder(0.02, 0.035, 0.18, 8), mtx(x, h - 0.03, z), IRON);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3, cx = x + Math.cos(a) * R, cz = z + Math.sin(a) * R;
      B.add('in_metal', box(R - 0.1, 0.014, 0.014), mtx(x + Math.cos(a) * (R / 2 + 0.05), h - 0.04, z + Math.sin(a) * (R / 2 + 0.05), 0, -a, 0), IRON);
      B.add('in_metal', cylinder(0.035, 0.02, 0.03, 8), mtx(cx, h + 0.02, cz), 0x5a4a30);
      B.add('in_plaster', cylinder(0.017, 0.017, 0.1, 8), mtx(cx, h + 0.085, cz), 0xf0e6cc);
      B.add('in_lamp', new THREE.SphereGeometry(0.017, 6, 4).scale(1, 1.9, 1), mtx(cx, h + 0.16, cz), 0xffffff);
    }
    if (this.lamps.length < MAX_LIGHTS) {
      const l = new THREE.PointLight(0xffa860, 1.6, 9, 2);
      l.position.set(x, h + 0.12, z);
      l.updateMatrixWorld();
      this.lamps.push(l);
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
    this.hemi.color.setRGB(sky[0] * 0.1 + 0.017, sky[1] * 0.1 + 0.011, sky[2] * 0.08 + 0.005);
    this.hemi.groundColor.setRGB(sky[0] * 0.05 + 0.013, sky[1] * 0.05 + 0.008, sky[2] * 0.05 + 0.004);
  }
}

// ---------------------------------------------------------------------------------------------
// Joinery and furniture. Each piece is built around a local frame `m` (floor at y = 0).

const at = (m, x, y, z, rx, ry, rz) => m.clone().multiply(mtx(x, y, z, rx, ry, rz));

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
}

/** A turned oak column up to `top`, on a square plinth, with a flared capital and abacus. */
function column(B, m, top) {
  B.add('in_wood', box(0.48, 0.42, 0.48), at(m, 0, 0.21, 0), TIMBER);
  B.add('in_wood', box(0.52, 0.06, 0.52), at(m, 0, 0.45, 0), BEAM);
  const pts = [[0.2, 0.48], [0.2, 0.54], [0.165, 0.6], [0.18, 0.66], [0.155, 0.72], [0.15, top - 0.42], [0.175, top - 0.38], [0.15, top - 0.33], [0.2, top - 0.2], [0.235, top - 0.12], [0.235, top - 0.08]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 16);
  const uvs = g.attributes.uv, pos = g.attributes.position;
  for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) * 1.1, pos.getY(i)); // meters, grain up the shaft
  B.add('in_wood', g, m, 0x5c3a22);
  B.add('in_wood', box(0.5, 0.08, 0.5), at(m, 0, top - 0.04, 0), TIMBER);
}

/** An arched knee brace from a column (radius ≈0.17) out to side `s` along local x, up to a beam's underside at `top`. */
function brace(B, m, s, top) {
  const R = 0.72, r0 = 0.15;
  B.add('in_wood', arcTimber(R, 0.13, 0.13, s > 0 ? Math.PI / 2 : 0, s > 0 ? Math.PI : Math.PI / 2, 10), at(m, s * (r0 + R - 0.02), top - R + 0.02, 0), TIMBER);
}

function barrel(B, m, r, len) {
  // Lying along local z.
  const g = new THREE.CylinderGeometry(r, r, len, 18, 4, true);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const yy = p.getY(i) / (len / 2), bulge = 1 + 0.1 * (1 - yy * yy);
    p.setX(i, p.getX(i) * bulge);
    p.setZ(i, p.getZ(i) * bulge);
  }
  g.computeVertexNormals();
  const rot = m.clone().multiply(mtx(0, 0, 0, Math.PI / 2, 0, 0));
  B.add('in_wood', g, rot, 0x7a5634);
  for (const t of [-0.38, -0.15, 0.15, 0.38]) {
    const rr = r * (1 + 0.1 * (1 - (t / 0.5) ** 2)) + 0.006;
    B.add('in_metal', cylinder(rr, rr, 0.04, 18, true), rot.clone().multiply(mtx(0, t * len, 0)), 0x2d2a26);
  }
}

function tankard(B, m) {
  B.add('in_wood', cylinder(0.045, 0.05, 0.13, 10), at(m, 0, 0.065, 0), 0x8a6a44);
  B.add('in_metal', cylinder(0.052, 0.052, 0.012, 10), at(m, 0, 0.02, 0), 0x5a5048);
  B.add('in_wood', new THREE.TorusGeometry(0.035, 0.008, 5, 10, Math.PI), at(m, 0.05, 0.065, 0, 0, -Math.PI / 2), 0x6a4a30);
}

/** A glazed jug hanging with its top at `m`, scaled `s`. */
function jug(B, m, tint, s = 1) {
  const pts = [[0.001, 0], [0.07, 0], [0.09, 0.05], [0.09, 0.13], [0.06, 0.19], [0.045, 0.23], [0.055, 0.26], [0.001, 0.26]].map(([r, y]) => new THREE.Vector2(r * s, y * s));
  B.add('in_bottle', new THREE.LatheGeometry(pts, 10), m, tint);
  B.add('in_bottle', new THREE.TorusGeometry(0.06 * s, 0.012 * s, 5, 10, Math.PI), at(m, 0.08 * s, 0.17 * s, 0, 0, -Math.PI / 2), tint);
}

function candle(B, m) {
  B.add('in_metal', cylinder(0.05, 0.06, 0.02, 10), at(m, 0, 0.01, 0), 0x6a5a40);
  B.add('in_plaster', cylinder(0.022, 0.022, 0.12, 8), at(m, 0, 0.08, 0), 0xf0e6cc);
  B.add('in_lamp', new THREE.SphereGeometry(0.018, 6, 4).scale(1, 1.9, 1), at(m, 0, 0.165, 0), 0xffffff);
}

function flowers(B, m, rnd) {
  B.add('in_bottle', cylinder(0.035, 0.045, 0.12, 10), at(m, 0, 0.06, 0), 0x5a6a7a);
  for (let k = 0; k < 7; k++) {
    const a = rnd() * 6.28, r = rnd() * 0.06;
    B.add('in_plaster', new THREE.IcosahedronGeometry(0.03 + rnd() * 0.015, 0), at(m, Math.cos(a) * r, 0.17 + rnd() * 0.08, Math.sin(a) * r), [0xd8402a, 0xe8a030, 0xc83040, 0xf0d060][k % 4]);
  }
  B.add('in_plaster', new THREE.IcosahedronGeometry(0.06, 0), at(m, 0, 0.14, 0), 0x4a6a2a);
}

function roundTable(B, m, r, h) {
  B.add('in_wood', cylinder(r, r, 0.05, 24), at(m, 0, h - 0.025, 0), OAK_LIGHT);
  B.add('in_wood', cylinder(r - 0.03, r - 0.03, 0.06, 20), at(m, 0, h - 0.07, 0), OAK);
  B.add('in_wood', cylinder(0.06, 0.09, h - 0.1, 10), at(m, 0, (h - 0.1) / 2, 0), OAK);
  for (const a of [0, Math.PI / 2]) B.add('in_wood', box(r * 1.3, 0.07, 0.09), at(m, 0, 0.035, 0, a, 0), OAK);
}

function squareTable(B, m) {
  B.add('in_wood', box(0.95, 0.05, 0.95), at(m, 0, 0.735, 0), OAK_LIGHT);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.add('in_wood', box(0.07, 0.71, 0.07), at(m, sx * 0.38, 0.355, sz * 0.38), OAK);
  for (const a of [0, Math.PI / 2]) for (const s of [-1, 1]) B.add('in_wood', box(0.76, 0.1, 0.03), at(m, 0, 0.66, 0, 0, a, 0).multiply(mtx(0, 0, s * 0.38)), OAK);
}

/** A spindle-back chair facing local +z. */
function chair(B, m) {
  B.add('in_wood', box(0.44, 0.045, 0.42), at(m, 0, 0.45, 0), OAK_LIGHT);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.add('in_wood', cylinder(0.018, 0.022, 0.45, 6), at(m, sx * 0.18, 0.225, sz * 0.17), OAK);
  for (const s of [-1, 1]) {
    B.add('in_wood', box(0.025, 0.025, 0.34), at(m, s * 0.18, 0.14, 0), OAK);
    B.add('in_wood', cylinder(0.02, 0.022, 0.55, 6), at(m, s * 0.19, 0.74, -0.19, -0.1, 0, 0), OAK);
  }
  B.add('in_wood', box(0.34, 0.025, 0.025), at(m, 0, 0.2, 0.17), OAK);
  B.add('in_wood', box(0.44, 0.09, 0.035), at(m, 0, 0.97, -0.22, -0.1, 0, 0), OAK_LIGHT);
  B.add('in_wood', box(0.38, 0.03, 0.03), at(m, 0, 0.55, -0.2, -0.1, 0, 0), OAK);
  for (const x of [-0.1, -0.035, 0.035, 0.1]) B.add('in_wood', cylinder(0.01, 0.012, 0.38, 5), at(m, x, 0.75, -0.21, -0.1, 0, 0), OAK);
}

function barStool(B, m) {
  B.add('in_wood', box(0.36, 0.05, 0.36), at(m, 0, 0.74, 0), OAK_LIGHT);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) B.add('in_wood', box(0.05, 0.74, 0.05), at(m, sx * 0.14, 0.37, sz * 0.14, sz * 0.05, 0, -sx * 0.05), OAK);
  for (const a of [0, Math.PI / 2]) for (const s of [-1, 1]) B.add('in_wood', box(0.3, 0.03, 0.03), at(m, 0, 0.26, 0, 0, a, 0).multiply(mtx(0, 0, s * 0.15)), OAK);
}

/** A deep leather armchair facing local +z. */
function armchair(B, m) {
  B.add('in_wood', box(0.86, 0.14, 0.82), at(m, 0, 0.07, 0), TIMBER);
  B.add('in_leather', box(0.62, 0.2, 0.66), at(m, 0, 0.3, 0.05), LEATHER); // seat cushion
  B.add('in_leather', box(0.82, 0.18, 0.8), at(m, 0, 0.18, 0), 0x6a3a1e);
  B.add('in_leather', box(0.8, 0.72, 0.2), at(m, 0, 0.62, -0.32, -0.12, 0, 0), LEATHER); // back
  for (const s of [-1, 1]) {
    B.add('in_leather', box(0.15, 0.42, 0.8), at(m, s * 0.36, 0.44, 0), LEATHER);
    B.add('in_leather', new THREE.CylinderGeometry(0.1, 0.1, 0.82, 10).rotateX(Math.PI / 2), at(m, s * 0.37, 0.66, 0), LEATHER); // rolled arm
  }
}

// ---------------------------------------------------------------------------------------------
// Painted canvases

/** One picture from the paintings atlas (0: the green dragon, 1–3: small landscapes), as a plane. */
function picture(i, w = 1.0, h = 0.6) {
  const g = new THREE.PlaneGeometry(w, h);
  const uvs = g.attributes.uv;
  const u0 = (i % 2) * 0.5, v0 = i < 2 ? 0.5 : 0;
  for (let k = 0; k < uvs.count; k++) uvs.setXY(k, u0 + uvs.getX(k) * 0.5, v0 + uvs.getY(k) * 0.5);
  return g;
}

let _paintings = null;
/** An atlas of four paintings in the inn's naive style. */
function paintings() {
  if (_paintings) return _paintings;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 300;
  const g = c.getContext('2d');
  const cell = (i, fn) => {
    g.save();
    g.translate((i % 2) * 256, i < 2 ? 0 : 150);
    g.beginPath(); g.rect(0, 0, 256, 150); g.clip();
    fn();
    g.fillStyle = 'rgba(80,50,10,0.2)';
    g.fillRect(0, 0, 256, 150);
    g.restore();
  };
  // The green dragon curled on a hill.
  cell(0, () => {
    const sky = g.createLinearGradient(0, 0, 0, 150);
    sky.addColorStop(0, '#c9b07a'); sky.addColorStop(1, '#8a7a4a');
    g.fillStyle = sky; g.fillRect(0, 0, 256, 150);
    g.fillStyle = '#5a6a30';
    g.beginPath(); g.ellipse(128, 160, 170, 60, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#2f6a2a'; g.lineWidth = 16; g.lineCap = 'round';
    g.beginPath(); g.moveTo(40, 110); g.bezierCurveTo(80, 60, 130, 130, 170, 80); g.bezierCurveTo(185, 62, 200, 60, 212, 50); g.stroke();
    g.fillStyle = '#2f6a2a';
    g.beginPath(); g.moveTo(205, 44); g.lineTo(232, 38); g.lineTo(214, 58); g.closePath(); g.fill();
    g.fillStyle = '#3f7a34';
    g.beginPath(); g.moveTo(120, 95); g.quadraticCurveTo(110, 30, 150, 25); g.quadraticCurveTo(140, 55, 160, 85); g.closePath(); g.fill();
    g.fillStyle = '#e8c040'; g.fillRect(216, 44, 4, 4);
  });
  // Rolling hills with a round door.
  cell(1, () => {
    g.fillStyle = '#9ab0b8'; g.fillRect(0, 0, 256, 150);
    g.fillStyle = '#6a8a3a'; g.beginPath(); g.ellipse(90, 150, 150, 70, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#4e6e2a'; g.beginPath(); g.ellipse(210, 160, 120, 60, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2e5a2a'; g.beginPath(); g.arc(90, 112, 16, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c8a040'; g.beginPath(); g.arc(90, 112, 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3a5a2a'; g.beginPath(); g.arc(200, 70, 26, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#4a3020'; g.fillRect(197, 80, 6, 30);
  });
  // A river and a mill.
  cell(2, () => {
    g.fillStyle = '#b8a878'; g.fillRect(0, 0, 256, 150);
    g.fillStyle = '#5a7a3a'; g.fillRect(0, 80, 256, 70);
    g.fillStyle = '#4a6a8a'; g.beginPath(); g.moveTo(0, 120); g.quadraticCurveTo(128, 90, 256, 130); g.lineTo(256, 150); g.lineTo(0, 150); g.fill();
    g.fillStyle = '#8a6a4a'; g.fillRect(150, 55, 50, 35);
    g.fillStyle = '#6a4a2a'; g.beginPath(); g.moveTo(144, 58); g.lineTo(175, 35); g.lineTo(206, 58); g.fill();
    g.strokeStyle = '#3a2a1a'; g.lineWidth = 4; g.beginPath(); g.arc(140, 85, 16, 0, Math.PI * 2); g.stroke();
  });
  // A still life: a jug and apples.
  cell(3, () => {
    g.fillStyle = '#3a2a1a'; g.fillRect(0, 0, 256, 150);
    g.fillStyle = '#6a4a2a'; g.fillRect(0, 105, 256, 45);
    g.fillStyle = '#3a6a3a'; g.beginPath(); g.ellipse(110, 80, 30, 36, 0, 0, Math.PI * 2); g.fill(); g.fillRect(100, 30, 20, 30);
    g.fillStyle = '#a83a2a'; for (const x of [160, 184, 172]) { g.beginPath(); g.arc(x, x === 172 ? 88 : 100, 11, 0, Math.PI * 2); g.fill(); }
  });
  _paintings = new THREE.CanvasTexture(c);
  _paintings.colorSpace = THREE.SRGBColorSpace;
  return _paintings;
}

/** A woven rug: a madder-red field, borders and a medallion. */
function rugTexture() {
  const c = document.createElement('canvas');
  c.width = 280; c.height = 190;
  const g = c.getContext('2d');
  g.fillStyle = '#6a2a1e'; g.fillRect(0, 0, 280, 190);
  g.strokeStyle = '#c89a48'; g.lineWidth = 10; g.strokeRect(10, 10, 260, 170);
  g.strokeStyle = '#2e4a3a'; g.lineWidth = 8; g.strokeRect(24, 24, 232, 142);
  g.strokeStyle = '#d8c090'; g.lineWidth = 2; g.strokeRect(32, 32, 216, 126);
  g.fillStyle = '#2e4a3a';
  g.beginPath(); g.moveTo(140, 50); g.lineTo(200, 95); g.lineTo(140, 140); g.lineTo(80, 95); g.closePath(); g.fill();
  g.fillStyle = '#c89a48';
  g.beginPath(); g.moveTo(140, 68); g.lineTo(176, 95); g.lineTo(140, 122); g.lineTo(104, 95); g.closePath(); g.fill();
  g.fillStyle = '#8a3a24';
  g.beginPath(); g.moveTo(140, 82); g.lineTo(158, 95); g.lineTo(140, 108); g.lineTo(122, 95); g.closePath(); g.fill();
  for (let x = 16; x < 270; x += 12) { g.fillStyle = '#d8c090'; g.fillRect(x, 13, 4, 4); g.fillRect(x, 173, 4, 4); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
