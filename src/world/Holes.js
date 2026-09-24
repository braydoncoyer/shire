// Hobbit holes: stone facades set into turf mounds, round painted doors with brass knobs, round
// windows, chimneys poking through the grass, picket fences and gates, letterboxes, benches,
// porches, washing lines and vegetable patches. Everything is generated from the HOLES list in
// Layout.js and merged per material.

import * as THREE from 'three/webgpu';
import { Builder, mtx, box, cylinder } from './Kit.js';
import { HOLES, moundTop, heightAt } from './Layout.js';
import { mulberry32 } from '../util/noise.js';

const STONES = [0xb8ad98, 0xa39c8e, 0xc2b59a, 0x9c9384, 0xb5a488];
const TIMBER = 0x7a5a3a;
const FENCE = [0xd8d2c0, 0x8a7a62, 0xb3a58a];

/** Facade outline: follows the turf dome's profile, with round openings for door and windows. */
function facadeGeometry(hole, doorR, windows) {
  const hw = hole.width / 2;
  const shape = new THREE.Shape();
  const N = 24;
  shape.moveTo(-hw, -0.4);
  for (let i = 0; i <= N; i++) {
    const v = -hw + (2 * hw * i) / N;
    shape.lineTo(v, Math.max(0.4, moundTop(hole, v, 0) - 0.05));
  }
  shape.lineTo(hw, -0.4);
  shape.closePath();
  const door = new THREE.Path();
  door.absarc(0, doorR + 0.02, doorR + 0.03, 0, Math.PI * 2, true);
  shape.holes.push(door);
  for (const w of windows) {
    const p = new THREE.Path();
    p.absarc(w.x, w.y, w.r + 0.02, 0, Math.PI * 2, true);
    shape.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false, curveSegments: 28 });
  g.translate(0, 0, -0.45);
  return g;
}

function ring(r, tube, seg = 40) {
  const g = new THREE.TorusGeometry(r, tube, 6, seg);
  const uvs = g.attributes.uv;
  for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) * 2 * Math.PI * r, uvs.getY(i) * tube * 6);
  return g;
}

function disc(r, depth, seg = 40) {
  // A flat cylinder facing +z, uv planar across the face (0..1).
  const g = new THREE.CylinderGeometry(r, r, depth, seg);
  g.rotateX(Math.PI / 2);
  return g;
}

export class HobbitHoles {
  constructor(mats) {
    const B = new Builder();
    this.colliders = [];
    this.lanterns = []; // positions for night lights (M4)
    this.chimneys = []; // chimney tops, for smoke (M4)
    this.veg = [];
    for (const hole of HOLES) this._hole(B, hole);
    this.group = B.build(mats);
    this.group.add(this._vegetables());
  }

  _hole(B, hole) {
    const rand = mulberry32(hole.seed);
    const base = new THREE.Matrix4().makeRotationY(hole.yaw).setPosition(hole.x, hole.y, hole.z);
    const at = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => base.clone().multiply(mtx(x, y, z, rx, ry, rz, sx, sy, sz));
    const hw = hole.width / 2;
    const doorR = hole.bagEnd ? 1.08 : 0.9 + rand() * 0.08;
    const stoneTint = STONES[Math.floor(rand() * STONES.length)];

    // Windows either side of the door.
    const windows = [];
    const wr = hole.bagEnd ? 0.55 : 0.4 + rand() * 0.08;
    const wx = doorR + 0.75 + wr;
    if (hole.windows >= 1) windows.push({ x: rand() < 0.5 ? -wx : wx, y: 1.25, r: wr });
    if (hole.windows >= 2) windows.push({ x: -windows[0].x, y: 1.25, r: wr });
    for (const w of windows) if (Math.abs(w.x) + w.r > hw - 0.3) w.x = Math.sign(w.x) * (hw - 0.3 - w.r);

    // Facade and door frame.
    B.add('stone', facadeGeometry(hole, doorR, windows), at(0, 0, 0), stoneTint);
    B.add('wood', ring(doorR + 0.06, 0.1), at(0, doorR + 0.02, 0.06), TIMBER);
    // A stone threshold step.
    B.add('stone', box(doorR * 2 + 0.3, 0.18, 0.55), at(0, 0.02, 0.25), stoneTint);

    // The door: painted planks, a brass knob in the middle (Bag End) or to one side.
    B.add('paint', disc(doorR, 0.08), at(0, doorR + 0.02, -0.12), hole.color);
    const kx = hole.bagEnd ? 0 : (rand() < 0.5 ? -1 : 1) * doorR * 0.55;
    B.add('metal', new THREE.SphereGeometry(0.075, 12, 8), at(kx, doorR + 0.02, -0.02), 0xc9a24a);
    B.add('metal', ring(0.05, 0.015, 12), at(kx, doorR - 0.1, -0.05), 0xb08a3a);

    // Windows: painted frame, glass, mullions; some are lit at night.
    const lit = rand() < 0.75 ? 0xff0000 : 0x000000;
    for (const w of windows) {
      B.add('paint', ring(w.r + 0.03, 0.06, 32), at(w.x, w.y, 0.04), rand() < 0.5 ? hole.color : 0xe8e2d0);
      B.add('glass', disc(w.r, 0.03, 32), at(w.x, w.y, -0.1), lit);
      B.add('wood', box(w.r * 2, 0.045, 0.04), at(w.x, w.y, -0.06), 0xe8e2d0);
      B.add('wood', box(0.045, w.r * 2, 0.04), at(w.x, w.y, -0.06), 0xe8e2d0);
      // Window box with flowers' soil (flowers come from the ground-cover system below).
      B.add('wood', box(w.r * 2.2, 0.22, 0.3), at(w.x, w.y - w.r - 0.2, 0.15), TIMBER);
    }

    // Lantern beside the door.
    const lx = (kx >= 0 ? -1 : 1) * (doorR + 0.35);
    B.add('metal', box(0.18, 0.26, 0.18), at(lx, 1.85, 0.15), 0x2a2a2a);
    B.add('glass', box(0.13, 0.19, 0.13), at(lx, 1.85, 0.15), 0xff0000);
    this.lanterns.push(new THREE.Vector3(lx, 1.85, 0.3).applyMatrix4(base));

    // Porch: two posts and a little shingled roof over the door.
    if (hole.porch) {
      for (const s of [-1, 1]) B.add('wood', box(0.14, 2.35, 0.14), at(s * (doorR + 0.25), 1.17, 1.2), TIMBER);
      B.add('roof', box(doorR * 2 + 1.0, 0.1, 1.5), at(0, 2.45, 0.6, -0.28), 0x6d5a4c);
    }

    // Chimney poking out of the turf behind the facade.
    {
      const cx = hole.chimney, cz = -3.2;
      const wp = new THREE.Vector3(cx, 0, cz).applyMatrix4(base);
      const gy = heightAt(wp.x, wp.z) - hole.y;
      const top = gy + 1.1 + rand() * 0.5;
      const style = rand() < 0.5 ? 'brick' : 'stone';
      B.add(style, box(0.55, top - gy + 0.6, 0.55), at(cx, (top + gy - 0.6) / 2, cz), style === 'brick' ? 0xa0553a : stoneTint);
      B.add('stone', box(0.7, 0.1, 0.7), at(cx, top + 0.05, cz), 0x8a8478);
      B.add('brick', cylinder(0.1, 0.12, 0.3, 10), at(cx, top + 0.25, cz), 0xa8603e);
      this.chimneys.push(new THREE.Vector3(cx, top + 0.45, cz).applyMatrix4(base));
    }

    // Picket fence along the lane edge with a gate gap, gate posts and a letterbox.
    const fz = hole.yard + 0.1;
    const fenceTint = FENCE[Math.floor(rand() * FENCE.length)];
    const gate = hole.bagEnd ? 0.8 : 0.65;
    for (let x = -hw - 0.8; x <= hw + 0.8; x += 0.16) {
      if (Math.abs(x) < gate) continue;
      const h = 0.85 + Math.sin(x * 7.3 + hole.seed) * 0.03;
      B.add('wood', box(0.075, h, 0.025), at(x, h / 2, fz, 0, 0, (rand() - 0.5) * 0.04), fenceTint);
    }
    for (const s of [-1, 1]) {
      const x0 = s * gate, x1 = s * (hw + 0.8);
      const len = Math.abs(x1 - x0), mid = (x0 + x1) / 2;
      for (const y of [0.25, 0.65]) B.add('wood', box(len, 0.06, 0.04), at(mid, y, fz - 0.03), fenceTint);
      B.add('wood', box(0.12, 1.1, 0.12), at(x0, 0.55, fz), TIMBER);
    }
    // Gate (swung open), letterbox on a post.
    B.add('wood', box(gate * 1.9, 0.75, 0.04), at(-gate + 0.05, 0.5, fz + 0.5, 0, -1.2), fenceTint);
    const mbx = gate + 0.5;
    B.add('wood', box(0.08, 1.05, 0.08), at(mbx, 0.52, fz + 0.35), TIMBER);
    B.add('paint', box(0.32, 0.26, 0.24), at(mbx, 1.15, fz + 0.35), hole.color);

    // A bench against the facade, sometimes.
    if (rand() < 0.55 || hole.bagEnd) {
      const bx = (lx > 0 ? -1 : 1) * Math.min(hw - 1.2, doorR + 1.5);
      B.add('wood', box(1.3, 0.06, 0.38), at(bx, 0.45, 0.45), TIMBER);
      B.add('wood', box(1.3, 0.35, 0.05), at(bx, 0.72, 0.28, -0.15), TIMBER);
      for (const s of [-1, 1]) B.add('wood', box(0.07, 0.45, 0.35), at(bx + s * 0.55, 0.22, 0.45), TIMBER);
    }

    // A washing line across the yard, now and then.
    if (!hole.bagEnd && rand() < 0.25) {
      const side = rand() < 0.5 ? -1 : 1;
      const px = side * (hw - 0.5), z0 = 1.6, z1 = Math.max(2.8, hole.yard - 1.2);
      for (const z of [z0, z1]) B.add('wood', box(0.08, 1.9, 0.08), at(px, 0.95, z), TIMBER);
      B.add('wood', box(0.015, 0.015, z1 - z0), at(px, 1.8, (z0 + z1) / 2), 0xdddddd);
      const cloth = [0xe8e0d0, 0x7a9ac0, 0xc07a6a, 0xd8c070];
      for (let k = 0; k < 3; k++) {
        const z = z0 + 0.4 + k * ((z1 - z0 - 0.8) / 2);
        B.add('wood', box(0.02, 0.55, 0.45), at(px, 1.52, z, 0, 0, (rand() - 0.5) * 0.1), cloth[Math.floor(rand() * cloth.length)]);
      }
    }

    // Bag End: stone steps down from the garden to the gate, and the sign on the gate.
    if (hole.bagEnd) {
      B.add('wood', box(0.7, 0.35, 0.03), at(gate + 0.15, 0.95, fz + 0.08), 0xd8cfb8);
      for (let k = 0; k < 5; k++) B.add('stone', box(1.7, 0.25, 0.4), at(0, -0.12 - k * 0.25, fz - 1.2 + k * 0.4), 0xa39c8e);
    }

    // Vegetable rows (instanced below).
    if (hole.veg) {
      const side = hole.seed % 2 ? 1 : -1;
      for (let u = 2.1; u < hole.yard - 1.5; u += 0.55)
        for (let v = 2.0; v < hw + 0.9; v += 0.5) {
          const p = new THREE.Vector3(side * v + (rand() - 0.5) * 0.1, 0, u + (rand() - 0.5) * 0.1).applyMatrix4(base);
          this.veg.push({ x: p.x, y: hole.y, z: p.z, kind: u > hole.yard - 2.2 && rand() < 0.4 ? 1 : 0, s: 0.8 + rand() * 0.5, r: rand() * 6.28 });
        }
    }

    // Colliders: the facade and mound, the fence (with its gate gap), the chimney.
    const c = Math.cos(hole.yaw), s = Math.sin(hole.yaw);
    const toWorld = (lx2, lz2) => [hole.x + lx2 * c + lz2 * s, hole.z - lx2 * s + lz2 * c];
    const [mx, mz] = toWorld(0, -2);
    this.colliders.push({ x: mx, z: mz, hx: hw, hz: 2.05, rot: hole.yaw });
    for (const sd of [-1, 1]) {
      const len = hw + 0.8 - gate;
      const [fx, fz2] = toWorld(sd * (gate + len / 2), fz);
      this.colliders.push({ x: fx, z: fz2, hx: len / 2, hz: 0.08, rot: hole.yaw });
    }
  }

  _vegetables() {
    // Cabbages (lumpy green balls) and the odd pumpkin.
    const group = new THREE.Group();
    const kinds = [
      { geo: new THREE.IcosahedronGeometry(0.2, 1), color: 0x5f8f3a, sy: 0.7 },
      { geo: new THREE.SphereGeometry(0.22, 12, 8), color: 0xd9822b, sy: 0.75 },
    ];
    kinds.forEach((k, idx) => {
      const list = this.veg.filter((v) => v.kind === idx);
      if (!list.length) return;
      const mat = new THREE.MeshStandardNodeMaterial({ color: k.color, roughness: 0.8 });
      const mesh = new THREE.InstancedMesh(k.geo, mat, list.length);
      list.forEach((v, i) => mesh.setMatrixAt(i, mtx(v.x, v.y + 0.12 * v.s, v.z, 0, v.r, 0, v.s, v.s * k.sy, v.s)));
      mesh.instanceMatrix = new THREE.StorageInstancedBufferAttribute(mesh.instanceMatrix.array, 16);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    });
    return group;
  }
}
