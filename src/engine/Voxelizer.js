// Rasterizes geographic data (terrain, buildings, roads) into a chunk's voxel grid.

import { CHUNK_SIZE } from './ChunkManager.js';

export class Voxelizer {
  constructor() {
    this.layers = []; // ordered list of { rasterize(grid, chunkOrigin) } producers
  }

  addLayer(layer) {
    this.layers.push(layer);
    return this;
  }

  createEmptyGrid(size = CHUNK_SIZE) {
    return new Uint8Array(size * size * size);
  }

  static index(x, y, z, size = CHUNK_SIZE) {
    return x + y * size + z * size * size;
  }

  voxelize(chunkOrigin, size = CHUNK_SIZE) {
    const grid = this.createEmptyGrid(size);
    for (const layer of this.layers) {
      layer.rasterize(grid, chunkOrigin, size);
    }
    return grid;
  }
}
