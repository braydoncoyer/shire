// Chimney smoke: each lit chimney sends up a thin stream of puffs that rise, swell, bend away with
// the wind and thin out. Every puff is a camera-facing card animated entirely in the vertex shader
// (a looping life per puff, offset by its seed), and the whole village's smoke is one draw.
// Puffs are lit like the clouds: sky light from above plus the sun, so they read by day and glow
// faintly grey under the moon.

import * as THREE from 'three/webgpu';
import {
  Fn, uniform, attribute, uv, vec2, vec3, vec4, float, fract, sin, cos, smoothstep, length, max, texture,
  cameraWorldMatrix, varying,
} from 'three/tsl';
import { LAYERS } from '../core/Layers.js';

const PUFFS = 30; // per chimney
const LIFE = 13; // seconds from the chimney pot to gone

export class Smoke {
  constructor(chimneys, sky, noiseTex) {
    this.u = { time: uniform(0), wind: uniform(new THREE.Vector2(1, 0)) };
    const n = chimneys.length * PUFFS;
    const pos = new Float32Array(n * 4 * 3), uvs = new Float32Array(n * 4 * 2);
    const origin = new Float32Array(n * 4 * 3), seed = new Float32Array(n * 4);
    const idx = [];
    let v = 0;
    chimneys.forEach((c, ci) => {
      for (let k = 0; k < PUFFS; k++) {
        // Evenly spread through the life cycle, jittered, so the stream is steady.
        const s = (k + ((ci * 0.37) % 1) * 0.6) / PUFFS;
        for (const [x, y] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
          pos.set([x, y, 0], v * 3);
          uvs.set([x + 0.5, y + 0.5], v * 2);
          origin.set([c.x, c.y, c.z], v * 3);
          seed[v] = s + ci * 7.13;
          v++;
        }
        const b = v - 4;
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setAttribute('origin', new THREE.BufferAttribute(origin, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    g.setIndex(idx);

    const u = this.u, su = sky.u;
    const age = varying(float(0), 'smokeAge');
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    m.positionNode = Fn(() => {
      const o = attribute('origin', 'vec3'), sd = attribute('seed', 'float');
      const t = fract(u.time.div(LIFE).add(sd)).toVar();
      age.assign(t);
      const secs = t.mul(LIFE);
      // Rising, slowing as it cools; carried off by the wind, more so as it rises out of shelter.
      const rise = secs.mul(0.5).sub(secs.mul(secs).mul(0.01));
      const drift = u.wind.mul(secs.mul(t.add(0.35)).mul(0.55));
      const ph = sd.mul(40);
      const wob = vec2(sin(secs.mul(0.9).add(ph)), cos(secs.mul(0.7).add(ph.mul(1.3)))).mul(t.mul(0.9).add(0.1)).mul(0.6);
      const center = o.add(vec3(drift.x.add(wob.x), rise, drift.y.add(wob.y)));
      const size = t.mul(3.4).add(0.7);
      const a = sd.mul(6.283).add(secs.mul(0.15));
      const c2 = positionLocalCorner();
      const rc = vec2(c2.x.mul(cos(a)).sub(c2.y.mul(sin(a))), c2.x.mul(sin(a)).add(c2.y.mul(cos(a))));
      const right = cameraWorldMatrix.element(0).xyz, up = cameraWorldMatrix.element(1).xyz;
      return center.add(right.mul(rc.x.mul(size))).add(up.mul(rc.y.mul(size)));
    })();
    m.colorNode = Fn(() => {
      const p = uv().sub(0.5);
      const r = length(p).mul(2);
      const n1 = texture(noiseTex, uv().mul(0.6).add(vec2(age.mul(0.3), age.mul(0.17)))).b;
      const soft = smoothstep(1.0, 0.15, r.add(n1.sub(0.5).mul(0.6)));
      const fade = smoothstep(0.0, 0.08, age).mul(float(1).sub(smoothstep(0.35, 1.0, age)));
      const alpha = soft.mul(fade).mul(0.16);
      // Wood smoke: pale blue-grey, lit by the sky above and the sun.
      const light = su.ambTop.mul(0.8).add(su.sunColor.mul(max(su.sunDir.y, 0).mul(0.35).add(0.05)).div(Math.PI)).add(su.moonColor.mul(0.4));
      return vec4(vec3(0.46, 0.49, 0.54).mul(light), alpha);
    })();
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.layers.set(LAYERS.NO_REFLECT);
  }

  update(dt, settings) {
    this.u.time.value += dt;
    const wr = (settings.windDir * Math.PI) / 180;
    const s = 0.5 + settings.windSpeed * 0.35;
    this.u.wind.value.set(Math.sin(wr) * s, -Math.cos(wr) * s);
  }
}

// The card's corner (-0.5..0.5) from its local position.
const positionLocalCorner = () => attribute('position', 'vec3').xy;

