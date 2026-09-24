// Post chain: exposure → bloom → tone mapping → vignette. Exposure is applied before bloom so the
// bloom threshold means the same thing at noon and at midnight.

import * as THREE from 'three/webgpu';
import { pass, uniform, vec3, vec4, float, screenUV, smoothstep, length, mix, renderOutput } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

export class Post {
  constructor(renderer, scene, camera, sky) {
    this.exposure = uniform(1);

    const scenePass = (this.scenePass = pass(scene, camera, { samples: 4 }));
    const hdr = scenePass.getTextureNode('output').mul(this.exposure);
    const bl = (this.bloom = bloom(hdr, 1, 0.55, 0.85));
    this.bloomStrength = bl.strength;
    const lit = hdr.add(bl);

    // Night vision: colors drain toward a cool blue as the eye shifts to rod vision.
    const lum = lit.r.mul(0.2126).add(lit.g.mul(0.7152)).add(lit.b.mul(0.0722));
    const graded = mix(lit.rgb, vec3(0.55, 0.72, 1.0).mul(lum), sky.u.night.mul(0.7));

    const mapped = renderOutput(graded);
    const vig = float(1).sub(smoothstep(0.45, 1.05, length(screenUV.sub(0.5).mul(1.35))).mul(0.3));
    this.pipeline = new THREE.RenderPipeline(renderer);
    this.pipeline.outputColorTransform = false;
    this.pipeline.outputNode = vec4(mapped.rgb.mul(vig), 1);
  }

  render() {
    this.pipeline.render();
  }
}
