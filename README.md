# The Shire

A first-person walk through Hobbiton, built procedurally in the browser with Three.js (WebGPU + TSL).
No models, textures or sound files are downloaded: the terrain, sky, clouds, hobbit holes, the Green
Dragon and the ambient sound are all generated in code.

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
| Tab | Settings |
| P | Photo mode |
| M | Mute |
| ` | FPS readout |

## Settings

- **Graphics presets:** Low, Medium, High (the default) and Ultra. You can also adjust each setting
  on its own: render scale, sharpness on high-DPI screens, MSAA, shadow detail, how far the grass
  reaches, tree detail distance, sky and cloud resolution, and lake reflections.
- **Time and weather:** time of day, how fast time passes, clouds, haze and wind.
- **View, controls and sound:** field of view, mouse sensitivity, invert Y, frame rate readout,
  volume and mute.
- Graphics, view and sound settings are saved in the browser. Time and weather reset on each visit.
- If frames run slowly, a one-time hint suggests a lighter preset.

## Photo mode

Press **P** to open photo mode:

- The camera flies freely, time stops, and the interface hides.
- You can adjust field of view, tilt, time of day, exposure and depth of field. There's a button
  that focuses on whatever is in the centre of the view.
- **Enter** saves a PNG at screen size or double size. **H** hides the panel.

## Sound

The ambient sound is synthesized with Web Audio and starts on your first click:

- Wind that gusts, and gets louder the higher you fly.
- Birdsong by day, with a dawn chorus. Crickets and a tawny owl at night.
- Lapping at the lake shore, and running water by the stream and the mill wheel.
- The fire in the Green Dragon's hearth.
- Footsteps on grass, gravel lanes and stone.

Outdoor sounds are muffled inside the inn.

## URL options

`?time=19.2&clouds=0.5&cirrus=0.6&haze=0.4&ev=0.5&fov=70&quality=low&cam=x,y,z,yaw,pitch&fly`

## Deploying

`npm run build` writes a static site to `dist/`. It uses relative paths, so it works from any
subfolder. `.github/workflows/deploy.yml` builds it and publishes to GitHub Pages on every push to
`main`. To use it, set the repository's **Settings → Pages → Source** to *GitHub Actions*.

## Accuracy and data

The layout is built from real geodata, not guesswork:

- **Terrain:** LINZ NZ 8 m DEM around the set, plus an 80 m grid out to the surrounding hills
  (via OpenTopoData). The real hill, valley floor and lake bowl.
- **Features:** OpenStreetMap: the lake (Bywater Pool) and Frog Pond shorelines, Mill Run and Eel Brook,
  every named lane (Bagshot Row, Hill Lane, Gully, Woody End, Lakeside, Merry Meander, Bywater Road,
  Gandalf's Cutting…), hedges, fences, woods, the Mill, the Green Dragon, the Bywater Bridge, the
  Party Tree and Bag End's oak.
- **Hobbit holes:** 41 of the set's 44. Bag End and the Bagshot Row holes are at their mapped spots;
  the rest are placed along the real lanes, dug into the banks, wherever a full mound fits without a
  path crossing it. No public dataset records each hole's exact
  position, so those are placed by rule. `docs/holes-map.svg` shows them over the OSM map.
- **Sun:** the set's latitude (37.86°S), midsummer. Bag End faces east-south-east, so the evening sun
  sets behind the Hill.

Research notes are in `docs/hobbiton-reference.md`. To refresh the data:
`python3 scripts/fetch_dem.py set && python3 scripts/fetch_dem.py wide && python3 scripts/build_geodata.py`
(the OSM extract in `data/osm_raw.json` comes from an Overpass query; see the reference doc).

Attribution: map data © OpenStreetMap contributors (ODbL); elevation © LINZ (CC BY 4.0).

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
| `src/world/Buildings.js` | The double-arched bridge and the Mill with its turning waterwheel |
| `src/world/GreenDragon.js`, `Interior.js` | The Green Dragon inn, inside and out |
| `src/world/Surroundings.js`, `Farmland.js` | The porch, hut, market stalls and livestock by the inn; the paddocks beyond |
| `src/world/Wildlife.js`, `Smoke.js` | Butterflies and fireflies; chimney smoke |
| `src/sky/Atmosphere.js` | Rayleigh/Mie/ozone atmosphere (Hillaire 2020), evaluated on CPU and GPU |
| `src/sky/Sky.js` | Sky-view LUT, raymarched cumulus + cirrus with temporal accumulation, stars, aerial perspective |
| `src/sky/Lighting.js` | Sun/moon light with cascaded shadows, sky ambient, auto exposure |
| `src/post/Post.js` | Exposure, bloom, night grading, AgX tone mapping |
| `src/player/Player.js` | First-person walker and free camera |
| `src/audio/Ambience.js` | Synthesized ambient sound and footsteps |
| `src/ui/` | Start overlay and HUD, the settings panel, photo mode |
| `src/core/Settings.js` | Settings, quality presets, saved preferences |

Dev tools (dev server must be running):

- `npm run shot -- <name> "<query>"` renders headless WebGPU screenshots into `shots/`.
- `node scripts/bench.mjs "<query>" "label=<js>" ...` A/B frame times inside one page, uncapped.
- `node scripts/profile.mjs "<query>"` CPU profile of the render loop.
- `node scripts/ui.mjs` runs through the start overlay, settings presets and photo mode in headless
  Chrome and takes screenshots.
