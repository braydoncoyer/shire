// Tree placement and rendering. A few variants of each species are generated once, then drawn
// as instanced meshes: the Party Tree and the oak above Bag End, willows around the lake and the
// stream, oak clumps on the knolls, and lines of Lombardy poplars as farm shelterbelts.

import * as THREE from 'three/webgpu';
import {
  Fn, uniform, texture, uv, vec3, vec4, float, instanceIndex, hash, sin, mix, pow, max, positionLocal,
  positionWorld, cameraPosition, normalize, dot, saturate, smoothstep, normalViewGeometry, color, uint, fwidth,
  attribute, select,
  length,
} from 'three/tsl';
import { buildTree, leafTexture, SPECIES } from './TreeGen.js';
import {
  heightAt, laneMask, streamMask, lakeFactor, lakeDist, pondDist, yardAt, LANDMARKS, STREAMS, WALK_RADIUS, MILL, BRIDGE,
  GREEN_DRAGON, HOLES, GEO, VILLAGE,
} from './Layout.js';
import { mulberry32, fbm2 } from '../util/noise.js';
import { LAYERS } from '../core/Layers.js';

const VARIANTS = { oak: 4, poplar: 2, willow: 3, pine: 1, partyPine: 1, bagEndOak: 1 };
// Distances (m, per unit of tree scale) beyond which trees switch to the next level of detail.
const LOD_DIST = [90, 300];
const TREE_SEED = attribute('treeSeed', 'float');

/** Places that must stay clear of trees: lanes, water, gardens, buildings, the Party Field. */
function blocked(x, z, pad = 0) {
  if (Math.abs(x) < 279 && Math.abs(z) < 279) {
    for (const [ox, oz] of [[0, 0], [pad, 0], [-pad, 0], [0, pad], [0, -pad]]) {
      if (laneMask(x + ox, z + oz) > 0.01) return true;
      if (streamMask(x + ox, z + oz) > 0.05) return true;
      if (yardAt(x + ox, z + oz) > 0) return true;
    }
  }
  if (lakeFactor(x, z) > 0 || lakeDist(x, z) < 2 || pondDist(x, z) < 2) return true;
  const pf = LANDMARKS.partyField;
  if (Math.hypot((x - pf.x) / pf.rx, (z - pf.z) / pf.rz) < 1.1) return true;
  if (HOLES.some((h) => Math.hypot(x - h.x, z - h.z) < 9)) return true;
  if (Math.hypot(x - GREEN_DRAGON.x, z - GREEN_DRAGON.z) < 38) return true;
  if (Math.hypot(x - MILL.x, z - MILL.z) < 12) return true;
  if (Math.hypot(x - BRIDGE.x, z - BRIDGE.z) < 30) return true;
  if (Math.hypot(x - LANDMARKS.spawn.x, z - LANDMARKS.spawn.z) < 10) return true;
  if (Math.hypot(x - LANDMARKS.partyTree.x, z - LANDMARKS.partyTree.z) < 30) return true;
  return false;
}

function inPoly(x, z, poly) {
  let inside = false;
  for (let k = 0, m = poly.length - 1; k < poly.length; m = k++) {
    const [ax, az] = poly[m], [bx, bz] = poly[k];
    if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}

export function planTrees() {
  const rand = mulberry32(4242);
  const trees = [];
  const add = (species, x, z, scale, variant = Math.floor(rand() * VARIANTS[species])) =>
    trees.push({ species, variant, x, z, scale, rot: rand() * Math.PI * 2 });
  const clear = (x, z, r) => !trees.some((t) => Math.hypot(t.x - x, t.z - z) < r);

  // Landmarks: the Party Tree (a pine) and the oak above Bag End.
  const pt = LANDMARKS.partyTree, bo = LANDMARKS.bagEndOak;
  add('partyPine', pt.x, pt.z, 1.3, 0);
  add('bagEndOak', bo.x, bo.z, 1.25, 0);
  // The rounded hill beyond Bag End: a lone tree on its crown, pines along its left shoulder.
  const bh = LANDMARKS.backHill;
  add('pine', bh.x, bh.z, 1.25, 0);
  for (const [dx, dz, sc] of bh.pines) add('pine', bh.x + dx, bh.z + dz, sc, 0);

  // Every other tree mapped individually.
  for (const t of GEO.trees) {
    if (t.kind !== 'tree' || t.name) continue;
    const [x, z] = t.p;
    if (!blocked(x, z, 1) && clear(x, z, 6)) add('oak', x, z, 0.85 + rand() * 0.3);
  }

  // Willows around the lake shore, a few meters back from the water.
  const lake = GEO.water.find((w) => w.name === 'Bywater Pool').poly;
  let acc = 0;
  for (let k = 0; k < lake.length - 1; k++) {
    const [ax, az] = lake[k], [bx, bz] = lake[k + 1];
    const seg = Math.hypot(bx - ax, bz - az);
    acc += seg;
    if (acc < 17) continue;
    acc = rand() * 6;
    const nx = (bz - az) / seg, nz = -(bx - ax) / seg; // outward if the ring is clockwise
    for (const s of [1, -1]) {
      const x = ax + nx * s * (3.5 + rand() * 3), z = az + nz * s * (3.5 + rand() * 3);
      if (lakeDist(x, z) < 1.5 || lakeDist(x, z) > 9) continue;
      if (!blocked(x, z, 1.5) && clear(x, z, 14) && rand() < 0.5) add('willow', x, z, 0.9 + rand() * 0.35);
      break;
    }
  }

  // Willows along the streams.
  for (const st of STREAMS)
    for (let i = 1; i < st.pts.length - 1; i++) {
      const [x0, z0] = st.pts[i], [x1, z1] = st.pts[i + 1];
      const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1;
      const side = rand() < 0.5 ? -1 : 1;
      const x = x0 - (dz / l) * side * (5 + rand() * 3), z = z0 + (dx / l) * side * (5 + rand() * 3);
      if (!blocked(x, z, 1.5) && clear(x, z, 10) && rand() < 0.6) add('willow', x, z, 0.8 + rand() * 0.25);
    }

  // The mapped woods, filled.
  for (const poly of GEO.woods) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of poly) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    for (let z = minZ; z < maxZ; z += 11)
      for (let x = minX; x < maxX; x += 11) {
        const px = x + (rand() - 0.5) * 8, pz = z + (rand() - 0.5) * 8;
        if (inPoly(px, pz, poly) && !blocked(px, pz, 2) && clear(px, pz, 7)) add('oak', px, pz, 0.8 + rand() * 0.45);
      }
  }

  // The apple orchard beside its lane: small, rounded trees in loose rows.
  const orchard = GEO.paths.find((p) => p.name === 'Apple Orchard' && p.kind === 'footway');
  if (orchard) {
    const [ox, oz] = orchard.pts[Math.floor(orchard.pts.length / 2)];
    for (let k = 0; k < 16; k++) {
      const x = ox + (rand() - 0.5) * 30, z = oz + (rand() - 0.5) * 24;
      if (!blocked(x, z, 1.5) && clear(x, z, 5)) add('oak', x, z, 0.36 + rand() * 0.08, 3);
    }
  }

  // A few specimen trees through the village (the set is mostly open lawn): single oaks and fruit
  // trees on the banks, and old pines along the skyline behind the Hill.
  for (let k = 0, placed = 0; k < 4000 && placed < 12; k++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * VILLAGE.r;
    const x = VILLAGE.x + Math.cos(a) * r, z = VILLAGE.z + Math.sin(a) * r;
    if (blocked(x, z, 3) || !clear(x, z, 28)) continue;
    add('oak', x, z, 0.55 + rand() * 0.4, rand() < 0.35 ? 3 : undefined);
    placed++;
  }

  // Scattered oaks and clumps on the surrounding farmland, thinning toward the horizon; the village
  // itself (within ~150 m of the lanes' center) stays open pasture as on the set.
  let tries = 0;
  // Mostly lone trees standing in the paddocks, with the occasional small clump.
  const start = trees.length;
  while (trees.length < start + 150 && tries++ < 30000) {
    const r = 170 + Math.pow(rand(), 1.1) * 1200;
    const a = rand() * Math.PI * 2;
    const x = Math.cos(a) * r - 10, z = Math.sin(a) * r - 40;
    const clump = fbm2(x / 160 + 5, z / 160 - 3, 3);
    const single = rand() < 0.35;
    if (!single && clump < 0.3 + rand() * 0.2) continue;
    if (blocked(x, z, 5) || !clear(x, z, single ? 40 : 11)) continue;
    if (rand() < 0.15) add('pine', x, z, 0.8 + rand() * 0.4, 0);
    else add('oak', x, z, 0.85 + rand() * 0.5);
  }

  // Farm shelterbelts of poplars, well away from the set.
  for (let b = 0; b < 4; b++) {
    const r = 400 + rand() * 500, a = rand() * Math.PI * 2;
    const x0 = Math.cos(a) * r, z0 = Math.sin(a) * r;
    const dir = a + Math.PI / 2 + (rand() - 0.5) * 0.8;
    const n = 10 + Math.floor(rand() * 18);
    for (let k = 0; k < n; k++) {
      const x = x0 + Math.cos(dir) * k * 5.5 + (rand() - 0.5), z = z0 + Math.sin(dir) * k * 5.5 + (rand() - 0.5);
      if (!blocked(x, z, 3)) add('poplar', x, z, 0.85 + rand() * 0.3);
    }
  }
  return trees;
}

export class Vegetation {
  constructor(sky, noiseTex, lampLight) {
    this.lampLight = lampLight;
    this.lodScale = 1; // quality setting: scales the detail-level distances
    this.u = {
      time: uniform(0),
      windDir: uniform(new THREE.Vector3(0.7, 0, -0.7)),
      windStrength: uniform(0.5),
    };
    this.sky = sky;
    this.noiseTex = noiseTex;
    this.group = new THREE.Group();
    this.colliders = [];
    this.trees = planTrees();

    // Each tree variant is drawn once per level of detail. Trees move between the levels' instance
    // lists as the camera walks, so the detailed list only ever holds the trees nearby, and each
    // list's bounds let the views cull it. (Spatial chunks would cull finer, but every instanced
    // mesh costs Three.js a separate shader build per pass, which stalls the first time each one
    // comes into view.) A stable per-tree seed attribute, not the instance index (which changes
    // with the lists), drives each tree's tint and sway phase.
    this.sets = [];
    const seedOf = (i) => (i * 0.6180339887) % 1;
    this.trees.forEach((t, i) => (t.seed = seedOf(i)));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (const [species, count] of Object.entries(VARIANTS)) {
      for (let v = 0; v < count; v++) {
        const list = this.trees.filter((t) => t.species === species && t.variant === v);
        if (!list.length) continue;
        const model = buildTree(species, 1000 + v * 37 + species.length * 101);
        const woodMat = this._woodMaterial(), leafMat = this._leafMaterial(species);
        for (const t of list) {
          if (Math.hypot(t.x, t.z) < WALK_RADIUS + 10) this.colliders.push({ x: t.x, z: t.z, r: model.trunkRadius * t.scale + 0.15 });
          p.set(t.x, heightAt(t.x, t.z), t.z);
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot);
          s.setScalar(t.scale);
          t.matrix = m.compose(p, q, s).toArray(new Float32Array(16));
        }
        const set = { trees: list, lod: new Int8Array(list.length).fill(-1), meshes: [] };
        model.lods.forEach((lod, level) => {
          const pair = [[lod.wood, woodMat], [lod.leaves, leafMat]].map(([src, mat]) => {
            // The geometry's buffers are shared; only the per-tree seed is per mesh.
            const g = new THREE.BufferGeometry();
            for (const k of ['position', 'normal', 'uv']) g.setAttribute(k, src.getAttribute(k));
            g.setIndex(src.index);
            g.setAttribute('treeSeed', new THREE.InstancedBufferAttribute(new Float32Array(list.length), 1));
            g.boundingSphere = (src.boundingSphere || (src.computeBoundingSphere(), src.boundingSphere)).clone();
            const mesh = new THREE.InstancedMesh(g, mat, list.length);
            // Storage-buffer matrices upload only when they change; small counts would otherwise go
            // through a uniform buffer that Three.js re-uploads on every render pass.
            mesh.instanceMatrix = new THREE.StorageInstancedBufferAttribute(new Float32Array(list.length * 16), 16);
            list.forEach((t, i) => mesh.instanceMatrix.array.set(t.matrix, i * 16));
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.count = 0;
            mesh.visible = false;
            // The farthest trees (a few pixels in the lake, and past the shadow cascades) stay out of
            // the reflection and the shadow maps.
            if (level === model.lods.length - 1) mesh.layers.set(LAYERS.NO_REFLECT);
            this.group.add(mesh);
            return mesh;
          });
          set.meshes.push(pair);
        });
        this.sets.push(set);
      }
    }
  }

  /** Show every tree at every detail level (for warming up the renderer), or go back to normal. */
  showAll(on) {
    for (const c of this.sets) {
      for (const pair of c.meshes)
        for (const mesh of pair) {
          mesh.count = on ? c.trees.length : 0;
          mesh.visible = on;
          if (on) mesh.computeBoundingSphere();
        }
      c.lod.fill(-1); // rebuild the detail lists on the next update
    }
  }

  /** Move trees between detail levels by distance, with some hysteresis. */
  _updateLods(camera) {
    const cx = camera.position.x, cz = camera.position.z;
    for (const c of this.sets) {
      let changed = false;
      c.trees.forEach((t, i) => {
        const d = Math.hypot(t.x - cx, t.z - cz) / Math.max(t.scale, 0.6);
        const cur = c.lod[i];
        let want = 0;
        for (let k = 0; k < LOD_DIST.length; k++) if (d > LOD_DIST[k] * this.lodScale * (cur > k ? 0.93 : cur < 0 ? 1 : 1.07)) want = k + 1;
        if (want !== cur) {
          c.lod[i] = want;
          changed = true;
        }
      });
      if (!changed) continue;
      c.meshes.forEach((pair, k) => {
        for (const mesh of pair) {
          const mats = mesh.instanceMatrix.array, seeds = mesh.geometry.getAttribute('treeSeed');
          let n = 0;
          c.trees.forEach((t, i) => {
            if (c.lod[i] !== k) return;
            mats.set(t.matrix, n * 16);
            seeds.array[n] = t.seed;
            n++;
          });
          mesh.count = n;
          mesh.visible = n > 0;
          mesh.instanceMatrix.needsUpdate = true;
          seeds.needsUpdate = true;
          if (n) mesh.computeBoundingSphere();
        }
      });
    }
  }

  /**
   * Wind, shared by wood and leaves so leaves stay on their branches. The trunk barely leans; the
   * motion lives in the outer crown, where each part of it moves on its own phase (so the tree
   * never slides as one rigid piece), and nothing near the ground moves at all.
   */
  _sway(extra, seed) {
    const u = this.u;
    return Fn(() => {
      const p = positionLocal;
      const ph = (seed ? hash(seed.mul(977).add(7)) : hash(instanceIndex.add(uint(7)))).mul(6.283);
      const h = max(p.y, 0);
      const r = length(p.xz);
      const t = u.time;
      const lean = h.mul(0.05).pow(2).mul(u.windStrength).mul(sin(t.mul(0.55).add(ph)).mul(0.3).add(0.7)).mul(0.05);
      const outer = smoothstep(1.2, 8, r).mul(smoothstep(0.8, 3.5, h));
      const wave = sin(t.mul(1.5).add(ph).add(p.x.mul(0.35)).add(p.z.mul(0.27)).add(h.mul(0.2))).mul(0.6)
        .add(sin(t.mul(2.7).add(ph.mul(1.7)).add(p.x.mul(0.8)).sub(p.z.mul(0.5))).mul(0.3));
      const branch = outer.mul(wave.add(0.35)).mul(u.windStrength.add(0.08)).mul(0.14);
      const out = p.add(u.windDir.mul(lean.add(branch))).add(vec3(0, branch.mul(0.3), 0)).toVar();
      if (extra) out.addAssign(extra(p).mul(smoothstep(0.15, 0.8, h)));
      return out;
    })();
  }

  _woodMaterial() {
    const m = new THREE.MeshLambertNodeMaterial();
    const n = texture(this.noiseTex, uv().mul(vec3(1, 3, 0).xy));
    m.colorNode = mix(color(0x2e2a25), color(0x5b5750), n.b.mul(0.7).add(n.a.mul(0.5)).sub(0.2).saturate());
    m.positionNode = this._sway(null, TREE_SEED);
    return m;
  }

  _leafMaterial(species) {
    return this.leafMaterial(SPECIES[species].leaves.texture, SPECIES[species].color, false, TREE_SEED);
  }

  /**
   * Alpha-tested leaf-card material with sway, radial crown shading and backlight. Each plant's
   * random tint and sway phase come from `seed` (a per-instance float node), or its instance index.
   */
  leafMaterial(texKind, tintHex, useVertexColor = false, seed = null) {
    const u = this.u, sunU = this.sky.u;
    const tex = leafTexture(texKind);
    const m = new THREE.MeshLambertNodeMaterial({ side: THREE.DoubleSide, alphaTest: 0.5 });
    m.alphaToCoverage = true;
    const t = texture(tex, uv());
    const tint = color(tintHex);
    const vary = seed ? hash(seed.mul(977).add(3)) : hash(instanceIndex.add(uint(3)));
    // Sharpen alpha by its screen-space rate of change so mipmapped cutouts keep their coverage
    // with distance instead of thinning out to bare twigs (used with alpha-to-coverage).
    const a = saturate(t.a.sub(0.45).div(max(fwidth(t.a), 1e-4)).add(0.5));
    // With vertex colors, white cards take the leaf tint and colored cards (blossoms) their own.
    const vc = attribute('color', 'vec3');
    const tintV = useVertexColor ? select(vc.r.add(vc.g).add(vc.b).greaterThan(2.99), tint, vc.mul(1.6)) : tint;
    m.colorNode = vec4(t.rgb.mul(tintV).mul(vary.mul(0.35).add(0.8)).mul(mix(vec3(1), vec3(1.1, 1.05, 0.8), vary.mul(0.6))), a);
    // Radial crown normals, not flipped on back faces, so the crown shades as one mass.
    m.normalNode = normalViewGeometry;
    m.positionNode = this._sway((p) => {
      const f = sin(u.time.mul(5.5).add(p.x.mul(3.1)).add(p.z.mul(2.3)).add(p.y)).mul(0.025).mul(u.windStrength.add(0.15));
      return vec3(f, f.mul(0.5), f.negate());
    }, seed);
    // Sunlight glowing through the leaves when looking toward the sun.
    m.emissiveNode = Fn(() => {
      const v = normalize(positionWorld.sub(cameraPosition));
      const back = pow(saturate(dot(v, sunU.sunDir)), 4).mul(0.06).mul(float(1).sub(smoothstep(0.4, 0.95, sunU.sunDir.y)));
      const sun = t.rgb.mul(tint).mul(sunU.sunColor).mul(back);
      return this.lampLight ? sun.add(this.lampLight.emission(t.rgb.mul(tint), positionWorld)) : sun;
    })();
    return m;
  }

  update(dt, settings, camera) {
    const u = this.u;
    u.time.value += dt;
    this._updateLods(camera);
    const wr = (settings.windDir * Math.PI) / 180;
    u.windDir.value.set(Math.sin(wr), 0, -Math.cos(wr));
    u.windStrength.value = Math.min(1.5, settings.windSpeed / 8);
  }
}
