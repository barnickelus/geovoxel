// Extrudes OSM building footprints into voxel volumes.

import { Voxelizer } from './Voxelizer.js';

export const VOXEL_BUILDING = 2;
const DEFAULT_LEVEL_HEIGHT = 3; // meters per building level, used when height tag is absent

export class Buildings {
  constructor(footprints = []) {
    this.footprints = footprints; // [{ polygon: [[x,z], ...], height, baseElevation }]
  }

  static estimateHeight(tags) {
    if (tags.height) return parseFloat(tags.height);
    if (tags['building:levels']) return parseFloat(tags['building:levels']) * DEFAULT_LEVEL_HEIGHT;
    return DEFAULT_LEVEL_HEIGHT;
  }

  rasterize(grid, chunkOrigin, size) {
    for (const footprint of this.footprints) {
      const localTop = Math.round(footprint.baseElevation + footprint.height - chunkOrigin.y);
      const localBase = Math.round(footprint.baseElevation - chunkOrigin.y);
      const top = Math.min(Math.max(localTop, 0), size);
      const base = Math.min(Math.max(localBase, 0), size);

      for (let x = 0; x < size; x++) {
        for (let z = 0; z < size; z++) {
          const worldX = chunkOrigin.x + x;
          const worldZ = chunkOrigin.z + z;
          if (!Buildings.pointInPolygon(worldX, worldZ, footprint.polygon)) continue;
          for (let y = base; y < top; y++) {
            grid[Voxelizer.index(x, y, z, size)] = VOXEL_BUILDING;
          }
        }
      }
    }
  }

  static pointInPolygon(px, pz, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, zi] = polygon[i];
      const [xj, zj] = polygon[j];
      const intersects = (zi > pz) !== (zj > pz) &&
        px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi;
      if (intersects) inside = !inside;
    }
    return inside;
  }
}
