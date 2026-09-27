// Rain: thin falling streaks in a box that follows the camera. Each drop has a fixed home in world
// space wrapped into the box (like the fireflies), so the rain doesn't slide along as you walk. One
// draw, animated in the vertex shader; how hard it rains sets how many drops are drawn.

import * as THREE from 'three/webgpu';
import {
  Fn, uniform, attribute, vec3, float, hash, normalize, length, smoothstep, max, varying, cameraPosition, uv,
} from 'three/tsl';
import { LAYERS } from '../core/Layers.js';
import { weatherU } from './Weather.js';

const N = 26000;
const BOX = [34, 20, 34]; // m around the camera

export class Rain {
  constructor(sky) {
    const pos = new Float32Array(N * 4 * 3), uvs = new Float32Array(N * 4 * 2), ids = new Float32Array(N * 4);
    const idx = new Uint32Array(N * 6);
    for (let i = 0; i < N; i++) {
      for (let k = 0; k < 4; k++) {
        const v = i * 4 + k;
        pos[v * 3] = k & 1 ? 0.5 : -0.5;
        pos[v * 3 + 1] = k >> 1;
        uvs[v * 2] = k & 1;
        uvs[v * 2 + 1] = k >> 1;
        ids[v] = i;
      }
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setAttribute('id', new THREE.BufferAttribute(ids, 1));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.geometry = g;

    this.u = { time: uniform(0), drift: uniform(new THREE.Vector3()) };
    const u = this.u, su = sky.u;
    const fade = varying(float(0), 'rainFade');

    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    m.positionNode = Fn(() => {
      const id = attribute('id', 'float');
      const r = (k) => hash(id.add(k * 1013));
      const box = vec3(...BOX);
      const fall = r(4).mul(2.5).add(8.5);
      // Wind blows the drops sideways as they fall.
      const vel = vec3(u.drift.x, fall.negate(), u.drift.z);
      const home = vec3(r(1), r(2), r(3)).mul(box).add(vel.mul(u.time));
      const c = home.sub(cameraPosition).div(box).fract().sub(0.5).mul(box).add(cameraPosition);
      const d = normalize(vel);
      const view = c.sub(cameraPosition);
      const dist = length(view);
      // Face the camera: across the view, level (the drops fall near enough straight down).
      const side = normalize(vec3(view.z, 0, view.x.negate()));
      // Streaks stretched by their speed; wider far away so they don't shimmer below a pixel.
      const lp = attribute('position', 'vec3');
      const len = r(5).mul(0.3).add(0.4);
      const width = max(float(0.006), dist.mul(0.0011));
      fade.assign(smoothstep(0.6, 2.2, dist).mul(float(1).sub(smoothstep(BOX[0] * 0.3, BOX[0] * 0.5, dist))));
      return c.add(side.mul(lp.x.mul(width))).add(d.mul(lp.y.sub(0.5).mul(len)));
    })();
    // Lit by the sky (and a touch of the sun), faint and pale.
    m.colorNode = su.ambTop.mul(Math.PI * 0.75).add(su.sunColor.mul(0.04)).add(su.moonColor.mul(0.5));
    m.opacityNode = fade.mul(uv().y.mul(0.7).add(0.3)).mul(0.26);

    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 2;
    this.mesh.layers.set(LAYERS.NO_REFLECT);
    this.mesh.visible = false;
  }

  update(dt, camera, settings, indoor) {
    const rain = weatherU.rain.value;
    this.u.time.value = (this.u.time.value + dt) % 900; // kept small for float precision
    const wr = (settings.windDir * Math.PI) / 180;
    const w = settings.windSpeed * 0.45;
    this.u.drift.value.set(Math.sin(wr) * w, 0, -Math.cos(wr) * w);
    const n = Math.floor(N * Math.min(1, rain) ** 1.3);
    this.mesh.visible = n > 50 && !indoor;
    this.geometry.setDrawRange(0, n * 6);
  }
}
