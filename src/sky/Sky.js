// Sky, clouds and aerial perspective.
//
//  1. A small sky-view LUT (Hillaire 2020) holds the clear-sky radiance for every view direction
//     relative to the sun. It's recomputed each frame (it's tiny).
//  2. A half-resolution pass composites that LUT with the sun and moon discs, stars, a raymarched
//     cumulus layer and a cirrus sheet. The scene background samples it.
//  3. A fog node gives every surface wavelength-dependent aerial perspective plus a low haze layer,
//     tinted from the same LUT so distant hills melt into the sky at the horizon.

import * as THREE from 'three/webgpu';
import {
  Fn, uniform, texture, texture3D, uv, screenUV, vec2, vec3, vec4, float, Loop, If, Break,
  sin, cos, acos, asin, sqrt, exp, abs, max, min, clamp, mix, dot, normalize, length, smoothstep,
  sign, pow, saturate, positionWorld, cameraPosition, output, hash, fract, floor, select, step, PI,
} from 'three/tsl';
import {
  R_GROUND, R_TOP, CAMERA_ALT_KM, RAYLEIGH_SCATTER, RAYLEIGH_H, MIE_SCATTER, MIE_EXTINCT, MIE_H,
  MIE_G, OZONE_ABSORB, SUN_ILLUMINANCE, MS_FACTOR, HAZE_H, HAZE_SCALE,
} from './Atmosphere.js';
import { makeWeatherTexture, makeCloudDetailTexture } from '../util/textures.js';

const LUT_W = 192, LUT_H = 108;
const _m = new THREE.Matrix4();
const CLOUD_BOTTOM = 1400, CLOUD_TOP = 2900, CIRRUS_ALT = 7500;
const V3 = (a) => vec3(a[0], a[1], a[2]);

export class Sky {
  constructor(renderer) {
    this.renderer = renderer;

    this.u = {
      sunDir: uniform(new THREE.Vector3(0, 1, 0)),
      sunColor: uniform(new THREE.Color(1, 1, 1)), // transmitted sun irradiance at the ground
      moonDir: uniform(new THREE.Vector3(0, 1, 0)),
      moonColor: uniform(new THREE.Color(0, 0, 0)),
      night: uniform(0),
      haze: uniform(0.35),
      cloudCover: uniform(0.45),
      cloudDensity: uniform(1),
      cirrus: uniform(0.5),
      windOffset: uniform(new THREE.Vector2()),
      cirrusOffset: uniform(new THREE.Vector2()),
      ambTop: uniform(new THREE.Color(0.3, 0.4, 0.6)),
      ambBottom: uniform(new THREE.Color(0.15, 0.17, 0.2)),
      invViewProj: uniform(new THREE.Matrix4()),
      camPos: uniform(new THREE.Vector3()),
      frame: uniform(0),
      time: uniform(0),
    };

    this.weatherTex = makeWeatherTexture();
    this.detailTex = makeCloudDetailTexture();

    this.lutRT = new THREE.RenderTarget(LUT_W, LUT_H, { type: THREE.HalfFloatType, depthBuffer: false });
    this.lutRT.texture.minFilter = this.lutRT.texture.magFilter = THREE.LinearFilter;
    this.lutRT.texture.wrapS = this.lutRT.texture.wrapT = THREE.ClampToEdgeWrapping;
    // Each frame blends a fresh (jittered, noisy) raymarch into the reprojected previous frame,
    // which converges to smooth clouds within a few frames. skyRTs[0] is written, then copied into
    // skyRTs[1] to serve as next frame's history.
    this.skyRTs = [0, 1].map(() => {
      const rt = new THREE.RenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false });
      rt.texture.minFilter = rt.texture.magFilter = THREE.LinearFilter;
      return rt;
    });
    this.skyRT = this.skyRTs[0];
    this.prevViewProj = uniform(new THREE.Matrix4());
    this.historyWeight = uniform(0);
    this.rtSize = uniform(new THREE.Vector2(2, 2));

    this.lutQuad = new THREE.QuadMesh(this._lutMaterial());
    this.skyQuad = new THREE.QuadMesh(this._skyMaterial());
    this.resolutionScale = 0.5;

    this.backgroundNode = this._backgroundNode();
    this.fogNode = this._fogNode();
  }

  // ---------------------------------------------------------------------------------------------
  // Shared TSL pieces

  _densities(h) {
    const u = this.u;
    const r = exp(h.negate().div(RAYLEIGH_H));
    const m = exp(h.negate().div(MIE_H)).add(u.haze.mul(HAZE_SCALE).mul(exp(h.negate().div(HAZE_H))));
    const o = max(float(0), float(1).sub(abs(h.sub(25)).div(15)));
    return { r, m, o };
  }

  _extinction(h) {
    const { r, m, o } = this._densities(h);
    return V3(RAYLEIGH_SCATTER).mul(r).add(m.mul(MIE_EXTINCT)).add(V3(OZONE_ABSORB).mul(o));
  }

  /** Sample the sky-view LUT for a world-space direction. */
  sampleSky(dir) {
    const u = this.u;
    const sxz = normalize(vec2(u.sunDir.x, u.sunDir.z).add(vec2(1e-5, 0)));
    const dxz = normalize(vec2(dir.x, dir.z).add(vec2(0, 1e-5)));
    const U = acos(clamp(dot(dxz, sxz), -1, 1)).div(PI);
    const el = asin(clamp(dir.y, -1, 1));
    const l = sqrt(abs(el).div(PI.mul(0.5))).mul(sign(el));
    const V = l.mul(0.5).add(0.5);
    return texture(this.lutRT.texture, vec2(U, V)).rgb;
  }

  // ---------------------------------------------------------------------------------------------
  // 1. Sky-view LUT

  _lutMaterial() {
    const u = this.u;
    const node = Fn(() => {
      const p = uv();
      const azim = p.x.mul(PI);
      const l = p.y.mul(2).sub(1);
      const el = l.mul(abs(l)).mul(PI.mul(0.5));
      const dir = vec3(cos(el).mul(cos(azim)), sin(el), cos(el).mul(sin(azim))).toVar();
      const sunEl = asin(clamp(u.sunDir.y, -1, 1));
      const sun = vec3(cos(sunEl), sin(sunEl), 0).toVar();

      const oy = float(R_GROUND + CAMERA_ALT_KM);
      // Ray-sphere tests from (0, oy, 0).
      const b = oy.mul(dir.y);
      const cG = oy.mul(oy).sub(R_GROUND * R_GROUND);
      const dG = b.mul(b).sub(cG);
      const tGround = b.negate().sub(sqrt(max(dG, 0)));
      const cT = oy.mul(oy).sub(R_TOP * R_TOP);
      const tTop = b.negate().add(sqrt(max(b.mul(b).sub(cT), 0)));
      const tMax = select(dG.greaterThan(0).and(tGround.greaterThan(0)), tGround, tTop);

      const STEPS = 28;
      const dt = tMax.div(STEPS);
      const cosV = dot(dir, sun);
      const pr = float(3 / (16 * Math.PI)).mul(cosV.mul(cosV).add(1));
      const g = MIE_G, g2 = g * g;
      const pm = float((3 / (8 * Math.PI)) * (1 - g2) / (2 + g2)).mul(cosV.mul(cosV).add(1))
        .div(pow(float(1 + g2).sub(cosV.mul(2 * g)), 1.5));

      const L = vec3(0).toVar();
      const T = vec3(1).toVar();
      Loop(STEPS, ({ i }) => {
        const s = float(i).add(0.5).mul(dt);
        const pos = vec3(dir.x.mul(s), oy.add(dir.y.mul(s)), dir.z.mul(s)).toVar();
        const rr = length(pos);
        const h = rr.sub(R_GROUND).toVar();
        const mu = dot(pos, sun).div(rr).toVar();

        // Transmittance toward the sun: a short march, faded out as the sun drops below the
        // local horizon.
        const bs = rr.mul(mu);
        const tS = bs.negate().add(sqrt(max(bs.mul(bs).sub(rr.mul(rr).sub(R_TOP * R_TOP)), 0)));
        const od = vec3(0).toVar();
        const LS = 6;
        const dts = tS.div(LS);
        Loop(LS, ({ i: j }) => {
          const ss = float(j).add(0.5).mul(dts);
          const q = pos.add(sun.mul(ss));
          od.addAssign(this._extinction(length(q).sub(R_GROUND)).mul(dts));
        });
        const horizonMu = sqrt(max(float(1).sub(float(R_GROUND).div(rr).pow(2)), 0)).negate();
        const vis = saturate(mu.sub(horizonMu).div(0.03).add(1));
        const ts = exp(od.negate()).mul(vis);

        const { r: dr, m: dm } = this._densities(h);
        const sr = V3(RAYLEIGH_SCATTER).mul(dr);
        const sm = dm.mul(MIE_SCATTER);
        const single = sr.mul(pr).add(vec3(sm.mul(pm))).mul(ts);
        const ms = sr.add(vec3(sm)).mul(ts.mul(MS_FACTOR / (4 * Math.PI)).add(max(u.sunDir.y.add(0.2), 0).mul(0.002)));
        const ext = max(this._extinction(h), vec3(1e-6));
        const stepT = exp(ext.mul(dt).negate());
        L.addAssign(T.mul(single.add(ms)).mul(vec3(1).sub(stepT)).div(ext));
        T.mulAssign(stepT);
      });
      return vec4(L.mul(SUN_ILLUMINANCE), 1);
    })();
    const m = new THREE.NodeMaterial();
    m.fragmentNode = node;
    m.depthTest = m.depthWrite = false;
    return m;
  }

  // ---------------------------------------------------------------------------------------------
  // 2. Sky + clouds composite

  _cloudShape(p, hf) {
    const u = this.u;
    const w = texture(this.weatherTex, p.xz.add(u.windOffset).div(17000));
    const w2 = texture(this.weatherTex, p.xz.add(u.windOffset.mul(1.25)).div(5600).add(vec2(0.31, 0.17)));
    const base = w.r.mul(0.85).add(w2.g.sub(0.5).mul(0.2));
    const cov = u.cloudCover;
    const shape = saturate(base.sub(float(1).sub(cov)).div(0.32));
    const bottom = smoothstep(0.0, 0.14, hf);
    // Flat bases, rounded tops whose height grows with the cloud's core.
    const topH = pow(shape, 0.6).mul(0.85).add(0.1);
    const top = pow(saturate(float(1).sub(hf.div(max(topH, 0.01)).pow(2))), 0.35);
    return shape.mul(bottom).mul(top);
  }

  _skyMaterial() {
    const u = this.u;
    const hg = (g, c) => float(1 - g * g).div(pow(float(1 + g * g).sub(c.mul(2 * g)), 1.5).mul(4 * Math.PI));

    const node = Fn(() => {
      const suv = screenUV;
      const ndc = vec2(suv.x.mul(2).sub(1), float(1).sub(suv.y.mul(2)));
      const wp = u.invViewProj.mul(vec4(ndc, 0.5, 1));
      const dir = normalize(wp.xyz.div(wp.w).sub(u.camPos)).toVar();

      const sky = this.sampleSky(dir).toVar();
      const night = u.night;
      // Faint airglow so the night sky isn't pure black.
      sky.addAssign(vec3(0.0012, 0.002, 0.0045).mul(night).mul(smoothstep(-0.2, 0.4, dir.y).mul(0.6).add(0.4)));

      // Sun disc with limb darkening. Its radiance is clamped to keep bloom well behaved.
      const cosSun = dot(dir, u.sunDir);
      const SUN_R = 0.0085;
      const sunMask = smoothstep(Math.cos(SUN_R * 1.08), Math.cos(SUN_R * 0.92), cosSun);
      const limb = sqrt(saturate(float(1).sub(acos(min(cosSun, 1)).div(SUN_R).pow(2)))).mul(0.6).add(0.4);
      const sunDisc = vec3(u.sunColor).mul(sunMask).mul(limb).mul(60).toVar();

      const cosMoon = dot(dir, u.moonDir);
      const moonGlow = vec3(0.35, 0.42, 0.6).mul(pow(saturate(cosMoon), 600).mul(0.02)).mul(night);
      const extras = sunDisc.add(moonGlow).toVar();
      // Alpha carries how much of the space behind (stars, moon) shows through the clouds.
      const see = float(1).toVar();

      // --- Cirrus: a thin sheet sampled once, streaked along the wind.
      const rC = float(R_GROUND * 1000);
      const camY = u.camPos.y;
      const oy = rC.add(camY);
      const bb = oy.mul(dir.y);
      const tCirrus = bb.negate().add(sqrt(max(bb.mul(bb).sub(oy.mul(oy).sub(rC.add(CIRRUS_ALT).pow(2))), 0)));
      const cp = u.camPos.xz.add(dir.xz.mul(tCirrus)).add(u.cirrusOffset);
      const c1 = texture(this.weatherTex, cp.mul(vec2(1 / 26000, 1 / 9000))).b;
      const c2 = texture(this.weatherTex, cp.mul(vec2(1 / 7000, 1 / 2600)).add(0.5)).b;
      const cirrusD = saturate(c1.mul(0.7).add(c2.mul(0.45)).sub(float(1).sub(u.cirrus.mul(0.55))).mul(3.0))
        .mul(smoothstep(0.0, 0.08, dir.y)).mul(smoothstep(0.0, 0.08, u.cirrus)).toVar();
      const cosV = dot(dir, u.sunDir);
      const cirrusCol = u.sunColor.mul(hg(0.6, cosV).mul(0.8).add(0.12)).add(u.ambTop.mul(0.5));
      const cirrusA = cirrusD.mul(0.75);
      sky.assign(mix(sky, cirrusCol.mul(cirrusD.mul(0.9).add(0.1)), cirrusA.mul(float(1).sub(night.mul(0.7)))));
      extras.mulAssign(float(1).sub(cirrusA.mul(0.8)));
      see.mulAssign(float(1).sub(cirrusA.mul(0.8)));

      // --- Cumulus: raymarch between two spherical shells.
      const result = vec3(sky).toVar();
      If(dir.y.greaterThan(-0.02).and(u.cloudCover.greaterThan(0.01)), () => {
        const cB = oy.mul(oy).sub(rC.add(CLOUD_BOTTOM).pow(2));
        const cT = oy.mul(oy).sub(rC.add(CLOUD_TOP).pow(2));
        const t0 = bb.negate().add(sqrt(max(bb.mul(bb).sub(cB), 0)));
        const t1 = bb.negate().add(sqrt(max(bb.mul(bb).sub(cT), 0)));
        const tEnd = min(t1, t0.add(22000));
        const STEPS = 56;
        const dt = tEnd.sub(t0).div(STEPS).toVar();
        // Interleaved gradient noise, offset each frame, so the accumulation sees a fresh sample.
        // Interleaved gradient noise per pixel, advanced by the golden ratio each frame, so the
        // history accumulates evenly stratified samples.
        const px = floor(screenUV.mul(this.rtSize));
        const ign = fract(float(52.9829189).mul(fract(px.x.mul(0.06711056).add(px.y.mul(0.00583715)))));
        const jitter = fract(ign.add(u.frame.mul(0.618034))).toVar();
        const t = t0.add(dt.mul(jitter)).toVar();
        const T = float(1).toVar();
        const S = vec3(0).toVar();
        const sigma = u.cloudDensity.mul(0.009);
        const phase = mix(hg(0.75, cosV), hg(-0.2, cosV), 0.35).toVar();
        const phase2 = mix(hg(0.35, cosV), hg(-0.1, cosV), 0.3).toVar();
        const detailScroll = vec3(u.windOffset.x, 0, u.windOffset.y).mul(1.6);

        Loop(STEPS, () => {
          const p = u.camPos.add(dir.mul(t)).toVar();
          const alt = p.y.sub(p.xz.dot(p.xz).div(rC.mul(2)));
          const hf = saturate(alt.sub(CLOUD_BOTTOM).div(CLOUD_TOP - CLOUD_BOTTOM)).toVar();
          const d = this._cloudShape(p, hf).toVar();
          If(d.greaterThan(0.002), () => {
            const n = texture3D(this.detailTex, p.add(detailScroll).div(2600)).r;
            const n2 = texture3D(this.detailTex, p.add(detailScroll).div(950)).r;
            d.assign(saturate(d.sub(n.mul(0.4).add(n2.mul(0.14)).mul(float(1).sub(d.mul(0.6)))).div(0.8)));
          });
          If(d.greaterThan(0.001), () => {
            // Light: three taps toward the sun.
            const od = float(0).toVar();
            const taps = [[110, 110], [330, 220], [800, 480]];
            for (const [dist, len] of taps) {
              const q = p.add(u.sunDir.mul(dist));
              const qa = q.y.sub(q.xz.dot(q.xz).div(rC.mul(2)));
              const qh = saturate(qa.sub(CLOUD_BOTTOM).div(CLOUD_TOP - CLOUD_BOTTOM));
              od.addAssign(this._cloudShape(q, qh).mul(len));
            }
            od.mulAssign(sigma);
            // Single scattering plus a two-octave stand-in for multiple scattering, which is what
            // makes real cumulus bright white on the sunny side and soft grey underneath.
            const single = exp(od.negate()).mul(phase);
            const multi = exp(od.mul(-0.35)).mul(0.75).add(exp(od.mul(-0.1)).mul(0.25)).mul(phase2.mul(0.5).add(0.2));
            const powder = float(1).sub(exp(d.mul(sigma).mul(-400))).mul(0.5).add(0.5);
            const amb = mix(u.ambBottom, u.ambTop, hf).mul(float(0.6).add(hf.mul(0.6)));
            const lum = u.sunColor.mul(single.add(multi)).mul(powder).add(amb).add(u.moonColor.mul(exp(od.negate())).mul(0.3));
            const ext = d.mul(sigma);
            const stepT = exp(ext.mul(dt).negate());
            S.addAssign(lum.mul(T).mul(float(1).sub(stepT)));
            T.mulAssign(stepT);
          });
          t.addAssign(dt);
          If(T.lessThan(0.015), () => { Break(); });
        });

        // Distant clouds sink into the haze at the horizon.
        const fade = exp(t0.negate().div(38000)).mul(smoothstep(-0.02, 0.06, dir.y));
        const cloudA = float(1).sub(T).mul(fade);
        const cloudCol = S.div(max(float(1).sub(T), 1e-4));
        result.assign(mix(sky, cloudCol, cloudA));
        extras.mulAssign(float(1).sub(cloudA));
        see.mulAssign(float(1).sub(cloudA));
      });

      const fresh = result.add(extras);
      // Reproject: where was this direction on screen last frame?
      const pc = this.prevViewProj.mul(vec4(dir, 0));
      const puv = vec2(pc.x.div(pc.w).mul(0.5).add(0.5), float(0.5).sub(pc.y.div(pc.w).mul(0.5)));
      const inside = pc.w.greaterThan(0).and(puv.x.greaterThan(0)).and(puv.x.lessThan(1)).and(puv.y.greaterThan(0)).and(puv.y.lessThan(1));
      const hist = texture(this.skyRTs[1].texture, puv);
      const w = select(inside, this.historyWeight, float(0));
      return mix(vec4(fresh, see), hist, w);
    })();

    const m = new THREE.NodeMaterial();
    m.fragmentNode = node;
    m.depthTest = m.depthWrite = false;
    return m;
  }

  /** Full-resolution background: the half-res sky plus crisp stars and moon behind the clouds. */
  _backgroundNode() {
    const u = this.u;
    return Fn(() => {
      const sky = texture(this.skyRT.texture, screenUV).toVar();
      const ndc = vec2(screenUV.x.mul(2).sub(1), float(1).sub(screenUV.y.mul(2)));
      const wp = u.invViewProj.mul(vec4(ndc, 0.5, 1));
      const dir = normalize(wp.xyz.div(wp.w).sub(u.camPos)).toVar();
      const night = u.night;

      // Stars: one candidate per cell of a 3D grid, jittered inside the cell, drawn as a tiny disc.
      const SCALE = 520;
      const p = dir.mul(SCALE);
      const cell = floor(p);
      // Integer spatial hash, so every cell (including negative ones) gets its own seed.
      const ci = cell.add(1024);
      const seed = ci.x.toUint().mul(73856093).bitXor(ci.y.toUint().mul(19349663)).bitXor(ci.z.toUint().mul(83492791));
      const h0 = hash(seed), h1 = hash(seed.add(1)), h2 = hash(seed.add(2)), h3 = hash(seed.add(3));
      const center = cell.add(vec3(h1, h2, h3).mul(0.7).add(0.15));
      const d = length(p.sub(center));
      const mag = pow(fract(h0.mul(91.7)), 6);
      const twinkle = sin(u.time.mul(2.3).add(h0.mul(300))).mul(0.25).add(0.75);
      const star = float(1).sub(smoothstep(0.15, 0.55, d)).mul(step(0.9, h0)).mul(mag.mul(0.9).add(0.05)).mul(twinkle);
      const starCol = mix(vec3(1.0, 0.82, 0.65), vec3(0.72, 0.84, 1.0), h1);
      const horizonFade = smoothstep(0.0, 0.2, dir.y);
      const stars = starCol.mul(star).mul(0.05).mul(night).mul(horizonFade);

      // Moon: a disc with some mottling.
      const cosMoon = dot(dir, u.moonDir);
      const moonMask = smoothstep(Math.cos(0.0105), Math.cos(0.0095), cosMoon);
      const mt = texture(this.weatherTex, dir.xz.sub(u.moonDir.xz).mul(22).add(0.5));
      const moon = vec3(0.92, 0.94, 1.0).mul(mt.a.mul(0.5).add(mt.b.mul(0.3)).add(0.45)).mul(moonMask).mul(night).mul(0.35);

      return vec4(sky.rgb.add(stars.add(moon).mul(sky.a)), 1);
    })();
  }

  // ---------------------------------------------------------------------------------------------
  // 3. Aerial perspective for scene surfaces

  _fogNode() {
    const u = this.u;
    return Fn(() => {
      const v = positionWorld.sub(cameraPosition);
      const dist = length(v);
      const d = v.div(max(dist, 1e-3));
      // Rayleigh in 1/m, gives distant hills their blue cast.
      const odR = V3(RAYLEIGH_SCATTER).mul(dist.mul(0.001));
      // Low haze layer: exponential in height, integrated analytically along the ray.
      const H = float(120);
      const sigma0 = float(1.2e-5).add(u.haze.mul(u.haze).mul(5.0e-3));
      const k = d.y.mul(dist).div(H);
      const integ = select(abs(k).greaterThan(1e-3), float(1).sub(exp(k.negate())).div(k), float(1));
      const odH = sigma0.mul(exp(max(cameraPosition.y, 0).negate().div(H))).mul(dist).mul(integ);
      const T = exp(odR.add(vec3(odH)).negate());
      const hdir = normalize(vec3(d.x, max(d.y, 0.035), d.z));
      const fogCol = this.sampleSky(hdir).add(vec3(0.0012, 0.002, 0.0045).mul(u.night));
      return vec4(mix(fogCol, output.rgb, T), output.a);
    })();
  }

  // ---------------------------------------------------------------------------------------------

  setSize(w, h) {
    const sw = Math.max(2, Math.floor(w * this.resolutionScale)), sh = Math.max(2, Math.floor(h * this.resolutionScale));
    for (const rt of this.skyRTs) rt.setSize(sw, sh);
    this.rtSize.value.set(sw, sh);
    this.historyWeight.value = 0;
  }

  /** Drop the history, e.g. after a big jump in time of day or weather. */
  resetHistory() {
    this.historyWeight.value = 0;
  }

  render(camera) {
    const u = this.u;
    u.invViewProj.value.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
    u.camPos.value.setFromMatrixPosition(camera.matrixWorld);
    u.frame.value = (u.frame.value + 1) % 64;
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.lutRT);
    this.lutQuad.render(r);
    const [cur, hist] = this.skyRTs;
    r.setRenderTarget(cur);
    this.skyQuad.render(r);
    r.setRenderTarget(prev);
    r.copyTextureToTexture(cur.texture, hist.texture);
    // Rotation-only view-projection, for reprojecting directions next frame.
    _m.copy(camera.matrixWorldInverse).setPosition(0, 0, 0);
    this.prevViewProj.value.multiplyMatrices(camera.projectionMatrix, _m);
    this.historyWeight.value = 0.94;
  }
}
