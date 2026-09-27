import * as THREE from 'three/webgpu';
import { Settings } from './core/Settings.js';
import { Input } from './core/Input.js';
import { Sky } from './sky/Sky.js';
import { Lighting } from './sky/Lighting.js';
import { Terrain } from './world/Terrain.js';
import { Water } from './world/Water.js';
import { GroundMaps } from './world/GroundMaps.js';
import { Grass } from './world/Grass.js';
import { Vegetation } from './world/Vegetation.js';
import { makeMaterials } from './world/Kit.js';
import { HobbitHoles } from './world/Holes.js';
import { Buildings } from './world/Buildings.js';
import { GreenDragon } from './world/GreenDragon.js';
import { Shrubs } from './world/Shrubs.js';
import { Boundaries } from './world/Boundaries.js';
import { Player } from './player/Player.js';
import { Post } from './post/Post.js';
import { Hud } from './ui/Hud.js';
import { LAYERS, setLayer } from './core/Layers.js';
import { LampLight } from './world/LampLight.js';
import { Smoke } from './world/Smoke.js';
import { Wildlife } from './world/Wildlife.js';

// The shadow passes draw everything with one shared depth material, copying each mesh's alphaTest
// onto it. Material's setter bumps the version whenever alphaTest crosses zero, and a version change
// makes Three.js rebuild the cache key of every later draw with that material: thousands per frame.
// Each draw's pipeline already bakes in its own alphaTest when first built, so the bump is unneeded.
const alphaTest = Object.getOwnPropertyDescriptor(THREE.Material.prototype, 'alphaTest');
Object.defineProperty(THREE.Material.prototype, 'alphaTest', {
  ...alphaTest,
  set(v) {
    if (this.isShadowPassMaterial) this._alphaTest = v;
    else alphaTest.set.call(this, v);
  },
});

export class App {
  async init(container, progress) {
    this.settings = new Settings();

    const renderer = (this.renderer = new THREE.WebGPURenderer({ antialias: false, powerPreference: 'high-performance' }));
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(innerWidth, innerHeight);
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);
    await renderer.init();
    if (!renderer.backend.isWebGPUBackend) throw new Error('WebGPU is required');

    const scene = (this.scene = new THREE.Scene());
    const camera = (this.camera = new THREE.PerspectiveCamera(this.settings.fov, innerWidth / innerHeight, 0.1, 9000));

    progress('Painting the sky');
    await tick();
    this.sky = new Sky(renderer);
    scene.backgroundNode = this.sky.backgroundNode;
    scene.fogNode = this.sky.fogNode;
    this.lighting = new Lighting(scene, this.sky, this.settings);
    this.lampLight = new LampLight(this.sky);

    progress('Raising the Hill');
    await tick();
    this.terrain = new Terrain(this.lampLight);
    scene.add(this.terrain.group);
    this.maps = new GroundMaps(this.terrain);
    this.water = new Water(this.sky, this.terrain.groundNoise, this.maps);
    scene.add(this.water.group);

    progress('Growing the grass');
    await tick();
    this.grass = new Grass(this.maps, this.sky, this.lampLight);
    scene.add(this.grass.group);
    for (const l of [LAYERS.NO_REFLECT, LAYERS.DETAIL, LAYERS.TERRAIN]) camera.layers.enable(l);

    progress('Planting the trees');
    await tick();
    this.vegetation = new Vegetation(this.sky, this.terrain.groundNoise, this.lampLight);
    scene.add(this.vegetation.group);

    progress('Digging the hobbit holes');
    await tick();
    this.mats = makeMaterials(this.sky, this.terrain.groundNoise, this.lampLight);
    this.shrubs = new Shrubs(this.vegetation);
    this.greenDragon = new GreenDragon(this.mats, this.shrubs, { sky: this.sky, lighting: this.lighting, noiseTex: this.terrain.groundNoise });
    scene.add(this.greenDragon.group);
    this.holes = new HobbitHoles(this.mats, this.shrubs);
    scene.add(this.holes.group);
    this.boundaries = new Boundaries(this.mats, this.shrubs);
    scene.add(this.boundaries.group);
    setLayer(this.boundaries.group, LAYERS.DETAIL);
    scene.add(this.shrubs.build());
    setLayer(this.shrubs.group, LAYERS.DETAIL);
    this.buildings = new Buildings(this.mats);
    scene.add(this.buildings.group);
    // Smoke from about half the chimneys, always the inn's hearth and Bag End.
    const chimneys = [this.greenDragon.chimneys[0], this.holes.chimneys[0]];
    [...this.greenDragon.chimneys.slice(1), ...this.holes.chimneys.slice(3), ...this.buildings.chimneys].forEach((c, i) => {
      const h = Math.sin(i * 12.9898 + 4.1) * 43758.5453;
      if (h - Math.floor(h) < 0.5) chimneys.push(c);
    });
    this.smoke = new Smoke(chimneys, this.sky, this.terrain.groundNoise);
    scene.add(this.smoke.mesh);
    this.wildlife = new Wildlife(this.maps, this.sky);
    scene.add(this.wildlife.group);
    this.lampLight.bake([...this.holes.lanterns, ...this.greenDragon.lamps, ...this.buildings.lamps], this.terrain.heights);
    // Alpha-tested meshes (leaves, thatch fringe) draw after the opaque ones, which also lets the
    // GPU's hidden-surface removal cull more of what's behind them.
    scene.traverse((o) => {
      if (o.isMesh && o.material?.alphaTest > 0) o.renderOrder = 1;
    });
    // The world doesn't move: compute its matrices once instead of every frame (except the turning
    // mill wheel).
    const moving = new Set();
    this.buildings.wheel.traverse((o) => moving.add(o));
    for (const g of [this.terrain.group, this.water.group, this.grass.group, this.vegetation.group, this.greenDragon.group, this.holes.group, this.boundaries.group, this.shrubs.group, this.buildings.group]) {
      g.updateMatrixWorld(true);
      g.traverse((o) => {
        if (moving.has(o)) return;
        o.matrixAutoUpdate = false;
        o.matrixWorldAutoUpdate = false;
      });
    }


    this.input = new Input(renderer.domElement);
    this.player = new Player(camera, this.input);
    this.player.colliders.push(...this.vegetation.colliders, ...this.holes.colliders, ...this.buildings.colliders, ...this.greenDragon.colliders);
    const s = this.settings;
    if (s.cam) this.player.setPose(s.cam[0], s.cam[1], s.cam[2], s.cam[3], s.cam[4]);
    if (s.fly) this.player.fly = true;

    this.post = new Post(renderer, scene, camera, this.sky);
    this.hud = new Hud(this);

    addEventListener('resize', () => this.resize());
    this.resize();

    progress('Compiling shaders');
    this.player.update(0);
    this.lighting.update(0, camera);
    this.grass.update(0, camera, this.settings, renderer);
    this.vegetation.update(0, this.settings, camera);
    await renderer.compileAsync(scene, camera);
    // Warm up behind the loading screen, so nothing hitches the first time it comes into view: one
    // frame with nothing culled and every tree detail level shown gives every mesh its buffers,
    // bindings and pipelines in every pass, then a frame toward each heading settles the rest.
    const culled = [];
    scene.traverse((o) => {
      if (o.isMesh && o.frustumCulled) {
        o.frustumCulled = false;
        culled.push(o);
      }
    });
    this.vegetation.showAll(true);
    this.sky.render(camera);
    this.post.render();
    await tick();
    this.vegetation.showAll(false);
    for (const o of culled) o.frustumCulled = true;
    const yaw = this.player.yaw;
    for (let k = 1; k <= 6; k++) {
      this.player.yaw = yaw + (k * Math.PI) / 3;
      this.player.update(0);
      this.camera.updateMatrixWorld();
      this.lighting.update(0, camera);
      this.vegetation.update(0, this.settings, camera);
      this.sky.render(camera);
      this.post.render();
      await tick();
    }
    this.player.update(0);
    this.clock = new THREE.Timer();
    renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    this.sky.setSize(w * pr, h * pr);
    if (this.lighting.csm.camera) this.lighting.csm.updateFrustums();
  }

  frame() {
    // In the background (window not focused), idle along at a few frames a second to save power.
    if (!this.settings.shot && !document.hasFocus()) {
      const now = performance.now();
      if (now - (this.idleAt || 0) < 200) return;
      this.idleAt = now;
    }
    this.clock.update();
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const s = this.settings;
    s.time = (s.time + (s.timeSpeed * dt) / 60 + 24) % 24;
    this.hud.handleKeys(this.input);

    this.player.update(dt);
    this.camera.updateMatrixWorld();
    this.lighting.update(dt, this.camera);
    this.grass.update(dt, this.camera, s, this.renderer);
    this.vegetation.update(dt, s, this.camera);
    this.buildings.update(dt);
    this.lampLight.update(dt);
    this.smoke.update(dt, s);
    this.wildlife.update(dt);
    this.greenDragon.interior.update(dt);
    // Eyes adjust indoors: inside the common room, exposure moves toward the room's own level.
    const inside = this.greenDragon.interior.inside(this.camera.position.x, this.camera.position.z) && this.camera.position.y < this.greenDragon.interior.y + 2.6;
    this.lighting.indoor = inside ? 1 : 0;
    this.water.update(dt, s);
    this.post.exposure.value = this.lighting.finalExposure();
    this.post.indoor.value = this.lighting.indoorMix;
    this.post.bloomStrength.value = s.bloom;

    this.sky.render(this.camera);
    this.post.render();
    this.hud.update(dt);
    this.input.endFrame();
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));
