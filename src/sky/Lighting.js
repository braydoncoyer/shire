// Drives the sun/moon light, the hemisphere ambient, the sky uniforms and auto exposure from the
// time of day and weather settings.

import * as THREE from 'three/webgpu';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import { LAYERS } from '../core/Layers.js';
import { weatherU } from './Weather.js';
import { evaluateLighting, luminance } from './Atmosphere.js';
import { sunDirection, moonDirection } from './SunPosition.js';

const MOON_COLOR = [0.55, 0.68, 1.0];
const MOON_E = 0.028;
const INDOOR_EXPOSURE = 4.5;

export class Lighting {
  constructor(scene, sky, settings) {
    this.sky = sky;
    this.settings = settings;

    const light = (this.light = new THREE.DirectionalLight(0xffffff, 1));
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = 0.04;
    light.shadow.camera.near = 1;
    light.shadow.camera.far = 2000;
    // The shadow maps draw base geometry, detail and the terrain proxy (see core/Layers.js).
    light.shadow.camera.layers.set(LAYERS.BASE);
    light.shadow.camera.layers.enable(LAYERS.SHADOW_ONLY);
    light.shadow.camera.layers.enable(LAYERS.DETAIL);
    this.csm = new CSMShadowNode(light, { cascades: 4, maxFar: 420, mode: 'practical', lightMargin: 220 });
    this.csm.fade = true;
    light.shadow.shadowNode = this.csm;
    scene.add(light, light.target);

    this.hemi = new THREE.HemisphereLight(0x8899bb, 0x445522, 1);
    scene.add(this.hemi);

    this.sun = [0, 1, 0];
    this.moon = [0, 1, 0];
    this.cacheKey = '';
    this.exposure = 1;
    this.targetExposure = 1;
    this.indoor = 0;
    this.indoorMix = 0;
    this.info = null;
  }

  update(dt, camera) {
    const s = this.settings;
    const u = this.sky.u;
    sunDirection(s.time, s.sunAzimuth, this.sun);
    moonDirection(this.sun, this.moon);

    // The atmosphere integration is cheap, but skip it when nothing changed.
    const key = `${this.sun.map((v) => v.toFixed(4)).join()}|${s.haze.toFixed(3)}`;
    if (key !== this.cacheKey) {
      this.cacheKey = key;
      this.info = evaluateLighting(this.sun, s.haze);
    }
    const { sunColor, skyIrradiance } = this.info;

    const sunY = this.sun[1];
    const night = THREE.MathUtils.smoothstep(-sunY, 0.02, 0.2);
    // Clouds dim the direct sun a little overall and lift the diffuse light.
    const overcast = THREE.MathUtils.smoothstep(s.clouds, 0.55, 1.0);
    // Rain clouds put the sun out altogether.
    const sunDim = (1 - overcast * 0.75) * (1 - weatherU.rain.value * 0.8);

    u.sunDir.value.set(...this.sun);
    u.sunColor.value.setRGB(...sunColor);
    u.moonDir.value.set(...this.moon);
    u.moonColor.value.setRGB(...MOON_COLOR.map((c) => c * MOON_E * night));
    u.night.value = night;
    u.haze.value = s.haze;
    u.cloudCover.value = s.clouds;
    u.cloudDensity.value = s.cloudDensity;
    u.cirrus.value = s.cirrus;

    const nightAmb = [0.0035, 0.0055, 0.011].map((c) => c * night);
    const skyE = skyIrradiance.map((c, i) => c * (1 + overcast * 0.5) + nightAmb[i] * Math.PI);
    // Mean sky radiance lights the clouds from above; the ground bounce lights them from below.
    const groundAlbedo = [0.09, 0.13, 0.05];
    const sunOnGround = sunColor.map((c) => c * Math.max(sunY, 0) * sunDim);
    const groundE = groundAlbedo.map((a, i) => a * (sunOnGround[i] + skyE[i]));
    u.ambTop.value.setRGB(...skyE.map((c) => c / Math.PI));
    u.ambBottom.value.setRGB(...groundE.map((c, i) => c / Math.PI + skyE[i] / Math.PI * 0.25));

    this.hemi.color.setRGB(...skyE);
    this.hemi.groundColor.setRGB(...groundE);
    this.hemi.intensity = 1;

    // Directional light: the sun by day, the moon by night, crossfading through twilight.
    const light = this.light;
    const useMoon = sunY < -0.035;
    const dir = useMoon ? this.moon : this.sun;
    const col = useMoon ? MOON_COLOR.map((c) => c * MOON_E * night) : sunColor.map((c) => c * sunDim);
    const I = Math.max(col[0], col[1], col[2], 1e-6);
    light.color.setRGB(col[0] / I, col[1] / I, col[2] / I);
    light.intensity = I;
    light.position.set(dir[0] * 200, dir[1] * 200, dir[2] * 200);
    light.target.position.set(0, 0, 0);
    // Render the cascades at most once per frame (the water reflection pass reuses them). The two
    // near cascades update every frame; the two far ones, where a frame's lag can't be seen, take
    // turns. A cascade that skips a frame keeps the matrix it was drawn with, so it stays aligned.
    // Small detail (shrubs, fences, steps) is left out of the far cascades. All four render on the
    // first frames: a map first drawn after the scene has sampled it gets reallocated under bind
    // groups that still point at the old texture.
    this.frame = (this.frame || 0) + 1;
    this.csm.lights.forEach((l, i) => {
      l.shadow.autoUpdate = false;
      l.shadow.needsUpdate = i < 2 || this.frame < 4 || this.frame % 2 === i - 2;
      if (i >= 2) l.shadow.camera.layers.disable(LAYERS.DETAIL);
    });

    // Auto exposure from the expected brightness of a mid-grey lit surface. Adaptation is only
    // partial (the 0.8 power), like an eye: noon still reads brighter than dusk, and night darker.
    const Ldirect = luminance(col) * Math.max(dir[1], 0) * 0.75;
    const Lscene = (0.18 * (Ldirect + luminance(skyE))) / Math.PI;
    this.targetExposure = THREE.MathUtils.clamp(0.19 * Math.pow(Math.max(Lscene, 1e-6), -0.8), 0.05, 60);
    // Indoors (the Green Dragon), the eye adapts to the lamplit room instead.
    this.indoorMix += ((this.indoor || 0) - this.indoorMix) * (dt > 0 ? 1 - Math.exp(-dt * 3) : 1);
    this.targetExposure = Math.exp(Math.log(this.targetExposure) * (1 - this.indoorMix) + Math.log(INDOOR_EXPOSURE) * this.indoorMix);
    const k = dt > 0 ? 1 - Math.exp(-dt * 2.5) : 1;
    this.exposure += (this.targetExposure - this.exposure) * k;

    // Wind carries the clouds. The shaders add the offset to sample positions, so it runs backward.
    const wr = (s.windDir * Math.PI) / 180;
    const wx = Math.sin(wr) * s.windSpeed, wz = -Math.cos(wr) * s.windSpeed;
    u.windOffset.value.x -= wx * dt * 6;
    u.windOffset.value.y -= wz * dt * 6;
    u.cirrusOffset.value.x -= wx * dt * 9;
    u.cirrusOffset.value.y -= wz * dt * 9;
    u.time.value += dt;
  }

  finalExposure() {
    return this.exposure * Math.pow(2, this.settings.exposure);
  }
}
