// Builds terrain voxels from an elevation heightmap.

import { Voxelizer } from './Voxelizer.js';

export const VOXEL_TERRAIN = 1;

export class Terrain {
  constructor(elevationSampler) {
    this.elevationSampler = elevationSampler; // Elevation instance, provides sampleHeight(lat, lon)
  }

  rasterize(grid, chunkOrigin, size) {
    for (let x = 0; x < size; x++) {
      for (let z = 0; z < size; z++) {
        const worldX = chunkOrigin.x + x;
        const worldZ = chunkOrigin.z + z;
        const height = this.elevationSampler.sampleHeight(worldX, worldZ);
        const localHeight = Math.round(height - chunkOrigin.y);
        const top = Math.min(Math.max(localHeight, 0), size);
        for (let y = 0; y < top; y++) {
          grid[Voxelizer.index(x, y, z, size)] = VOXEL_TERRAIN;
        }
      }
    }
  }
}
