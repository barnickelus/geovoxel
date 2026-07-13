// Greedy meshing: merges coplanar same-type voxel faces into larger quads to cut triangle count.

import { colorForVoxel } from './Materials.js';

const FACE_DIRS = [
  { axis: 0, dir: 1, normal: [1, 0, 0] },
  { axis: 0, dir: -1, normal: [-1, 0, 0] },
  { axis: 1, dir: 1, normal: [0, 1, 0] },
  { axis: 1, dir: -1, normal: [0, -1, 0] },
  { axis: 2, dir: 1, normal: [0, 0, 1] },
  { axis: 2, dir: -1, normal: [0, 0, -1] },
];

export class GreedyMesher {
  static voxelAt(grid, size, x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= size || y >= size || z >= size) return 0;
    return grid[x + y * size + z * size * size];
  }

  // Returns { positions, normals, colors, indices } typed-array buffers ready for a BufferGeometry.
  static mesh(grid, size) {
    const positions = [];
    const normals = [];
    const colors = [];
    const indices = [];

    for (const face of FACE_DIRS) {
      GreedyMesher.meshFace(grid, size, face, positions, normals, colors, indices);
    }

    return {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      colors: new Float32Array(colors),
      indices: new Uint32Array(indices),
    };
  }

  static meshFace(grid, size, face, positions, normals, colors, indices) {
    const { axis, dir, normal } = face;
    const u = (axis + 1) % 3;
    const v = (axis + 2) % 3;
    const mask = new Int32Array(size * size);

    for (let d = 0; d < size; d++) {
      // Build a 2D mask of visible boundary faces at this slice.
      for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
          const pos = [0, 0, 0];
          pos[axis] = d;
          pos[u] = i;
          pos[v] = j;

          const here = GreedyMesher.voxelAt(grid, size, pos[0], pos[1], pos[2]);
          const neighborPos = [...pos];
          neighborPos[axis] += dir;
          const neighbor = GreedyMesher.voxelAt(grid, size, neighborPos[0], neighborPos[1], neighborPos[2]);

          mask[i * size + j] = here !== 0 && neighbor === 0 ? here : 0;
        }
      }

      GreedyMesher.sweepMask(mask, size, d, axis, u, v, dir, normal, positions, normals, colors, indices);
    }
  }

  static sweepMask(mask, size, d, axis, u, v, dir, normal, positions, normals, colors, indices) {
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; ) {
        const voxelId = mask[i * size + j];
        if (!voxelId) { j++; continue; }

        // Grow width along j.
        let width = 1;
        while (j + width < size && mask[i * size + j + width] === voxelId) width++;

        // Grow height along i while every cell in the row matches.
        let height = 1;
        outer:
        while (i + height < size) {
          for (let k = 0; k < width; k++) {
            if (mask[(i + height) * size + j + k] !== voxelId) break outer;
          }
          height++;
        }

        GreedyMesher.emitQuad(d, i, j, width, height, axis, u, v, dir, normal, voxelId, positions, normals, colors, indices);

        for (let hi = 0; hi < height; hi++) {
          for (let wj = 0; wj < width; wj++) {
            mask[(i + hi) * size + j + wj] = 0;
          }
        }

        j += width;
      }
    }
  }

  static emitQuad(d, i, j, width, height, axis, u, v, dir, normal, voxelId, positions, normals, colors, indices) {
    const base = [0, 0, 0];
    base[axis] = d + (dir > 0 ? 1 : 0);
    base[u] = i;
    base[v] = j;

    const du = [0, 0, 0]; du[u] = height;
    const dv = [0, 0, 0]; dv[v] = width;

    const p00 = base;
    const p10 = [base[0] + du[0], base[1] + du[1], base[2] + du[2]];
    const p11 = [base[0] + du[0] + dv[0], base[1] + du[1] + dv[1], base[2] + du[2] + dv[2]];
    const p01 = [base[0] + dv[0], base[1] + dv[1], base[2] + dv[2]];

    const startIndex = positions.length / 3;
    const quad = dir > 0 ? [p00, p10, p11, p01] : [p00, p01, p11, p10];

    const color = colorForVoxel(voxelId);
    const r = ((color >> 16) & 0xff) / 255;
    const g = ((color >> 8) & 0xff) / 255;
    const b = (color & 0xff) / 255;

    for (const p of quad) {
      positions.push(p[0], p[1], p[2]);
      normals.push(normal[0], normal[1], normal[2]);
      colors.push(r, g, b);
    }

    indices.push(startIndex, startIndex + 1, startIndex + 2, startIndex, startIndex + 2, startIndex + 3);
  }
}
