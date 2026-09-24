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
import { Player } from './player/Player.js';
import { Post } from './post/Post.js';
import { Hud } from './ui/Hud.js';

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
    const camera = (this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 9000));

    progress('Painting the sky');
    await tick();
    this.sky = new Sky(renderer);
    scene.backgroundNode = this.sky.backgroundNode;
    scene.fogNode = this.sky.fogNode;
    this.lighting = new Lighting(scene, this.sky, this.settings);

    progress('Raising the Hill');
    await tick();
    this.terrain = new Terrain();
    scene.add(this.terrain.group);
    this.water = new Water(this.sky, this.terrain.groundNoise);
    scene.add(this.water.group);

    progress('Growing the grass');
    await tick();
    this.maps = new GroundMaps(this.terrain);
    this.grass = new Grass(this.maps, this.sky);
    scene.add(this.grass.group);
    camera.layers.enable(1);

    progress('Planting the trees');
    await tick();
    this.vegetation = new Vegetation(this.sky, this.terrain.groundNoise);
    scene.add(this.vegetation.group);

    this.input = new Input(renderer.domElement);
    this.player = new Player(camera, this.input);
    this.player.colliders.push(...this.vegetation.colliders);
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
    await renderer.compileAsync(scene, camera);
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
    this.clock.update();
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const s = this.settings;
    s.time = (s.time + (s.timeSpeed * dt) / 60 + 24) % 24;
    this.hud.handleKeys(this.input);

    this.player.update(dt);
    this.camera.updateMatrixWorld();
    this.lighting.update(dt, this.camera);
    this.grass.update(dt, this.camera, s, this.renderer);
    this.vegetation.update(dt, s);
    this.water.update(dt, s);
    this.post.exposure.value = this.lighting.finalExposure();
    this.post.bloomStrength.value = s.bloom;

    this.sky.render(this.camera);
    this.post.render();
    this.hud.update(dt);
    this.input.endFrame();
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));
