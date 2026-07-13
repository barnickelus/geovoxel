// Owns the set of loaded voxel chunks and their lifecycle (create, mesh, dispose).

export const CHUNK_SIZE = 32;

export class ChunkManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.chunks = new Map(); // key: "x,y,z" -> Chunk
  }

  static keyFor(cx, cy, cz) {
    return `${cx},${cy},${cz}`;
  }

  has(cx, cy, cz) {
    return this.chunks.has(ChunkManager.keyFor(cx, cy, cz));
  }

  get(cx, cy, cz) {
    return this.chunks.get(ChunkManager.keyFor(cx, cy, cz));
  }

  create(cx, cy, cz, voxelData) {
    const key = ChunkManager.keyFor(cx, cy, cz);
    const chunk = { cx, cy, cz, voxelData, mesh: null };
    this.chunks.set(key, chunk);
    return chunk;
  }

  dispose(cx, cy, cz) {
    const key = ChunkManager.keyFor(cx, cy, cz);
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    if (chunk.mesh) this.renderer.removeMesh(chunk.mesh);
    this.chunks.delete(key);
  }

  clear() {
    for (const key of Array.from(this.chunks.keys())) {
      const [cx, cy, cz] = key.split(',').map(Number);
      this.dispose(cx, cy, cz);
    }
  }
}
