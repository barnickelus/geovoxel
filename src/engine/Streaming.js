// Loads/unloads chunks around a moving viewpoint based on render distance.

export class Streaming {
  constructor(chunkManager, { radius = 4, chunkWorldSize = 32 } = {}) {
    this.chunkManager = chunkManager;
    this.radius = radius;
    this.chunkWorldSize = chunkWorldSize;
    this.center = { cx: 0, cz: 0 };
    this._running = false;
  }

  start() {
    this._running = true;
    this.update(0, 0);
  }

  stop() {
    this._running = false;
  }

  worldToChunk(x, z) {
    return {
      cx: Math.floor(x / this.chunkWorldSize),
      cz: Math.floor(z / this.chunkWorldSize),
    };
  }

  update(worldX, worldZ) {
    if (!this._running) return;
    const { cx, cz } = this.worldToChunk(worldX, worldZ);
    this.center = { cx, cz };

    const wanted = new Set();
    for (let dx = -this.radius; dx <= this.radius; dx++) {
      for (let dz = -this.radius; dz <= this.radius; dz++) {
        if (dx * dx + dz * dz > this.radius * this.radius) continue;
        wanted.add(`${cx + dx},${cz + dz}`);
      }
    }

    // Request load for anything wanted but not yet present.
    for (const key of wanted) {
      const [wx, wz] = key.split(',').map(Number);
      if (!this.chunkManager.has(wx, 0, wz)) {
        this.requestLoad(wx, wz);
      }
    }

    // Unload anything present but no longer wanted.
    for (const key of this.chunkManager.chunks.keys()) {
      const [lx, , lz] = key.split(',').map(Number);
      if (!wanted.has(`${lx},${lz}`)) {
        this.chunkManager.dispose(lx, 0, lz);
      }
    }
  }

  requestLoad(cx, cz) {
    // Hook for the app to wire up async fetch + Voxelizer.voxelize + ChunkManager.create.
  }
}
