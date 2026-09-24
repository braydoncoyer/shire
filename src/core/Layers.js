// Render layers, so each pass draws only what it needs:
//   main camera       BASE, NO_REFLECT, DETAIL, TERRAIN
//   lake reflection   BASE, TERRAIN
//   sun shadow maps   BASE, SHADOW_ONLY, DETAIL
export const LAYERS = {
  BASE: 0,
  NO_REFLECT: 1, // grass, flowers, water: main view only
  SHADOW_ONLY: 2, // the low-resolution terrain that casts the hills' shadows
  DETAIL: 3, // shrubs, hedges, fences, vegetables: main view and shadows, not reflected
  TERRAIN: 4, // the full-resolution terrain: main view and reflection, but no shadow casting
};

export function setLayer(object, layer) {
  object.traverse((o) => o.layers.set(layer));
}
