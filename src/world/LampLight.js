// Lamplight after dark: every lantern in the village (hole doors, lamp posts, the Green Dragon, the
// mill) baked into one map of the light each casts on the ground around it, half a meter per texel.
// Materials add `albedo × light(position)` as emission at night. That's one texture read per pixel
// instead of dozens of real lights shading everything.
//
// Each lantern lights the ground by the inverse square law and the angle of incidence, from its
// height above that ground, so light pools under a lamp and fades out over a few meters; ground
// higher than the lantern (the turf over a hole's door) gets none. A second channel holds the
// lanterns' height, so surfaces well above them (roofs) stay dark.

import * as THREE from 'three/webgpu';
import { texture, uniform, float, color, smoothstep, step, abs, vec3 } from 'three/tsl';
import { INNER_HALF } from './Layout.js';

const RES = 0.5;
const INTENSITY = 0.62; // candela-like, in the scene's light units
const EMAX = 0.32; // irradiance stored at full scale
const REACH = 11; // meters
const FLASH = 150; // a firework burst's strength, same units
const Y0 = -15, Y_RANGE = 60; // lantern heights encoded in the second channel

export class LampLight {
  constructor(sky) {
    this.n = Math.round((INNER_HALF * 2) / RES);
    this.tex = new THREE.DataTexture(new Uint8Array(this.n * this.n * 2), this.n, this.n, THREE.RGFormat, THREE.UnsignedByteType);
    this.tex.magFilter = this.tex.minFilter = THREE.LinearFilter;
    this.tex.wrapS = this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.needsUpdate = true;
    this.flicker = uniform(1);
    // Lit from dusk.
    this.on = smoothstep(0.05, 0.55, sky.u.night);
    this.time = 0;
    // A firework's burst: a brief point of light high over the lake (color × strength; Fireworks.js).
    this.flash = { pos: uniform(new THREE.Vector3(0, -1000, 0)), color: uniform(new THREE.Color(0, 0, 0)) };
  }

  /** Bake the lanterns (world positions) over the ground heights from the terrain's grid. */
  bake(lamps, heights) {
    const { n } = this;
    const acc = new Float32Array(n * n), accY = new Float32Array(n * n);
    const hAt = (x, z) => {
      const i = Math.round(x + INNER_HALF) + 1, j = Math.round(z + INNER_HALF) + 1;
      if (i < 0 || j < 0 || i >= heights.m || j >= heights.m) return -Infinity;
      return heights.H[j * heights.m + i];
    };
    const r = Math.ceil(REACH / RES);
    for (const L of lamps) {
      const ci = Math.floor((L.x + INNER_HALF) / RES), cj = Math.floor((L.z + INNER_HALF) / RES);
      for (let j = Math.max(0, cj - r); j <= Math.min(n - 1, cj + r); j++)
        for (let i = Math.max(0, ci - r); i <= Math.min(n - 1, ci + r); i++) {
          const x = (i + 0.5) * RES - INNER_HALF, z = (j + 0.5) * RES - INNER_HALF;
          const d2 = (x - L.x) ** 2 + (z - L.z) ** 2;
          if (d2 > REACH * REACH) continue;
          const h = L.y - hAt(x, z);
          if (h < 0.15) continue;
          const e = (INTENSITY * h) / Math.pow(d2 + h * h, 1.5);
          const d = Math.sqrt(d2);
          const w = e * Math.min(1, (REACH - d) / (REACH * 0.4));
          acc[j * n + i] += w;
          accY[j * n + i] += w * L.y;
        }
    }
    // Square-root encoding keeps precision in the dim fringes.
    const data = this.tex.image.data;
    for (let k = 0; k < n * n; k++) {
      data[k * 2] = Math.round(Math.sqrt(Math.min(1, acc[k] / EMAX)) * 255);
      data[k * 2 + 1] = acc[k] > 0 ? Math.round(Math.min(1, Math.max(0, (accY[k] / acc[k] - Y0) / Y_RANGE)) * 255) : 0;
    }
    this.tex.needsUpdate = true;
  }

  /** Irradiance (vec3, warm) from the lanterns at world position `p`, zero by day. */
  light(p) {
    const uvp = p.xz.add(INNER_HALF).div(INNER_HALF * 2);
    const t = texture(this.tex, uvp);
    const v = t.r;
    const lampY = t.g.mul(Y_RANGE).add(Y0);
    const below = float(1).sub(smoothstep(0.4, 1.6, p.y.sub(lampY)));
    const inside = step(abs(p.x), INNER_HALF - 1).mul(step(abs(p.z), INNER_HALF - 1));
    const lamps = color(0xff8a3c).mul(v.mul(v).mul(EMAX)).mul(below).mul(inside).mul(this.on).mul(this.flicker);
    // Inverse square from the burst, softened so nothing close by blows out.
    const d = p.sub(this.flash.pos);
    return lamps.add(vec3(this.flash.color).mul(FLASH).div(d.dot(d).add(400)));
  }

  /** Emission for a diffuse surface of `albedo` (Lambert: albedo × E / π). */
  emission(albedo, p) {
    return albedo.mul(this.light(p)).mul(float(1 / Math.PI));
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    this.flicker.value = 1 + Math.sin(t * 5.1) * 0.025 + Math.sin(t * 11.7 + 2) * 0.02;
  }
}

