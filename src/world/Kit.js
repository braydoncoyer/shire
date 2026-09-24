// Building kit: procedural materials and a builder that merges geometry per material, so the whole
// village draws in a handful of calls. Every piece is built in a local frame and placed with a
// matrix; vertex colors carry per-piece tints (door paint, stone warmth, lit windows).

import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  Fn, uv, vec2, vec3, float, mix, smoothstep, fract, abs, sin, attribute, color, texture, positionWorld,
  mx_worley_noise_vec2, mx_fractal_noise_float, uniform, max, floor, hash, step, vec4, saturate, fwidth,
} from 'three/tsl';

// ---------------------------------------------------------------------------------------------
// Materials

export function makeMaterials(sky, noiseTex) {
  const vcol = attribute('color', 'vec3');
  const night = sky.u.night;

  // Fieldstone: rounded stones in mortar, from Worley cells in the piece's own uv (meters).
  const stone = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
  stone.colorNode = Fn(() => {
    const p = uv().mul(vec2(2.1, 2.9));
    const w = mx_worley_noise_vec2(p);
    const edge = w.y.sub(w.x);
    const mortar = float(1).sub(smoothstep(0.02, 0.09, edge));
    const tone = mx_fractal_noise_float(p.mul(0.9), 2).mul(0.25).add(0.85);
    const speck = texture(noiseTex, uv().mul(3.1)).a.mul(0.3).add(0.8);
    const rock = vcol.mul(tone).mul(speck).mul(smoothstep(0.0, 0.25, edge).mul(0.35).add(0.65));
    return mix(rock, vec3(0.42, 0.4, 0.36).mul(vcol.g.add(0.4)), mortar.mul(0.85));
  })();

  // Wood: long grain along uv.y, tinted by vertex color (natural oak or paint).
  const wood = new THREE.MeshStandardNodeMaterial({ roughness: 0.85 });
  wood.colorNode = Fn(() => {
    const g = texture(noiseTex, uv().mul(vec2(0.6, 0.06))).b;
    const grain = sin(uv().x.mul(40).add(g.mul(18))).mul(0.5).add(0.5);
    return vcol.mul(grain.mul(0.18).add(0.82)).mul(g.mul(0.2).add(0.9));
  })();

  // Painted round doors: planks (vertical stripes) with grooves, slightly glossy paint.
  const paint = new THREE.MeshStandardNodeMaterial({ roughness: 0.5 });
  paint.colorNode = Fn(() => {
    const x = uv().x.mul(7);
    const groove = smoothstep(0.0, 0.06, fract(x)).mul(smoothstep(1.0, 0.94, fract(x)));
    const wear = texture(noiseTex, uv().mul(vec2(1.5, 0.3))).a.mul(0.18).add(0.88);
    return vcol.mul(groove.mul(0.3).add(0.7)).mul(wear);
  })();

  // Brick: running bond in uv meters.
  const brick = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
  brick.colorNode = Fn(() => {
    const p = uv().mul(vec2(4.5, 13));
    const row = floor(p.y);
    const q = vec2(p.x.add(row.mul(0.5)), p.y);
    const f = fract(q);
    const mortar = float(1).sub(smoothstep(0.0, 0.06, f.x).mul(smoothstep(0.0, 0.12, f.y)));
    const id = hash(floor(q.x).add(row.mul(97)).add(1000));
    const b = vcol.mul(id.mul(0.3).add(0.8));
    return mix(b, vec3(0.45, 0.42, 0.38), mortar);
  })();

  // Roof shingles: staggered rows, weathered.
  const roof = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
  roof.colorNode = Fn(() => {
    const p = uv().mul(vec2(3.2, 5));
    const row = floor(p.y);
    const f = fract(vec2(p.x.add(row.mul(0.5)), p.y));
    const shade = smoothstep(0.0, 0.25, f.y).mul(0.35).add(0.65).mul(smoothstep(0.0, 0.05, f.x).mul(0.2).add(0.8));
    const id = hash(floor(p.x.add(row.mul(0.5))).add(row.mul(131)).add(5000));
    return vcol.mul(shade).mul(id.mul(0.25).add(0.85));
  })();

  // Lime plaster: soft, slightly mottled.
  const plaster = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
  plaster.colorNode = Fn(() => {
    const n = texture(noiseTex, uv().mul(0.35)).g.mul(0.12).add(texture(noiseTex, uv().mul(2.3)).a.mul(0.08)).add(0.86);
    return vcol.mul(n);
  })();

  // Thatch: bundles of straw running down the slope (uv.y), laid in overlapping courses, greyed and
  // mossy with age. uv is in meters.
  const thatch = new THREE.MeshStandardNodeMaterial({ roughness: 1, side: THREE.DoubleSide });
  thatch.colorNode = Fn(() => {
    const p = uv();
    const course = fract(p.y.mul(1.6).add(texture(noiseTex, p.mul(vec2(0.3, 0.1))).r.mul(0.6)));
    const strands = texture(noiseTex, vec2(p.x.mul(14), p.y.mul(1.4))).a;
    const fine = texture(noiseTex, vec2(p.x.mul(40), p.y.mul(3))).b;
    const clump = texture(noiseTex, p.mul(vec2(0.6, 0.35))).g;
    // Old reed thatch weathers to grey-brown; fresher patches are warmer, moss darkens the hollows.
    const base = mix(color(0x5e5446), color(0x9a8a6c), strands.mul(0.6).add(fine.mul(0.4)).saturate());
    const warm = mix(base, color(0xa38a5c), smoothstep(0.6, 0.85, clump).mul(0.35));
    const moss = mix(warm, color(0x4a5230), smoothstep(0.1, 0.3, clump).mul(0.3));
    const shade = smoothstep(0.0, 0.3, course).mul(0.3).add(0.7);
    return moss.mul(shade).mul(vcol);
  })();

  // Turf: the grassy hood that overhangs hobbit-hole facades. Hanging strands, darker underneath.
  const turf = new THREE.MeshStandardNodeMaterial({ roughness: 1 });
  turf.colorNode = Fn(() => {
    const p = uv();
    const strands = texture(noiseTex, vec2(p.x.mul(11), p.y.mul(1.2))).a;
    const patch = texture(noiseTex, p.mul(0.7)).r;
    const g = mix(color(0x35601a), color(0x6f9a2c), strands.mul(0.6).add(patch.mul(0.5)).sub(0.1).saturate());
    return g.mul(vcol);
  })();

  // Grass fringe cards: tufts of long strands, alpha-tested, for turf edges.
  const fringe = new THREE.MeshLambertNodeMaterial({ side: THREE.DoubleSide, alphaTest: 0.5 });
  fringe.alphaToCoverage = true;
  const strandTex = texture(strandTexture(), uv());
  fringe.colorNode = Fn(() => {
    const a = saturate(strandTex.a.sub(0.45).div(max(fwidth(strandTex.a), 1e-4)).add(0.5));
    return vec4(mix(color(0x2f5a16), color(0x86a83a), strandTex.r).mul(vcol), a);
  })();

  const metal = new THREE.MeshStandardNodeMaterial({ roughness: 0.35, metalness: 1 });
  metal.colorNode = vcol;

  // Glass: dark and glossy by day; windows marked lit (vertex red) glow warmly after dusk.
  const glass = new THREE.MeshStandardNodeMaterial({ roughness: 0.12, metalness: 0.0 });
  glass.colorNode = vec3(0.02, 0.025, 0.03);
  const lampWarm = color(0xffa24a);
  const flicker = uniform(0);
  glass.emissiveNode = Fn(() => {
    const lit = attribute('color', 'vec3').r;
    const grid = step(0.06, abs(fract(uv().x.mul(2)).sub(0.5))).mul(0.4).add(0.6);
    // Scene-referred: a warm lamp-lit window, a few times brighter than the moonlit ground.
    return lampWarm.mul(lit).mul(smoothstep(0.05, 0.6, night)).mul(0.11).mul(grid).mul(flicker.mul(0.08).add(0.95));
  })();

  const mats = { stone, wood, paint, brick, roof, metal, glass, plaster, thatch, turf, fringe };
  mats.flicker = flicker;
  return mats;
}

/** Long grass strands hanging from the top edge. R: shade (tips lighter), A: coverage. */
function strandTexture() {
  const W = 256, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) {
    const x = rnd() * W, len = H * (0.35 + rnd() * 0.65), bend = (rnd() - 0.5) * 40, w = 2 + rnd() * 3;
    const grad = g.createLinearGradient(0, 0, 0, len);
    grad.addColorStop(0, 'rgb(40,0,0)');
    grad.addColorStop(1, 'rgb(255,0,0)');
    g.strokeStyle = grad;
    g.lineWidth = w;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, 0);
    g.quadraticCurveTo(x + bend * 0.3, len * 0.5, x + bend, len);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// ---------------------------------------------------------------------------------------------
// Geometry builder

const _c = new THREE.Color();

export class Builder {
  constructor() {
    this.parts = {};
  }

  /** Add a geometry (consumed) under material `mat`, transformed by `matrix`, tinted `tint`. */
  add(mat, geo, matrix, tint = 0xffffff) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.deleteAttribute('uv1');
    g.applyMatrix4(matrix);
    _c.set(tint);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    (this.parts[mat] ||= []).push(g);
  }

  build(materials) {
    const group = new THREE.Group();
    for (const [mat, list] of Object.entries(this.parts)) {
      const geo = mergeGeometries(list, false);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, materials[mat]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = mat;
      group.add(mesh);
    }
    return group;
  }
}

// Handy matrix composer: position, yaw (about y), then optional local rotation and scale.
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
export function mtx(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

/** Box with uvs in meters on each face (so stone/wood patterns keep their scale). */
export function box(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uvs = g.attributes.uv, pos = g.attributes.position, nrm = g.attributes.normal;
  for (let i = 0; i < uvs.count; i++) {
    const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (ax > 0.5) uvs.setXY(i, z, y);
    else if (ay > 0.5) uvs.setXY(i, x, z);
    else uvs.setXY(i, x, y);
  }
  return g;
}

/** Cylinder with uvs in meters (u around, v up). */
export function cylinder(rt, rb, h, seg = 12, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  const uvs = g.attributes.uv;
  const circ = Math.PI * (rt + rb);
  for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) * circ, uvs.getY(i) * h);
  return g;
}

/**
 * Rounded thatch roof: the top half of a superellipsoid "loaf" over a w × d footprint, rising h
 * above its eaves, plus an underside so the thick eaves read from below. Local origin at the eave
 * center; x along w. uv in meters (u around, v down from the ridge).
 */
export function thatchRoof(w, d, h, { hip = 2.4, side = 3.2, seg = 28 } = {}) {
  const a = w / 2, b = d / 2;
  const pos = [], uv = [], idx = [];
  const sgnPow = (x, e) => Math.sign(x) * Math.pow(Math.abs(x), e);
  const rows = seg / 2, cols = seg * 2;
  for (let i = 0; i <= rows; i++) {
    const th = (i / rows) * (Math.PI / 2); // 0 at the ridge, pi/2 at the eaves
    const ct = Math.cos(th), st = Math.sin(th);
    for (let j = 0; j <= cols; j++) {
      const ph = (j / cols) * Math.PI * 2;
      const r = sgnPow(st, 2 / side);
      const x = a * r * sgnPow(Math.cos(ph), 2 / hip);
      const z = b * r * sgnPow(Math.sin(ph), 2 / hip);
      const y = h * sgnPow(ct, 2 / side);
      pos.push(x, y, z);
      uv.push((j / cols) * 2 * (w + d), (i / rows) * (h + Math.max(a, b)));
    }
  }
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      const p = i * (cols + 1) + j, q = p + cols + 1;
      idx.push(p, q, p + 1, p + 1, q, q + 1);
    }
  // Underside: a flat ring just inside the eave, dropped a little, to give the eaves thickness.
  const base = pos.length / 3;
  for (let j = 0; j <= cols; j++) {
    const ph = (j / cols) * Math.PI * 2;
    for (const [k, dy] of [[1, 0], [0.82, 0.35]]) {
      pos.push(a * k * sgnPow(Math.cos(ph), 2 / hip), dy, b * k * sgnPow(Math.sin(ph), 2 / hip));
      uv.push((j / cols) * 2 * (w + d), dy);
    }
  }
  const eave = rows * (cols + 1);
  for (let j = 0; j < cols; j++) {
    const o = base + j * 2, i0 = eave + j;
    idx.push(i0, i0 + 1, o, o, i0 + 1, o + 2); // eave edge to the outer ring
    idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
