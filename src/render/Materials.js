// Voxel type -> material appearance mapping.

import * as THREE from 'three';
import { VOXEL_TERRAIN } from '../engine/Terrain.js';
import { VOXEL_BUILDING } from '../engine/Buildings.js';
import { VOXEL_ROAD } from '../engine/Roads.js';

export const VOXEL_COLORS = {
  [VOXEL_TERRAIN]: 0x4a7c3f,
  [VOXEL_BUILDING]: 0x9a9a9a,
  [VOXEL_ROAD]: 0x2b2b2b,
};

export function createVoxelMaterial() {
  return new THREE.MeshLambertMaterial({ vertexColors: true });
}

export function colorForVoxel(voxelId) {
  return VOXEL_COLORS[voxelId] || 0xff00ff; // magenta = unknown voxel type, easy to spot
}
