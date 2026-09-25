// Hobbit holes and their gardens, generated from the HOLES list in Layout.js. The facade itself
// comes from HoleModel.js; this file lays out everything around it the way the set does: flagstone
// paths, a fence and gate on the lane (wattle, rustic rail or pickets), a letterbox, shrubs and
// flowering bushes crowding the front, pots by the door, chimneys through the turf, and here and
// there a vegetable patch, a bench, a washing line, beehives or a lamp post.

import * as THREE from 'three/webgpu';
import { Builder, mtx, box, cylinder } from './Kit.js';
import { buildFacade } from './HoleModel.js';
import { HOLES, heightAt } from './Layout.js';
import { mulberry32 } from '../util/noise.js';

const TIMBER = 0x5c4330, WEATHERED = 0x7d6e5a, WILLOW = 0x8a7550;
const FLAG = [0x9a958b, 0xa8a293, 0x8f897d, 0xb1aa99];
const FLOWER_KINDS = ['hydrangea', 'roses', 'marigold', 'yellow'];

export class HobbitHoles {
  constructor(mats, shrubs) {
    this.shrubs = shrubs;
    const B = new Builder();
    this.colliders = [];
    this.lanterns = [];
    this.chimneys = [];
    this.veg = [];
    for (const hole of HOLES) this._hole(B, hole);
    this.group = B.build(mats);
    this.group.add(this._vegetables());
  }

  _hole(B, hole) {
    const rand = mulberry32(hole.seed + 1);
    const base = new THREE.Matrix4().makeRotationY(hole.yaw).setPosition(hole.x, hole.y, hole.z);
    const at = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => base.clone().multiply(mtx(x, y, z, rx, ry, rz, sx, sy, sz));
    const toWorld = (lx, lz) => new THREE.Vector3(lx, 0, lz).applyMatrix4(base);
    const sc = hole.scale;
    const hw = hole.width / 2, cx = hole.center;
    const yard = hole.yard;

    // Facade (Bag End's in segments set around the curve of its dome).
    if (hole.segments) {
      const R = hole.arc.R;
      for (const seg of hole.segments) {
        const a = seg.v / R;
        // Rotate the door frame about the arc center (R behind the door).
        const m = base.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, -R))
          .multiply(new THREE.Matrix4().makeRotationY(a)).multiply(new THREE.Matrix4().makeTranslation(0, 0, R));
        const { lanterns } = buildFacade(B, { ...hole, bays: seg.bays, seed: hole.seed + Math.round(seg.v * 10) }, m);
        this.lanterns.push(...lanterns);
      }
    } else {
      const { lanterns } = buildFacade(B, hole, base.clone().multiply(new THREE.Matrix4().makeScale(sc, sc, sc)));
      this.lanterns.push(...lanterns);
    }

    // Chimneys poking through the turf behind.
    const nCh = hole.width > 7 ? 2 : 1;
    for (let k = 0; k < nCh; k++) {
      const chx = cx + (nCh === 1 ? (rand() < 0.5 ? -1 : 1) * (0.6 + rand()) : (k ? 1 : -1) * hw * 0.55);
      const chz = -2.6 - rand() * 1.5;
      const wp = toWorld(chx, chz);
      const gy = heightAt(wp.x, wp.z) - hole.y;
      const top = gy + 0.9 + rand() * 0.6;
      const brick = rand() < 0.55;
      B.add(brick ? 'brick' : 'stone', box(0.55, top - gy + 0.8, 0.55), at(chx, (top + gy - 0.8) / 2, chz), brick ? 0xa0553a : 0x9d968a);
      B.add('stone', box(0.68, 0.1, 0.68), at(chx, top + 0.05, chz), 0x8a8478);
      B.add('brick', cylinder(0.1, 0.13, 0.32, 10), at(chx, top + 0.26, chz), 0xa8603e);
      this.chimneys.push(toWorld(chx, chz).setY(hole.y + top + 0.45));
    }

    // Flagstone path from the gate to the door.
    for (let z = 0.5 * sc; z < yard + 0.2; z += 0.55 + rand() * 0.15) {
      const w = 0.55 + rand() * 0.35, d = 0.38 + rand() * 0.14;
      B.add('stone', box(w, 0.08, d), at((rand() - 0.5) * 0.25, 0.02, z, 0, (rand() - 0.5) * 0.4), FLAG[Math.floor(rand() * FLAG.length)]);
    }

    // Fence and gate along the lane edge.
    const fz = yard + 0.15;
    const style = hole.fence || (hole.bagEnd ? 'wattle' : ['wattle', 'rail', 'picket', 'rail'][Math.floor(rand() * 4)]);
    const gate = 0.7;
    // Bag End's front is open: only a short stretch of fence either side of its gate.
    const x0 = hole.segments ? -3.2 : cx - hw - 0.6, x1 = hole.segments ? 3.2 : cx + hw + 0.6;
    for (const [a, b] of [[x0, -gate], [gate, x1]]) {
      if (b - a < 0.3) continue;
      this._fence(B, at, style, a, b, fz, rand);
      const mid = toWorld((a + b) / 2, fz);
      this.colliders.push({ x: mid.x, z: mid.z, hx: (b - a) / 2, hz: 0.1, rot: hole.yaw });
    }
    for (const s of [-1, 1]) {
      B.add('wood', box(0.14, 1.15, 0.14), at(s * gate, 0.57, fz), TIMBER);
      B.add('wood', new THREE.SphereGeometry(0.1, 8, 6), at(s * gate, 1.2, fz), TIMBER);
    }
    // The gate, swung open.
    for (const y of [0.35, 0.85]) B.add('wood', box(gate * 1.9, 0.08, 0.05), at(-gate, y, fz, 0, -1.25).multiply(mtx(gate * 0.95, 0, 0)), WEATHERED);

    // Letterbox: a hollowed log on a post, or a painted box.
    const lbx = gate + 0.45;
    B.add('wood', box(0.12, 1.0, 0.12), at(lbx, 0.5, fz + 0.3), TIMBER);
    if (hole.bagEnd || rand() < 0.5) B.add('wood', cylinder(0.14, 0.14, 0.62, 10), at(lbx, 1.1, fz + 0.3, 0, 0, Math.PI / 2), 0x7a5a3c);
    else B.add('paint', box(0.3, 0.24, 0.4), at(lbx, 1.1, fz + 0.3), hole.doorColor);
    if (hole.bagEnd) B.add('plaster', box(0.75, 0.42, 0.03), at(gate + 0.2, 0.9, fz + 0.1), 0xece4cc);

    // Bag End's garden: rows of lavender across the terrace in front of the study bay, and a pumpkin
    // by the door.
    if (hole.segments) {
      for (let v = -14; v < -2; v += 0.9)
        for (const u of [2.2, 3.1]) {
          const a = v / hole.arc.R, R = hole.arc.R + u;
          const px = hole.x - hole.fx * hole.arc.R + (hole.fx * Math.cos(a) + hole.fz * Math.sin(a)) * R;
          const pz = hole.z - hole.fz * hole.arc.R + (hole.fz * Math.cos(a) - hole.fx * Math.sin(a)) * R;
          this.shrubs.add('lavender', px, pz, 0.8 + rand() * 0.2, rand() * 6.28, hole.y);
        }
      B.add('paint', new THREE.SphereGeometry(0.42, 16, 12), at(1.6, 0.3, 1.2, 0.3, 0, 0.2, 1.35, 0.8, 1), 0xd8842a);
    }

    // Planting: bushes at the facade ends, flowering shrubs in the beds, pots by the door.
    for (const e of [cx - hw - 0.5, cx + hw + 0.5]) {
      const p = toWorld(e, 0.5 + rand() * 0.5);
      this.shrubs.add(rand() < 0.5 ? 'bush' : 'broad', p.x, p.z, (0.8 + rand() * 0.5) * sc, rand() * 6.28, hole.y);
    }
    for (let x = cx - hw + 0.4; x < cx + hw - 0.3; x += 0.9 + rand() * 0.6) {
      if (Math.abs(x) < hole.doorR * sc + 0.4) continue; // keep the door clear
      if (rand() < 0.3) continue;
      const p = toWorld(x, 0.8 + rand() * 0.4);
      this.shrubs.add(FLOWER_KINDS[Math.floor(rand() * FLOWER_KINDS.length)], p.x, p.z, 0.55 + rand() * 0.35, rand() * 6.28, hole.y);
    }
    for (let x = x0 + 0.5; x < x1 - 0.3; x += 1.1 + rand() * 0.8) {
      if (Math.abs(x) < gate + 0.5 || rand() < 0.35) continue;
      const p = toWorld(x, fz - 0.6);
      const k = rand() < 0.6 ? FLOWER_KINDS[Math.floor(rand() * FLOWER_KINDS.length)] : 'bush';
      this.shrubs.add(k, p.x, p.z, 0.5 + rand() * 0.3, rand() * 6.28, hole.y);
    }
    for (const s of [-1, 1]) {
      if (rand() < 0.4) continue;
      const px = s * (hole.doorR * sc + 0.45);
      B.add('brick', cylinder(0.24, 0.17, 0.32, 12), at(px, 0.16, 0.45), 0xb8633a);
      const p = toWorld(px, 0.45);
      this.shrubs.add(rand() < 0.5 ? 'marigold' : 'roses', p.x, p.z, 0.5, rand() * 6.28, hole.y + 0.28);
    }

    // Occasional props.
    if (rand() < 0.45 || hole.bagEnd) {
      const bx = (rand() < 0.5 ? -1 : 1) * Math.min(hw - 0.9, hole.doorR * sc + 1.4);
      B.add('wood', box(1.3, 0.06, 0.38), at(bx, 0.45, 0.9), WEATHERED);
      B.add('wood', box(1.3, 0.3, 0.05), at(bx, 0.72, 0.72, -0.12), WEATHERED);
      for (const s of [-1, 1]) B.add('wood', box(0.07, 0.45, 0.35), at(bx + s * 0.55, 0.22, 0.9), TIMBER);
    }
    if (!hole.bagEnd && rand() < 0.22) {
      const side = rand() < 0.5 ? -1 : 1, px = cx + side * (hw - 0.4), z0 = 1.4, z1 = Math.max(2.8, yard - 1.0);
      for (const z of [z0, z1]) B.add('wood', box(0.08, 1.9, 0.08), at(px, 0.95, z), TIMBER);
      B.add('wood', box(0.015, 0.015, z1 - z0), at(px, 1.8, (z0 + z1) / 2), 0xdddddd);
      const cloth = [0xe8e0d0, 0x7a9ac0, 0xc07a6a, 0xd8c070, 0xb8c8a0];
      for (let k = 0; k < 3; k++) {
        const z = z0 + 0.4 + k * ((z1 - z0 - 0.8) / 2);
        B.add('plaster', box(0.02, 0.55, 0.45), at(px, 1.52, z, 0, 0, (rand() - 0.5) * 0.1), cloth[Math.floor(rand() * cloth.length)]);
      }
    }
    if (!hole.bagEnd && rand() < 0.15) {
      // Skeps (straw beehives) on a little stand.
      const bx = cx + (rand() < 0.5 ? -1 : 1) * (hw - 0.6);
      B.add('wood', box(1.2, 0.5, 0.5), at(bx, 0.25, yard - 1.1), WEATHERED);
      for (const s of [-0.3, 0.3]) B.add('thatch', new THREE.SphereGeometry(0.24, 10, 8, 0, Math.PI * 2, 0, Math.PI / 1.7), at(bx + s, 0.5, yard - 1.1), 0xd0b070);
    }
    if (rand() < 0.3) {
      const lpx = -gate - 0.5;
      B.add('metal', box(0.07, 2.0, 0.07), at(lpx, 1.0, fz - 0.25), 0x2a2622);
      B.add('metal', box(0.22, 0.3, 0.22), at(lpx, 2.1, fz - 0.25), 0x2a2622);
      B.add('glass', box(0.16, 0.22, 0.16), at(lpx, 2.1, fz - 0.25), 0xff0000);
      this.lanterns.push(toWorld(lpx, fz - 0.25).setY(hole.y + 2.1));
    }

    // Vegetable rows (instanced below).
    if (hole.veg && !hole.bagEnd) {
      const side = hole.seed % 2 ? 1 : -1;
      for (let u = 1.9; u < yard - 1.4; u += 0.5)
        for (let v = 2.0; v < hw + 0.6; v += 0.45) {
          const p = toWorld(cx + side * v + (rand() - 0.5) * 0.1, u + (rand() - 0.5) * 0.1);
          this.veg.push({ x: p.x, y: hole.y, z: p.z, kind: u > yard - 2.1 && rand() < 0.35 ? 1 : 0, s: 0.6 + rand() * 0.4, r: rand() * 6.28 });
        }
    }

    // The mound and facade block the way.
    const m = toWorld(cx, -2);
    this.colliders.push({ x: m.x, z: m.z, hx: hw, hz: 2.05, rot: hole.yaw });
  }

  _fence(B, at, style, a, b, z, rand) {
    const len = b - a;
    if (style === 'picket') {
      for (let x = a + 0.08; x < b; x += 0.16) {
        const h = 0.8 + Math.sin(x * 7.3) * 0.03;
        B.add('wood', box(0.07, h, 0.025), at(x, h / 2, z, 0, 0, (rand() - 0.5) * 0.04), 0xd8d2c0);
      }
      for (const y of [0.25, 0.62]) B.add('wood', box(len, 0.06, 0.04), at((a + b) / 2, y, z - 0.03), 0xd8d2c0);
    } else if (style === 'rail') {
      // Rustic split rails between leaning posts.
      const n = Math.max(1, Math.round(len / 2));
      for (let k = 0; k <= n; k++) B.add('wood', box(0.13, 1.0, 0.13), at(a + (len * k) / n, 0.5, z, (rand() - 0.5) * 0.06, 0, (rand() - 0.5) * 0.08), WEATHERED);
      for (const y of [0.45, 0.85]) B.add('wood', box(len, 0.08, 0.06), at((a + b) / 2, y + (rand() - 0.5) * 0.04, z, 0, 0, (rand() - 0.5) * 0.03), WEATHERED);
    } else {
      // Wattle: stakes with woven withies (bands of thin rods).
      for (let x = a + 0.15; x < b; x += 0.4) B.add('wood', box(0.05, 0.85, 0.05), at(x, 0.42, z), WEATHERED);
      for (let y = 0.12; y < 0.75; y += 0.07) B.add('wood', box(len, 0.045, 0.035), at((a + b) / 2, y, z + (Math.round(y / 0.07) % 2 ? 0.02 : -0.02)), WILLOW);
    }
  }

  _vegetables() {
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
      mesh.layers.set(3); // LAYERS.DETAIL
      mesh.computeBoundingSphere();
      group.add(mesh);
    });
    return group;
  }
}
