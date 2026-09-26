// Terrain: a 1 m heightfield over the set itself and a coarse ring out to the horizon hills.
// The ring's grid has a line exactly on the inner boundary, so the two meshes butt together;
// a skirt on the inner mesh hides the T-junction cracks.

import * as THREE from 'three/webgpu';
import {
  Fn, texture, positionWorld, normalWorld, cameraPosition, vec3, float, mix, smoothstep, abs, step, color, max,
} from 'three/tsl';
import { heightAt, INNER_HALF, WORLD_HALF, WATER_Y } from './Layout.js';
import { LAYERS } from '../core/Layers.js';
import { makeGroundNoiseTexture, makeLaneTexture, makeWaterTexture } from '../util/textures.js';

const INNER_STEP = 1;
const TILE = 112; // meters per culling tile of the inner mesh

// Heights on the inner grid with a 1-cell border (so normals can use central differences).
// Also uploaded as a texture so the GPU (grass, flowers) can place things on the ground.
export function bakeHeights() {
  const n = Math.round((INNER_HALF * 2) / INNER_STEP) + 1;
  const m = n + 2;
  const H = new Float32Array(m * m);
  for (let j = 0; j < m; j++) {
    const z = (j - 1) * INNER_STEP - INNER_HALF;
    for (let i = 0; i < m; i++) H[j * m + i] = heightAt((i - 1) * INNER_STEP - INNER_HALF, z);
  }
  return { n, m, H };
}

function buildInnerGeometry({ n, m, H }) {
  const count = n * n;
  const skirt = 4 * (n - 1);
  const pos = new Float32Array((count + skirt + 4) * 3);
  const nor = new Float32Array((count + skirt + 4) * 3);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i, h = (j + 1) * m + (i + 1);
      pos[k * 3] = i * INNER_STEP - INNER_HALF;
      pos[k * 3 + 1] = H[h];
      pos[k * 3 + 2] = j * INNER_STEP - INNER_HALF;
      const nx = H[h - 1] - H[h + 1], nz = H[h - m] - H[h + m], ny = 2 * INNER_STEP;
      const l = Math.hypot(nx, ny, nz);
      nor[k * 3] = nx / l; nor[k * 3 + 1] = ny / l; nor[k * 3 + 2] = nz / l;
    }
  }
  // Skirt: walk the boundary and drop a curtain of vertices 3 m below each edge vertex.
  const ring = [];
  for (let i = 0; i < n - 1; i++) ring.push(i);
  for (let j = 0; j < n - 1; j++) ring.push(j * n + n - 1);
  for (let i = n - 1; i > 0; i--) ring.push((n - 1) * n + i);
  for (let j = n - 1; j > 0; j--) ring.push(j * n);
  let v = count;
  const skirtStart = v;
  for (const k of ring) {
    pos[v * 3] = pos[k * 3]; pos[v * 3 + 1] = pos[k * 3 + 1] - 3; pos[v * 3 + 2] = pos[k * 3 + 2];
    nor[v * 3] = nor[k * 3]; nor[v * 3 + 1] = nor[k * 3 + 1]; nor[v * 3 + 2] = nor[k * 3 + 2];
    v++;
  }
  const skirtIdx = [];
  for (let r = 0; r < ring.length; r++) {
    const a = ring[r], b = ring[(r + 1) % ring.length];
    const sa = skirtStart + r, sb = skirtStart + ((r + 1) % ring.length);
    skirtIdx.push(a, b, sa, b, sb, sa, a, sa, b, b, sa, sb); // both windings; skirt is seen from outside
  }
  // Tiles share the vertex buffers, each with its own index and bounds so views cull them.
  const position = new THREE.BufferAttribute(pos.subarray(0, v * 3), 3);
  const normal = new THREE.BufferAttribute(nor.subarray(0, v * 3), 3);
  const make = (idx) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', position);
    g.setAttribute('normal', normal);
    g.setIndex(idx);
    let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const k of idx) {
      const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    g.boundingBox = new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ));
    g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
    return g;
  };
  const tiles = [];
  const T = TILE / INNER_STEP;
  for (let j0 = 0; j0 < n - 1; j0 += T)
    for (let i0 = 0; i0 < n - 1; i0 += T) {
      const idx = [];
      for (let j = j0; j < Math.min(j0 + T, n - 1); j++)
        for (let i = i0; i < Math.min(i0 + T, n - 1); i++) {
          const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
          idx.push(a, c, b, b, c, d);
        }
      tiles.push(make(idx));
    }
  tiles.push(make(skirtIdx));
  return tiles;
}

function buildOuterGeometry() {
  // Grid lines: dense near the inner boundary, stretching geometrically toward the horizon.
  const side = [];
  for (let x = INNER_HALF, s = 4; x < WORLD_HALF; x += s, s *= 1.04) side.push(x);
  side.push(WORLD_HALF);
  const interior = [];
  for (let x = -INNER_HALF + 8; x < INNER_HALF - 1; x += 8) interior.push(x);
  const lines = [...side.map((x) => -x).reverse(), ...interior, ...side];
  const n = lines.length;
  const pos = new Float32Array(n * n * 3);
  const nor = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const x = lines[i], z = lines[j], k = j * n + i;
      const e = 2;
      const h = heightAt(x, z);
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      const nx = heightAt(x - e, z) - heightAt(x + e, z), nz = heightAt(x, z - e) - heightAt(x, z + e);
      const l = Math.hypot(nx, 2 * e, nz);
      nor[k * 3] = nx / l; nor[k * 3 + 1] = (2 * e) / l; nor[k * 3 + 2] = nz / l;
    }
  const idx = [];
  for (let j = 0; j < n - 1; j++)
    for (let i = 0; i < n - 1; i++) {
      // Skip cells covered by the inner mesh.
      const cx = (lines[i] + lines[i + 1]) / 2, cz = (lines[j] + lines[j + 1]) / 2;
      if (Math.abs(cx) < INNER_HALF && Math.abs(cz) < INNER_HALF) continue;
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export function makeTerrainMaterial(groundNoise, laneTex, waterTex, lampLight) {
  // Lambert: no specular sheen at grazing angles (the grass layer provides the real surface).
  const mat = new THREE.MeshLambertNodeMaterial();
  const wp = positionWorld.xz;

  const lush = color(0x3f7a1a), bright = color(0x6c9e2a), deep = color(0x2a5212);
  const dry = color(0x8c9343), soil = color(0x5e4a33), gravel = color(0x9c8664);
  const gravelDark = color(0x6e5a40), mud = color(0x4a4030);

  const shading = Fn(() => {
    const n1 = texture(groundNoise, wp.div(210));
    const n2 = texture(groundNoise, wp.div(41));
    const n3 = texture(groundNoise, wp.div(7.3));
    const n4 = texture(groundNoise, wp.div(1.3));

    // Grass: large patches of lush vs. bright, darker hollows, sun-dried crests.
    const g = mix(lush, bright, smoothstep(0.35, 0.7, n1.r.mul(0.6).add(n2.g.mul(0.4)))).toVar();
    g.assign(mix(g, deep, smoothstep(0.55, 0.8, n2.b).mul(0.45)));
    g.assign(mix(g, dry, smoothstep(0.6, 0.85, n1.g.mul(0.5).add(n3.b.mul(0.5))).mul(0.35)));
    g.mulAssign(n4.a.mul(0.3).add(0.85).mul(n3.a.mul(0.2).add(0.9)));
    // Near the viewer the ground is seen between blades, so it's the shaded root layer.
    const dist = positionWorld.sub(cameraPosition).length();
    g.mulAssign(mix(float(0.55), float(1), smoothstep(8, 60, dist)));
    const slope = float(1).sub(normalWorld.y);
    g.assign(mix(g, g.mul(0.72), smoothstep(0.35, 0.7, slope)));

    // Gravel lanes with frayed, grassy edges.
    const inInner = step(abs(wp.x), 279).mul(step(abs(wp.y), 279));
    const lt = texture(laneTex, wp.add(280).div(560));
    const fray = n3.a.sub(0.5).mul(0.35).add(n4.b.sub(0.5).mul(0.25));
    const lane = smoothstep(0.42, 0.62, lt.r.add(fray)).mul(inInner);
    const edge = smoothstep(0.2, 0.45, lt.r.add(fray)).mul(inInner).sub(lane).max(0);
    const pebble = texture(groundNoise, wp.div(0.31)).a;
    const grav = mix(gravelDark, gravel, n4.r.mul(0.5).add(n3.g.mul(0.2)).add(pebble.mul(0.5)).sub(0.1).saturate());
    const col = mix(g, soil.mul(1.1), edge.mul(0.25)).toVar();
    col.assign(mix(col, grav, lane));

    // Garden beds: dark, dug soil (vegetable rows are barer than flower beds).
    const bedA = lt.a.mul(inInner);
    const veg = smoothstep(0.3, 0.45, bedA).mul(float(1).sub(smoothstep(0.62, 0.8, bedA)));
    const flowerBed = smoothstep(0.7, 0.9, bedA);
    const dug = color(0x3e2f22).mul(n4.r.mul(0.4).add(0.8));
    col.assign(mix(col, dug, max(veg, flowerBed.mul(0.75))));

    // Stream bed and the lake shore.
    const bed = smoothstep(0.35, 0.8, lt.g).mul(inInner);
    col.assign(mix(col, mud, bed));
    const wd = texture(waterTex, wp.add(280).div(560)).r.sub(0.5).mul(60);
    const shore = float(1).sub(smoothstep(-0.5, 1.2, wd)).mul(inInner).mul(float(1).sub(smoothstep(WATER_Y + 0.2, WATER_Y + 0.9, positionWorld.y)));
    col.assign(mix(col, mud, shore.mul(0.85)));
    return col;
  })();

  const dbg = new URLSearchParams(location.search).get('dbg');
  if (dbg === 'lane') mat.colorNode = texture(laneTex, wp.add(280).div(560)).rgb;
  else if (dbg === 'noise') mat.colorNode = texture(groundNoise, wp.div(41)).rgb;
  else if (dbg === 'normal') mat.colorNode = normalWorld.mul(0.5).add(0.5);
  else mat.colorNode = shading;
  if (lampLight) mat.emissiveNode = lampLight.emission(shading, positionWorld);
  return mat;
}

export class Terrain {
  constructor(lampLight) {
    this.groundNoise = makeGroundNoiseTexture();
    this.laneTex = makeLaneTexture();
    this.waterTex = makeWaterTexture();
    this.material = makeTerrainMaterial(this.groundNoise, this.laneTex, this.waterTex, lampLight);
    this.group = new THREE.Group();
    this.heights = bakeHeights();
    this.heightTex = new THREE.DataTexture(this.heights.H, this.heights.m, this.heights.m, THREE.RedFormat, THREE.FloatType);
    this.heightTex.magFilter = this.heightTex.minFilter = THREE.NearestFilter;
    this.heightTex.needsUpdate = true;
    this.inner = buildInnerGeometry(this.heights).map((g) => {
      const m = new THREE.Mesh(g, this.material);
      m.layers.set(LAYERS.TERRAIN);
      return m;
    });
    // A 2 m proxy casts the terrain's shadows, sunk a little so it never shadows the real surface.
    const H = this.heights, step = 2;
    const pn = Math.floor((H.n - 1) / step) + 1;
    const pg = new THREE.PlaneGeometry(INNER_HALF * 2, INNER_HALF * 2, pn - 1, pn - 1);
    pg.rotateX(-Math.PI / 2);
    const pp = pg.attributes.position;
    for (let k = 0; k < pp.count; k++) {
      const i = Math.round((pp.getX(k) + INNER_HALF) / INNER_STEP), j = Math.round((pp.getZ(k) + INNER_HALF) / INNER_STEP);
      pp.setY(k, H.H[(j + 1) * H.m + (i + 1)] - 0.35);
    }
    pg.computeBoundingSphere();
    this.shadowProxy = new THREE.Mesh(pg, new THREE.MeshBasicNodeMaterial());
    this.shadowProxy.layers.set(LAYERS.SHADOW_ONLY);
    this.shadowProxy.castShadow = true;
    this.outer = new THREE.Mesh(buildOuterGeometry(), this.material);
    for (const m of [...this.inner, this.outer]) {
      m.receiveShadow = true;
      m.castShadow = false;
      this.group.add(m);
    }
    this.group.add(this.shadowProxy);
  }
}
