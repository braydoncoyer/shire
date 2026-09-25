// Water: the lake and the stream.
//
// The lake gets a planar reflection (trees, the Hill and the far bank, grass excluded for speed),
// distorted by wind ripples. The surface is blended over the lakebed by its depth (from the ground
// height map), so the shallows show the bed and the edge fades into the shore instead of cutting a
// hard line. A sun glitter term sparkles on the ripples.
//
// The stream is a ribbon mesh along its bed whose ripples scroll downstream at the flow speed.

import * as THREE from 'three/webgpu';
import {
  Fn, texture, uniform, positionWorld, cameraPosition, vec2, vec3, vec4, float,
  normalize, reflect, dot, max, pow, saturate, smoothstep, exp, reflector, uv,
} from 'three/tsl';
import { LAYERS } from '../core/Layers.js';
import { WATER_Y, STREAMS, LAKE_SDF, POND_SDF, POND_Y, streamWaterAt } from './Layout.js';

export class Water {
  constructor(sky, noiseTex, maps) {
    this.sky = sky;
    this.maps = maps;
    this.noise = noiseTex;
    this.time = uniform(0);
    this.windStrength = uniform(0.5);
    this.windDir = uniform(new THREE.Vector2(0.7, -0.7));
    this.group = new THREE.Group();

    // Lake and pond surfaces: a 2 m grid over every cell within a few meters of open water (the
    // terrain hides the overlap past the shoreline).
    this.lake = new THREE.Mesh(this._surface(LAKE_SDF, WATER_Y));
    this.reflection = reflector({ resolutionScale: 0.5, bounces: false });
    // The mirrored camera is a clone of the main one, layers included. Limit it to layer 0 so the
    // reflection skips grass and water (both on layer 1).
    const base = this.reflection.reflector;
    const getVirtualCamera = base.getVirtualCamera.bind(base);
    base.getVirtualCamera = (camera) => {
      const v = getVirtualCamera(camera);
      v.layers.set(LAYERS.BASE);
      v.layers.enable(LAYERS.TERRAIN);
      return v;
    };
    this.reflection.target.rotateX(-Math.PI / 2);
    this.reflection.target.position.set(LAKE_SDF.x0 + (LAKE_SDF.nx * LAKE_SDF.res) / 2, WATER_Y, LAKE_SDF.z0 + (LAKE_SDF.nz * LAKE_SDF.res) / 2);
    this.group.add(this.reflection.target);
    this.lake.material = this._material({ reflection: this.reflection, flow: null });
    this.group.add(this.lake);

    this.pond = new THREE.Mesh(this._surface(POND_SDF, POND_Y, 1, 1.5), this._material({ reflection: null, flow: null }));
    this.group.add(this.pond);

    const streamMat = this._material({ reflection: null, flow: 0.9 });
    this.streams = STREAMS.map((st) => new THREE.Mesh(this._streamGeometry(st), streamMat));
    this.group.add(...this.streams);
    // Water never appears in the reflection pass.
    for (const m of [this.lake, this.pond, ...this.streams]) m.layers.set(LAYERS.NO_REFLECT);
  }

  _surface(sdf, y, cell = 2, reach = 6) {
    const pos = [], idx = [];
    const step = Math.round(cell / sdf.res);
    const cols = Math.floor((sdf.nx - 1) / step), rows = Math.floor((sdf.nz - 1) / step);
    const vid = new Int32Array((cols + 1) * (rows + 1)).fill(-1);
    const vert = (i, j) => {
      const k = j * (cols + 1) + i;
      if (vid[k] < 0) {
        vid[k] = pos.length / 3;
        pos.push(sdf.x0 + i * step * sdf.res, y, sdf.z0 + j * step * sdf.res);
      }
      return vid[k];
    };
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const d = sdf.d[(j * step + (step >> 1)) * sdf.nx + i * step + (step >> 1)];
        if (d > reach) continue;
        const a = vert(i, j), b = vert(i + 1, j), c = vert(i, j + 1), e = vert(i + 1, j + 1);
        idx.push(a, c, b, b, c, e);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
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
    // Blended over the lakebed rather than refracting a copy of the frame: sampling the frame
    // mid-pass forces a resolve and copy of the whole multisampled target, which costs more than
    // the rest of the water put together. Premultiplied, so the sun glints add on top.
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, premultipliedAlpha: true });
    m.colorNode = Fn(() => {
      // Ripple coordinates: world xz for the lake; along/across the ribbon for the stream,
      // scrolled downstream so the surface visibly flows.
      const p = flow ? uv().add(vec2(0, this.time.mul(-flow))) : positionWorld.xz;
      const n = this._normal(p, !!flow).toVar();
      const v = normalize(positionWorld.sub(cameraPosition));
      const cosT = saturate(dot(v.negate(), n));
      const fres = float(0.02).add(float(0.98).mul(pow(float(1).sub(cosT), 5))).toVar();

      // Water depth under this point from the ground height map, and the path length of the view
      // ray through it.
      const depth = max(positionWorld.y.sub(this.maps.height(positionWorld.xz)), 0).toVar();
      const edge = smoothstep(0.0, 0.35, depth);
      const path = depth.div(max(v.y.negate(), 0.15));

      // The lakebed shows through by its transmittance, absorbed toward deep green-brown.
      const absorbV = exp(vec3(0.55, 0.22, 0.28).mul(path).mul(-0.6));
      const absorb = absorbV.g.mul(0.5).add(absorbV.r.mul(0.2)).add(absorbV.b.mul(0.3));
      const deep = vec3(0.012, 0.035, 0.03).mul(u.ambTop.g.mul(1.5).add(u.sunColor.g.mul(0.04)));

      // Reflection: the planar reflection for the lake, the sky for the stream.
      const rdir = reflect(v, n);
      let refl = sky.sampleSky(normalize(vec3(rdir.x, max(rdir.y, 0.02), rdir.z)));
      if (reflection) {
        reflection.uvNode = reflection.uvNode.add(n.xz.mul(0.06));
        refl = reflection.rgb;
      }
      const glint = pow(saturate(dot(rdir, u.sunDir)), 700).mul(60)
        .add(pow(saturate(dot(rdir, u.sunDir)), 80).mul(0.6));
      const through = float(1).sub(fres).mul(absorb);
      const col = deep.mul(float(1).sub(fres)).mul(float(1).sub(absorb)).add(refl.mul(fres)).add(u.sunColor.mul(glint));
      return vec4(col.mul(edge), float(1).sub(through).mul(edge));
    })();
    return m;
  }

  _streamGeometry(stream) {
    // A ribbon along the stream in 1 m steps, wide enough to meet the banks; the surface follows
    // the bed profile down to the lake.
    const pts = stream.pts;
    const samples = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const steps = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az)));
      for (let k = 0; k < steps; k++) samples.push([ax + ((bx - ax) * k) / steps, az + ((bz - az) * k) / steps]);
    }
    samples.push(pts[pts.length - 1]);
    const half = stream.width * 0.5 + 0.8;
    const pos = [], uvs = [], idx = [];
    let along = 0;
    for (let i = 0; i < samples.length; i++) {
      const [x, z] = samples[i];
      const [px, pz] = samples[Math.max(0, i - 1)], [nx, nz] = samples[Math.min(samples.length - 1, i + 1)];
      let dx = nx - px, dz = nz - pz;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      if (i > 0) along += Math.hypot(x - samples[i - 1][0], z - samples[i - 1][1]);
      const y = streamWaterAt(x, z);
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
