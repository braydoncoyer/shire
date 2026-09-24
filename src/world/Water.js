// Water: the lake and the stream.
//
// The lake gets a planar reflection (trees, the Hill and the far bank, grass excluded for speed),
// distorted by wind ripples. Below the surface, the scene behind the water is refracted and tinted
// by depth, so the shallows show the lakebed and the edge fades into the shore instead of cutting
// a hard line. A sun glitter term sparkles on the ripples.
//
// The stream is a ribbon mesh along its bed whose ripples scroll downstream at the flow speed.

import * as THREE from 'three/webgpu';
import {
  Fn, texture, uniform, positionWorld, positionView, cameraPosition, screenUV, vec2, vec3, vec4, float,
  normalize, reflect, dot, max, pow, mix, saturate, smoothstep, exp, reflector, uv,
  viewportDepthTexture, viewportSharedTexture, perspectiveDepthToViewZ, cameraNear, cameraFar,
} from 'three/tsl';
import { LANDMARKS, WATER_Y, STREAM, streamWaterAt } from './Layout.js';

export class Water {
  constructor(sky, noiseTex) {
    this.sky = sky;
    this.noise = noiseTex;
    this.time = uniform(0);
    this.windStrength = uniform(0.5);
    this.windDir = uniform(new THREE.Vector2(0.7, -0.7));
    this.group = new THREE.Group();

    const L = LANDMARKS.lake;
    const geo = new THREE.CircleGeometry(1, 128);
    geo.rotateX(-Math.PI / 2);
    this.lake = new THREE.Mesh(geo);
    this.lake.scale.set(L.rx * 1.3, 1, L.rz * 1.3);
    this.lake.rotation.y = L.rot || 0;
    this.lake.position.set(L.x, WATER_Y, L.z);

    this.reflection = reflector({ resolutionScale: 0.5, bounces: false });
    // The mirrored camera is a clone of the main one, layers included. Limit it to layer 0 so the
    // reflection skips grass and water (both on layer 1).
    const base = this.reflection.reflector;
    const getVirtualCamera = base.getVirtualCamera.bind(base);
    base.getVirtualCamera = (camera) => {
      const v = getVirtualCamera(camera);
      v.layers.set(0);
      return v;
    };
    this.reflection.target.rotateX(-Math.PI / 2);
    this.reflection.target.position.set(L.x, WATER_Y, L.z);
    this.group.add(this.reflection.target);
    this.lake.material = this._material({ reflection: this.reflection, flow: null });
    this.group.add(this.lake);

    this.stream = new THREE.Mesh(this._streamGeometry(), this._material({ reflection: null, flow: 1.1 }));
    this.group.add(this.stream);
    // Water never appears in the reflection pass (its screen-space refraction would fight over the
    // shared viewport copy at the reflection's resolution).
    for (const m of [this.lake, this.stream]) m.layers.set(1);
  }

  /** Ripple normal from a few scrolling noise octaves (finite differences on a height field). */
  _normal(p, flowing) {
    const t = this.time, n = this.noise;
    const wind = this.windDir.mul(t.mul(this.windStrength.mul(0.6).add(0.15)));
    const h = (q) => {
      const a = flowing ? q : q.add(wind);
      return texture(n, a.div(7.5)).b.mul(0.6)
        .add(texture(n, a.mul(vec2(1, 1.3)).div(2.6).add(vec2(t.mul(0.013), t.mul(-0.017)))).a.mul(0.3))
        .add(texture(n, a.div(0.9).sub(vec2(t.mul(0.021), 0))).a.mul(0.12));
    };
    const e = 0.08;
    const h0 = h(p), hx = h(p.add(vec2(e, 0))), hz = h(p.add(vec2(0, e)));
    const amp = this.windStrength.mul(0.7).add(0.25).mul(flowing ? 1.6 : 1);
    return normalize(vec3(h0.sub(hx).mul(amp).div(e).mul(0.08), 1, h0.sub(hz).mul(amp).div(e).mul(0.08)));
  }

  _material({ reflection, flow }) {
    const sky = this.sky, u = sky.u;
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    m.colorNode = Fn(() => {
      // Ripple coordinates: world xz for the lake; along/across the ribbon for the stream,
      // scrolled downstream so the surface visibly flows.
      const p = flow ? uv().add(vec2(0, this.time.mul(-flow))) : positionWorld.xz;
      const n = this._normal(p, !!flow).toVar();
      const v = normalize(positionWorld.sub(cameraPosition));
      const cosT = saturate(dot(v.negate(), n));
      const fres = float(0.02).add(float(0.98).mul(pow(float(1).sub(cosT), 5))).toVar();

      // Depth of water along the view ray, from the depth buffer behind the surface.
      const sceneZ = perspectiveDepthToViewZ(viewportDepthTexture(screenUV), cameraNear, cameraFar);
      const depth = max(positionView.z.sub(sceneZ), 0).toVar();
      const edge = smoothstep(0.0, 0.35, depth);

      // Refraction: the lakebed seen through the water, absorbed toward deep green-brown.
      const ruv = screenUV.add(n.xz.mul(0.025).mul(saturate(depth)));
      const behind = viewportSharedTexture(ruv).rgb;
      const absorb = exp(vec3(0.55, 0.22, 0.28).mul(depth).mul(-0.6));
      const deep = vec3(0.012, 0.035, 0.03).mul(u.ambTop.g.mul(1.5).add(u.sunColor.g.mul(0.04)));
      const under = mix(deep, behind, absorb);

      // Reflection: the planar reflection for the lake, the sky for the stream.
      const rdir = reflect(v, n);
      let refl = sky.sampleSky(normalize(vec3(rdir.x, max(rdir.y, 0.02), rdir.z)));
      if (reflection) {
        reflection.uvNode = reflection.uvNode.add(n.xz.mul(0.06));
        refl = reflection.rgb;
      }
      const glint = pow(saturate(dot(rdir, u.sunDir)), 700).mul(60)
        .add(pow(saturate(dot(rdir, u.sunDir)), 80).mul(0.6));
      const col = mix(under, refl, fres).add(u.sunColor.mul(glint).mul(edge));
      return vec4(col, edge);
    })();
    return m;
  }

  _streamGeometry() {
    // A ribbon along the stream in 1 m steps, wide enough to meet the banks; the surface follows
    // the bed profile down to the lake.
    const pts = STREAM.smooth;
    const samples = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const steps = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az)));
      for (let k = 0; k < steps; k++) samples.push([ax + ((bx - ax) * k) / steps, az + ((bz - az) * k) / steps]);
    }
    samples.push(pts[pts.length - 1]);
    const half = STREAM.width * 0.5 + 1.0;
    const pos = [], uvs = [], idx = [];
    let along = 0;
    for (let i = 0; i < samples.length; i++) {
      const [x, z] = samples[i];
      const [px, pz] = samples[Math.max(0, i - 1)], [nx, nz] = samples[Math.min(samples.length - 1, i + 1)];
      let dx = nx - px, dz = nz - pz;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      if (i > 0) along += Math.hypot(x - samples[i - 1][0], z - samples[i - 1][1]);
      const y = Math.max(streamWaterAt(x, z), WATER_Y);
      for (const s of [-1, 1]) {
        pos.push(x - dz * half * s, y, z + dx * half * s);
        uvs.push(s * half, along);
      }
    }
    for (let i = 0; i < samples.length - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  update(dt, settings) {
    this.time.value += dt;
    const wr = (settings.windDir * Math.PI) / 180;
    this.windDir.value.set(Math.sin(wr), -Math.cos(wr));
    this.windStrength.value = Math.min(1.5, settings.windSpeed / 8);
  }
}
