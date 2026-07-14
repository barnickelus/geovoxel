# GeoVoxel v7

V7 is the modular continuation of the v6 vector-terrain experiment.

## Architecture

- `core.js` — Three.js scene, coordinate system, shared materials, fading and day/night.
- `mvt.js` — dependency-free Mapbox Vector Tile/PBF decoder.
- `data.js` — OpenFreeMap vector tiles, Terrarium elevation, IndexedDB and in-flight request deduplication.
- `render.js` — terraced voxel terrain, snapped buildings, road ribbons, instanced far buildings, trees, lamps and rooftop details.
- `stream.js` — center-focused LOD rings, coarse-first loading, refinement, unloading and crossfades.
- `flight.js` — pigeon chase/POV navigation whose position drives streaming.
- `ui.js` — place search, controls, share URLs and the render loop.

## LOD strategy

- Near: stepped terrain cells, snapped footprint extrusion, baked window facades, sidewalks, markings, trees, lamps and roof equipment.
- Middle: larger terrain cells and simplified box buildings/roads.
- Far: low-resolution terrain and instanced voxel building masses.

Source data is cached independently of render LOD, so changing detail or moving a tile inward does not redownload its vector data.
