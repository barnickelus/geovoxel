// Rasterizes OSM road centerlines into flat voxel ribbons following terrain elevation.

import { Voxelizer } from './Voxelizer.js';

export const VOXEL_ROAD = 3;
const DEFAULT_ROAD_WIDTH = 4; // meters

export class Roads {
  constructor(ways = [], elevationSampler) {
    this.ways = ways; // [{ points: [[x,z], ...], width }]
    this.elevationSampler = elevationSampler;
  }

  rasterize(grid, chunkOrigin, size) {
    for (const way of this.ways) {
      const width = way.width || DEFAULT_ROAD_WIDTH;
      for (let i = 0; i < way.points.length - 1; i++) {
        this.rasterizeSegment(grid, chunkOrigin, size, way.points[i], way.points[i + 1], width);
      }
    }
  }

  rasterizeSegment(grid, chunkOrigin, size, [ax, az], [bx, bz], width) {
    const halfWidth = width / 2;
    for (let x = 0; x < size; x++) {
      for (let z = 0; z < size; z++) {
        const worldX = chunkOrigin.x + x;
        const worldZ = chunkOrigin.z + z;
        const dist = Roads.distanceToSegment(worldX, worldZ, ax, az, bx, bz);
        if (dist > halfWidth) continue;

        const height = this.elevationSampler.sampleHeight(worldX, worldZ);
        const localY = Math.round(height - chunkOrigin.y);
        if (localY < 0 || localY >= size) continue;
        grid[Voxelizer.index(x, localY, z, size)] = VOXEL_ROAD;
      }
    }
  }

  static distanceToSegment(px, pz, ax, az, bx, bz) {
    const dx = bx - ax;
    const dz = bz - az;
    const lengthSq = dx * dx + dz * dz;
    let t = lengthSq === 0 ? 0 : ((px - ax) * dx + (pz - az) * dz) / lengthSq;
    t = Math.max(0, Math.min(1, t));
    const projX = ax + t * dx;
    const projZ = az + t * dz;
    return Math.hypot(px - projX, pz - projZ);
  }
}
