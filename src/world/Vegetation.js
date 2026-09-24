// Tree placement and rendering. A few variants of each species are generated once, then drawn
// as instanced meshes: the Party Tree and the oak above Bag End, willows around the lake and the
// stream, oak clumps on the knolls, and lines of Lombardy poplars as farm shelterbelts.

import * as THREE from 'three/webgpu';
import {
  Fn, uniform, texture, uv, vec3, vec4, float, instanceIndex, hash, sin, mix, pow, max, positionLocal,
  positionWorld, cameraPosition, normalize, dot, saturate, smoothstep, normalViewGeometry, color, uint, fwidth,
} from 'three/tsl';
import { buildTree, leafTexture, SPECIES } from './TreeGen.js';
import {
  heightAt, laneMask, streamMask, lakeFactor, LANDMARKS, STREAM, WALK_RADIUS,
} from './Layout.js';
import { mulberry32, fbm2 } from '../util/noise.js';

const VARIANTS = { oak: 4, poplar: 2, willow: 3 };

function ellipseDist(x, z, e) {
  const c = Math.cos(e.rot || 0), s = Math.sin(e.rot || 0);
  const dx = x - e.x, dz = z - e.z;
  const u = (dx * c - dz * s) / e.rx, v = (dx * s + dz * c) / e.rz;
  return Math.hypot(u, v);
}

/** Places that must stay clear of trees: lanes, water, the set's open ground. */
function blocked(x, z, pad = 0) {
  if (Math.abs(x) < 279 && Math.abs(z) < 279) {
    for (const [ox, oz] of [[0, 0], [pad, 0], [-pad, 0], [0, pad], [0, -pad]]) {
      if (laneMask(x + ox, z + oz) > 0.01) return true;
      if (streamMask(x + ox, z + oz) > 0.05) return true;
    }
  }
  if (ellipseDist(x, z, LANDMARKS.lake) < 1.12) return true;
  if (ellipseDist(x, z, LANDMARKS.partyField) < 1.25) return true;
  // The south face of the Hill and the shoulder east of it are for hobbit holes (M3).
  if (x > -120 && x < 70 && z > -95 && z < 5) return true;
  if (Math.hypot(x - LANDMARKS.spawn.x, z - LANDMARKS.spawn.z) < 14) return true;
  const gd = LANDMARKS.greenDragon, mill = LANDMARKS.mill;
  if (Math.hypot(x - gd.x, z - gd.z) < 32) return true;
  if (Math.hypot(x - mill.x, z - mill.z) < 22) return true;
  return false;
}

export function planTrees() {
  const rand = mulberry32(4242);
  const trees = [];
  const add = (species, x, z, scale, variant = Math.floor(rand() * VARIANTS[species])) =>
    trees.push({ species, variant, x, z, scale, rot: rand() * Math.PI * 2 });

  // Landmarks.
  const pt = LANDMARKS.partyTree, bo = LANDMARKS.bagEndOak;
  add('oak', pt.x, pt.z, 1.75, 0);
  add('oak', bo.x, bo.z, 1.35, 1);

  // Willows leaning over the lake shore, leaving the bridge side open.
  const L = LANDMARKS.lake;
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + rand() * 0.4;
    const r = 1.1 + rand() * 0.08;
    const lx = Math.cos(a) * r * L.rx, lz = Math.sin(a) * r * L.rz;
    const c = Math.cos(-L.rot), s = Math.sin(-L.rot);
    const x = L.x + lx * c - lz * s, z = L.z + lx * s + lz * c;
    if (laneMask(x, z) > 0.01 || Math.hypot(x - pt.x, z - pt.z) < 16) continue;
    if (Math.hypot(x - LANDMARKS.spawn.x, z - LANDMARKS.spawn.z) < 14) continue;
    if (Math.hypot(x - LANDMARKS.bridge.x, z - LANDMARKS.bridge.z) < 18) continue;
    add('willow', x, z, 1.05 + rand() * 0.3);
  }

  // Willows along the stream, set back from the water.
  const sp = STREAM.smooth;
  for (let i = 3; i < sp.length - 3; i += 5) {
    const [x0, z0] = sp[i], [x1, z1] = sp[i + 1];
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz);
    const side = rand() < 0.5 ? -1 : 1;
    const x = x0 + (-dz / l) * side * (6 + rand() * 4), z = z0 + (dx / l) * side * (6 + rand() * 4);
    if (!blocked(x, z, 2) || streamMask(x, z) < 0.05) add('willow', x, z, 0.75 + rand() * 0.25);
  }

  // Oak clumps on the knolls: clustered by a noise field, thinning toward the horizon.
  let tries = 0;
  while (trees.length < 330 && tries++ < 20000) {
    const r = 70 + Math.pow(rand(), 1.4) * 1100;
    const a = rand() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const clump = fbm2(x / 160 + 5, z / 160 - 3, 3);
    if (clump < 0.12 + rand() * 0.25) continue;
    if (blocked(x, z, 5)) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 9)) continue;
    add('oak', x, z, 0.8 + rand() * 0.45);
  }

  // Shelterbelts: straight lines of poplars along field boundaries.
  for (let b = 0; b < 9; b++) {
    const r = 200 + rand() * 600, a = rand() * Math.PI * 2;
    const x0 = Math.cos(a) * r, z0 = Math.sin(a) * r;
    const dir = a + Math.PI / 2 + (rand() - 0.5) * 0.8;
    const n = 10 + Math.floor(rand() * 18);
    for (let k = 0; k < n; k++) {
      const x = x0 + Math.cos(dir) * k * 5.5 + (rand() - 0.5), z = z0 + Math.sin(dir) * k * 5.5 + (rand() - 0.5);
      if (blocked(x, z, 3)) continue;
      add('poplar', x, z, 0.85 + rand() * 0.3);
    }
  }
  return trees;
}

export class Vegetation {
  constructor(sky, noiseTex) {
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

    for (const [species, count] of Object.entries(VARIANTS)) {
      for (let v = 0; v < count; v++) {
        const list = this.trees.filter((t) => t.species === species && t.variant === v);
        if (!list.length) continue;
        const model = buildTree(species, 1000 + v * 37 + species.length * 101);
        const wood = new THREE.InstancedMesh(model.wood, this._woodMaterial(), list.length);
        const leaves = new THREE.InstancedMesh(model.leaves, this._leafMaterial(species), list.length);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
        list.forEach((t, i) => {
          p.set(t.x, heightAt(t.x, t.z), t.z);
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot);
          s.setScalar(t.scale);
          m.compose(p, q, s);
          wood.setMatrixAt(i, m);
          leaves.setMatrixAt(i, m);
          if (Math.hypot(t.x, t.z) < WALK_RADIUS + 10) this.colliders.push({ x: t.x, z: t.z, r: model.trunkRadius * t.scale + 0.15 });
        });
        for (const mesh of [wood, leaves]) {
          // Storage-buffer matrices upload once; small counts would otherwise go through a uniform
          // buffer that Three.js re-uploads on every render pass.
          mesh.instanceMatrix = new THREE.StorageInstancedBufferAttribute(mesh.instanceMatrix.array, 16);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.computeBoundingSphere();
          this.group.add(mesh);
        }
      }
    }
  }

  /** Sway shared by wood and leaves, so leaves stay on their branches. */
  _sway(extra) {
    const u = this.u;
    return Fn(() => {
      const p = positionLocal;
      const ph = hash(instanceIndex.add(uint(7))).mul(6.283);
      const h = max(p.y, 0);
      const gust = sin(u.time.mul(0.8).add(ph)).mul(0.5).add(sin(u.time.mul(1.9).add(ph.mul(2))).mul(0.2)).add(0.6);
      const bend = pow(h.mul(0.08), 1.6).mul(u.windStrength).mul(gust).mul(0.35);
      const out = p.add(u.windDir.mul(bend)).toVar();
      if (extra) out.addAssign(extra(p));
      return out;
    })();
  }

  _woodMaterial() {
    const m = new THREE.MeshLambertNodeMaterial();
    const n = texture(this.noiseTex, uv().mul(vec3(1, 3, 0).xy));
    m.colorNode = mix(color(0x2e2a25), color(0x5b5750), n.b.mul(0.7).add(n.a.mul(0.5)).sub(0.2).saturate());
    m.positionNode = this._sway();
    return m;
  }

  _leafMaterial(species) {
    const u = this.u, sunU = this.sky.u;
    const tex = leafTexture(SPECIES[species].leaves.texture);
    const m = new THREE.MeshLambertNodeMaterial({ side: THREE.DoubleSide, alphaTest: 0.5 });
    m.alphaToCoverage = true;
    const t = texture(tex, uv());
    const tint = color(SPECIES[species].color);
    const vary = hash(instanceIndex.add(uint(3)));
    // Sharpen alpha by its screen-space rate of change so mipmapped cutouts keep their coverage
    // with distance instead of thinning out to bare twigs (used with alpha-to-coverage).
    const a = saturate(t.a.sub(0.45).div(max(fwidth(t.a), 1e-4)).add(0.5));
    m.colorNode = vec4(t.rgb.mul(tint).mul(vary.mul(0.35).add(0.8)).mul(mix(vec3(1), vec3(1.1, 1.05, 0.8), vary.mul(0.6))), a);
    // Radial crown normals, not flipped on back faces, so the crown shades as one mass.
    m.normalNode = normalViewGeometry;
    m.positionNode = this._sway((p) => {
      const f = sin(u.time.mul(5.5).add(p.x.mul(3.1)).add(p.z.mul(2.3)).add(p.y)).mul(0.04).mul(u.windStrength.add(0.15));
      return vec3(f, f.mul(0.5), f.negate());
    });
    // Sunlight glowing through the leaves when looking toward the sun.
    m.emissiveNode = Fn(() => {
      const v = normalize(positionWorld.sub(cameraPosition));
      const back = pow(saturate(dot(v, sunU.sunDir)), 4).mul(0.06).mul(float(1).sub(smoothstep(0.4, 0.95, sunU.sunDir.y)));
      return t.rgb.mul(tint).mul(sunU.sunColor).mul(back);
    })();
    return m;
  }

  update(dt, settings) {
    const u = this.u;
    u.time.value += dt;
    const wr = (settings.windDir * Math.PI) / 180;
    u.windDir.value.set(Math.sin(wr), 0, -Math.cos(wr));
    u.windStrength.value = Math.min(1.5, settings.windSpeed / 8);
  }
}
