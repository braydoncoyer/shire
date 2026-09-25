// Shrubs, flowering bushes and hedges: the dense garden planting that fills the real set. Each
// variant is a cloud of leaf cards on an ellipsoid (or a box, for hedges) with normals radiating
// from its center, drawn instanced with the trees' leaf material.

import * as THREE from 'three/webgpu';
import { chunk } from './Chunks.js';
import { mulberry32 } from '../util/noise.js';
import { heightAt } from './Layout.js';

const KINDS = {
  bush: { shape: 'ellipsoid', r: [0.9, 0.75, 0.9], cards: 110, size: 0.55, tex: 'smallleaf', tint: 0x3d6a26 },
  broad: { shape: 'ellipsoid', r: [1.1, 0.9, 1.1], cards: 90, size: 0.75, tex: 'broadleaf', tint: 0x4b7a2e },
  hydrangea: { shape: 'ellipsoid', r: [0.8, 0.7, 0.8], cards: 90, size: 0.5, tex: 'smallleaf', tint: 0x3f6a2a, bloom: 0xc98ac8, blooms: 40 },
  roses: { shape: 'ellipsoid', r: [0.7, 0.8, 0.7], cards: 80, size: 0.45, tex: 'smallleaf', tint: 0x355e22, bloom: 0xd8402a, blooms: 35 },
  marigold: { shape: 'ellipsoid', r: [0.55, 0.4, 0.55], cards: 50, size: 0.35, tex: 'smallleaf', tint: 0x4a7a2a, bloom: 0xe8902a, blooms: 40 },
  yellow: { shape: 'ellipsoid', r: [0.7, 0.55, 0.7], cards: 60, size: 0.4, tex: 'smallleaf', tint: 0x4a7a2a, bloom: 0xf0cf30, blooms: 45 },
  lavender: { shape: 'ellipsoid', r: [0.55, 0.45, 0.55], cards: 70, size: 0.35, tex: 'smallleaf', tint: 0x7d8f78, bloom: 0x9a7ac8, blooms: 60 },
  ivy: { shape: 'ellipsoid', r: [1.3, 1.35, 0.7], cards: 170, size: 0.5, tex: 'broadleaf', tint: 0x2c4a1e },
  nasturtium: { shape: 'ellipsoid', r: [0.75, 0.3, 0.75], cards: 60, size: 0.42, tex: 'roundleaf', tint: 0x6aa83a, bloom: 0xe8632a, blooms: 18 },
  hedge: { shape: 'box', r: [1.6, 0.65, 0.5], cards: 170, size: 0.55, tex: 'smallleaf', tint: 0x355f22 },
};

function cloud(kind, seed) {
  const K = KINDS[kind];
  const rand = mulberry32(seed);
  const pos = [], nor = [], uv = [], col = [], idx = [];
  let v = 0;
  const leafCol = new THREE.Color(1, 1, 1), bloomCol = new THREE.Color(K.bloom || 0xffffff);
  const center = new THREE.Vector3(0, K.r[1] * 0.75, 0);
  const emit = (p, size, c) => {
    const facing = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    const a = Math.abs(facing.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const right = new THREE.Vector3().crossVectors(facing, a).normalize().multiplyScalar(size);
    const up = new THREE.Vector3().crossVectors(facing, right).normalize().multiplyScalar(size);
    const n = p.clone().sub(center).normalize().lerp(new THREE.Vector3(0, 1, 0), 0.2).normalize();
    for (const [x, y] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
      const q = p.clone().addScaledVector(right, x).addScaledVector(up, y);
      pos.push(q.x, q.y, q.z);
      nor.push(n.x, n.y, n.z);
      uv.push(x + 0.5, y + 0.5);
      col.push(c.r, c.g, c.b);
    }
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    v += 4;
  };
  const sample = (shell) => {
    if (K.shape === 'box') {
      const p = new THREE.Vector3((rand() * 2 - 1) * K.r[0], rand() * K.r[1] * 2, (rand() * 2 - 1) * K.r[2]);
      // Push toward the surface so the hedge reads as a clipped block.
      const f = Math.max(Math.abs(p.x) / K.r[0], Math.abs(p.y - K.r[1]) / K.r[1], Math.abs(p.z) / K.r[2]);
      return p.sub(center).multiplyScalar((0.75 + 0.25 * shell) / Math.max(f, 0.3)).add(center);
    }
    const d = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    const r = 0.55 + 0.45 * Math.pow(rand(), 0.5) * shell;
    return new THREE.Vector3(d.x * K.r[0] * r, Math.max(0.05, K.r[1] + d.y * K.r[1] * r), d.z * K.r[2] * r);
  };
  for (let i = 0; i < K.cards; i++) emit(sample(1), K.size * (0.7 + rand() * 0.6), leafCol);
  for (let i = 0; i < (K.blooms || 0); i++) emit(sample(1.15), K.size * 0.45 * (0.7 + rand() * 0.5), bloomCol);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

export class Shrubs {
  constructor(vegetation) {
    this.veg = vegetation;
    this.items = [];
    this.group = new THREE.Group();
  }

  /** Queue a plant. `y` defaults to the ground height; `rot` is yaw. */
  add(kind, x, z, scale = 1, rot = Math.random() * 6.283, y) {
    this.items.push({ kind, x, z, y: y ?? heightAt(x, z), scale, rot });
  }

  build() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const kind of Object.keys(KINDS)) {
      const K = KINDS[kind];
      const mat = this.veg.leafMaterial(K.tex, K.tint, true);
      for (let variant = 0; variant < 2; variant++) {
        const all = this.items.filter((it, i) => it.kind === kind && i % 2 === variant);
        if (!all.length) continue;
        const geo = cloud(kind, 91 + variant * 17 + kind.length * 3);
        for (const list of chunk(all, (it) => [it.x, it.z], 200).values()) {
          const mesh = new THREE.InstancedMesh(geo, mat, list.length);
          list.forEach((it, i) => {
            m.compose(p.set(it.x, it.y - 0.08, it.z), q.setFromAxisAngle(up, it.rot), s.setScalar(it.scale));
            mesh.setMatrixAt(i, m);
          });
          mesh.instanceMatrix = new THREE.StorageInstancedBufferAttribute(mesh.instanceMatrix.array, 16);
          mesh.castShadow = mesh.receiveShadow = true;
          mesh.computeBoundingSphere();
          this.group.add(mesh);
        }
      }
    }
    return this.group;
  }
}

export const SHRUB_KINDS = Object.keys(KINDS);
