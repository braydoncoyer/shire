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
    const base = mix(color(0x3e372c), color(0x7c6d52), strands.mul(0.6).add(fine.mul(0.4)).saturate());
    const warm = mix(base, color(0xa38a5c), smoothstep(0.6, 0.85, clump).mul(0.35));
    const moss = mix(warm, color(0x4a5230), smoothstep(0.1, 0.3, clump).mul(0.3));
    const shade = smoothstep(0.0, 0.3, course).mul(0.4).add(0.6);
    const streak = texture(noiseTex, vec2(p.x.mul(22), p.y.mul(0.5))).a.mul(0.35).add(0.75);
    return moss.mul(shade).mul(streak).mul(vcol);
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

  // Straw fringe: the ragged hanging ends of thatch along the eaves.
  const straw = new THREE.MeshLambertNodeMaterial({ side: THREE.DoubleSide, alphaTest: 0.5 });
  straw.alphaToCoverage = true;
  straw.colorNode = Fn(() => {
    const a = saturate(strandTex.a.sub(0.45).div(max(fwidth(strandTex.a), 1e-4)).add(0.5));
    return vec4(mix(color(0x3a3228), color(0x8a7858), strandTex.r), a);
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

  const mats = { stone, wood, paint, brick, roof, metal, glass, plaster, thatch, turf, fringe, straw };
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

// ---------------------------------------------------------------------------------------------
// Footprint-driven building parts (world-space polygons, [x, z] pairs)

function signedArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length - 1; i++) a += poly[i][0] * poly[i + 1][1] - poly[i + 1][0] * poly[i][1];
  return a / 2;
}

/** Closed polygon without the repeated last point, wound so outward normals are (dz, -dx)·sign. */
export function cleanPoly(poly) {
  const p = poly.slice();
  if (p.length > 1 && p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1]) p.pop();
  return p;
}

/** Signed distance to a polygon's edges: negative inside. */
export function polyDist(poly, x, z) {
  let best = Infinity, inside = false;
  for (let k = 0, m = poly.length - 1; k < poly.length; m = k++) {
    const [ax, az] = poly[m], [bx, bz] = poly[k];
    if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1e-6)));
    const px = ax + dx * t - x, pz = az + dz * t - z;
    best = Math.min(best, px * px + pz * pz);
  }
  return (inside ? -1 : 1) * Math.sqrt(best);
}

/**
 * Edges of a polygon as wall frames: { m (Matrix4 at the edge start, x along the edge, z outward),
 * len, mid:[x,z], n:[nx,nz] }.
 */
export function polyEdges(poly, y) {
  const p = cleanPoly(poly);
  const ccw = signedArea([...p, p[0]]) > 0; // in x/z with z down, positive area = clockwise on screen
  const out = [];
  for (let i = 0; i < p.length; i++) {
    const [ax, az] = p[i], [bx, bz] = p[(i + 1) % p.length];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.3) continue;
    const ex = (bx - ax) / len, ez = (bz - az) / len;
    let nx = ez, nz = -ex;
    if (polyDist(p, (ax + bx) / 2 + nx * 0.2, (az + bz) / 2 + nz * 0.2) < 0) { nx = -nx; nz = -nz; }
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(ex, 0, ez), new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, 0, nz)).setPosition(ax, y, az);
    out.push({ m, len, a: [ax, az], b: [bx, bz], mid: [(ax + bx) / 2, (az + bz) / 2], n: [nx, nz] });
  }
  void ccw;
  return out;
}

/**
 * A thatch roof over any footprint: height rises with distance in from the eave line, so hipped
 * ridges form along the middle of every wing by themselves. `overhang` pushes the eaves out past
 * the walls; the edge gets a thick rounded lip. World space; uv in meters.
 */
export function footprintRoof(poly, { eaveY, overhang = 0.9, rise = 5, reach = 11, res = 0.5, lip = 0.45 }) {
  const p = cleanPoly(poly);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of p) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  minX -= overhang + 1; minZ -= overhang + 1; maxX += overhang + 1; maxZ += overhang + 1;
  const nx = Math.ceil((maxX - minX) / res) + 1, nz = Math.ceil((maxZ - minZ) / res) + 1;
  const D = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) D[j * nx + i] = polyDist(p, minX + i * res, minZ + j * res) - overhang;
  const height = (d) => {
    const t = Math.min(-d / reach, 1);
    return eaveY + rise * (1 - Math.pow(1 - t, 1.7));
  };
  const pos = [], uv = [], idx = [];
  const vid = new Int32Array(nx * nz).fill(-1);
  const vert = (i, j) => {
    const k = j * nx + i;
    if (vid[k] >= 0) return vid[k];
    let x = minX + i * res, z = minZ + j * res, d = D[k];
    if (d > 0) {
      // Pull outside vertices back onto the eave line along the distance gradient.
      const gx = (D[j * nx + Math.min(i + 1, nx - 1)] - D[j * nx + Math.max(i - 1, 0)]) / (2 * res);
      const gz = (D[Math.min(j + 1, nz - 1) * nx + i] - D[Math.max(j - 1, 0) * nx + i]) / (2 * res);
      const gl = Math.hypot(gx, gz) || 1;
      x -= (gx / gl) * d; z -= (gz / gl) * d; d = 0;
    }
    vid[k] = pos.length / 3;
    pos.push(x, height(Math.min(d, 0)), z);
    uv.push(x * 0.7 + z * 0.3, -d);
    return vid[k];
  };
  const edgeVerts = new Set();
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const ks = [j * nx + i, j * nx + i + 1, (j + 1) * nx + i, (j + 1) * nx + i + 1];
      if (ks.every((k) => D[k] > 0)) continue;
      const a = vert(i, j), b = vert(i + 1, j), c = vert(i, j + 1), e = vert(i + 1, j + 1);
      idx.push(a, c, b, b, c, e);
      ks.forEach((k, q) => { if (D[k] > -res * 1.5) edgeVerts.add([a, b, c, e][q]); });
    }
  // Coursed, lumpy thatch: each course of straw bundles steps out a little, plus random swelling.
  for (let v = 0; v < pos.length / 3; v++) {
    const x = pos[v * 3], z = pos[v * 3 + 2];
    const d = -(polyDist(p, x, z) - overhang);
    const course = (d / 0.75) % 1;
    const lump = Math.sin(x * 1.7 + Math.sin(z * 0.9) * 2) * Math.sin(z * 1.3 + x * 0.4) * 0.09;
    pos[v * 3 + 1] += (1 - course) * 0.1 + lump;
  }
  // Thick lip: drop the outermost ring of vertices a little so the eave curls down.
  for (const v of edgeVerts) {
    const x = pos[v * 3], z = pos[v * 3 + 2];
    const d = polyDist(p, x, z) - overhang;
    if (d > -res * 1.2) pos[v * 3 + 1] -= lip * (1 - Math.min(1, -d / (res * 1.2)));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData.heightAt = (x, z) => height(Math.min(polyDist(p, x, z) - overhang, 0));
  return g;
}
