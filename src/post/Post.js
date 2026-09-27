// Post chain: exposure → bloom → (photo mode depth of field) → tone mapping → vignette. Exposure is
// applied before bloom so the bloom threshold means the same thing at noon and at midnight.

import * as THREE from 'three/webgpu';
import { pass, uniform, vec3, vec4, float, screenUV, smoothstep, length, mix, renderOutput } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';

export class Post {
  constructor(renderer, scene, camera, sky) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.sky = sky;
    this.exposure = uniform(1);
    this.indoor = uniform(0);
    // Depth of field (photo mode): focus distance and how far either side stays sharp, in m.
    this.focus = uniform(20);
    this.focalLength = uniform(12);
    this.bokeh = uniform(3);
    this.pipeline = new THREE.RenderPipeline(renderer);
    this.pipeline.outputColorTransform = false;
    this.msaa = null;
    this.dof = null;
    this.configure({ msaa: true, dof: false });
  }

  /** Rebuild the chain for MSAA on/off and depth of field on/off (a brief shader compile). */
  configure({ msaa = this.msaa, dof: useDof = this.dof }) {
    if (msaa === this.msaa && useDof === this.dof) return;
    if (msaa !== this.msaa) {
      this.scenePass?.dispose();
      this.scenePass = pass(this.scene, this.camera, { samples: msaa ? 4 : 0 });
    }
    this.msaa = msaa;
    this.dof = useDof;
    const scenePass = this.scenePass;

    const hdr = scenePass.getTextureNode('output').mul(this.exposure);
    const bl = bloom(hdr, 1, 0.55, 0.85);
    if (this.bloomStrength) bl.strength.value = this.bloomStrength.value;
    this.bloomStrength = bl.strength;
    let lit = hdr.add(bl);
    if (useDof) lit = dof(lit, scenePass.getViewZNode(), this.focus, this.focalLength, this.bokeh);

    // Night vision: colors drain toward a cool blue as the eye shifts to rod vision. Bright light
    // sources (lamps, windows) stay in color vision, and indoors lamplight keeps the eye in it.
    const lum = lit.r.mul(0.2126).add(lit.g.mul(0.7152)).add(lit.b.mul(0.0722));
    const rods = this.sky.u.night.mul(0.7).mul(float(1).sub(smoothstep(0.06, 0.3, lum))).mul(float(1).sub(this.indoor));
    const graded = mix(lit.rgb, vec3(0.55, 0.72, 1.0).mul(lum), rods);

    const mapped = renderOutput(graded);
    const vig = float(1).sub(smoothstep(0.45, 1.05, length(screenUV.sub(0.5).mul(1.35))).mul(0.3));
    this.pipeline.outputNode = vec4(mapped.rgb.mul(vig), 1);
    this.pipeline.needsUpdate = true;
  }

  render() {
    this.pipeline.render();
  }
}
