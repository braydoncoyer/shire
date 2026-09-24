# The Shire

A first-person walk through Hobbiton, built procedurally in the browser with Three.js (WebGPU + TSL).
No models or textures are downloaded: terrain, sky, clouds and (soon) the hobbit holes are all generated
in code.

## Running

```sh
npm install
npm run dev      # http://127.0.0.1:5190
```

Needs a browser with WebGPU (recent Chrome, Edge or Safari).

## Controls

| Key | Action |
|---|---|
| Click | Capture the mouse (Esc releases) |
| W A S D | Walk |
| Shift | Run |
| Space | Jump |
| F | Toggle free-fly camera (Q/E down/up) |
| [ ] | Time of day −/+ 15 minutes |
| ` | FPS readout |

## URL options

`?time=19.2&clouds=0.5&cirrus=0.6&haze=0.4&ev=0.5&cam=x,y,z,yaw,pitch&fly`

## How it's built

| Folder | Contents |
|---|---|
| `src/world/Layout.js` | The Hobbiton layout (landmarks, lanes, stream) and the height function |
| `src/world/Terrain.js` | 1 m heightfield over the set plus a stretched outer ring to the horizon |
| `src/world/Grass.js` | GPU-driven grass, reeds and wildflowers: compute placement + culling, indirect draws |
| `src/world/TreeGen.js`, `Vegetation.js` | Procedural oaks, poplars and willows; instanced placement with wind |
| `src/world/Water.js` | Lake with planar reflection, refraction and depth tint; the flowing stream |
| `src/world/Kit.js` | Procedural building materials (fieldstone, plaster, planks, shingles, brick, lit glass) and a merge-per-material builder |
| `src/world/Holes.js` | Hobbit holes (and Bag End) generated along the lanes: facades in turf domes, round doors, gardens, fences |
| `src/world/Buildings.js` | The double-arched bridge, the Mill with its turning waterwheel, the Green Dragon |
| `src/sky/Atmosphere.js` | Rayleigh/Mie/ozone atmosphere (Hillaire 2020), evaluated on CPU and GPU |
| `src/sky/Sky.js` | Sky-view LUT, raymarched cumulus + cirrus with temporal accumulation, stars, aerial perspective |
| `src/sky/Lighting.js` | Sun/moon light with cascaded shadows, sky ambient, auto exposure |
| `src/post/Post.js` | Exposure, bloom, night grading, AgX tone mapping |
| `src/player/Player.js` | First-person walker and free camera |

Dev tools (dev server must be running):

- `npm run shot -- <name> "<query>"` renders headless WebGPU screenshots into `shots/`.
- `node scripts/bench.mjs "<query>" "label=<js>" ...` A/B frame times inside one page, uncapped.
- `node scripts/profile.mjs "<query>"` CPU profile of the render loop.
