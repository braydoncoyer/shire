// The lake surface: sky reflection from the atmosphere LUT with a Fresnel blend and a sun glint.
// A first pass; M2 replaces it with proper ripples, shoreline and the stream.

import * as THREE from 'three/webgpu';
import {
  Fn, texture, positionWorld, cameraPosition, vec2, vec3, vec4, float, normalize, reflect, dot, max,
  pow, mix, saturate, smoothstep, uniform,
} from 'three/tsl';
import { LANDMARKS, WATER_Y } from './Layout.js';

export class Water {
  constructor(sky, groundNoise) {
    const L = LANDMARKS.lake;
    const geo = new THREE.CircleGeometry(1, 96);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this._material(sky, groundNoise));
    this.mesh.scale.set(L.rx * 1.25, 1, L.rz * 1.25);
    this.mesh.rotation.y = L.rot || 0;
    this.mesh.position.set(L.x, WATER_Y, L.z);
    this.mesh.receiveShadow = false;
  }

  _material(sky, noise) {
    const m = new THREE.MeshBasicNodeMaterial();
    const t = (this.time = uniform(0));
    const u = sky.u;
    m.colorNode = Fn(() => {
      const wp = positionWorld.xz;
      const a = texture(noise, wp.div(9).add(vec2(t.mul(0.011), t.mul(0.007))));
      const b = texture(noise, wp.div(4.1).sub(vec2(t.mul(0.009), t.mul(-0.013))));
      const n = normalize(vec3(a.b.add(b.a).sub(1).mul(0.12), 1, a.a.add(b.b).sub(1).mul(0.12)));
      const v = normalize(positionWorld.sub(cameraPosition));
      const r = reflect(v, n);
      const refl = sky.sampleSky(normalize(vec3(r.x, max(r.y, 0.02), r.z)));
      const cosT = saturate(dot(v.negate(), n));
      const fres = float(0.02).add(float(0.98).mul(pow(float(1).sub(cosT), 5)));
      const body = vec3(0.012, 0.03, 0.022).mul(u.ambTop.r.add(u.sunColor.r.mul(0.05)));
      const spec = pow(saturate(dot(r, u.sunDir)), 900).mul(40).add(pow(saturate(dot(r, u.sunDir)), 60).mul(0.4));
      return mix(body, refl, fres).add(vec3(u.sunColor).mul(spec));
    })();
    return m;
  }
}
