// Samples terrain elevation for world coordinates, backed by a remote elevation API and TileCache.

const DEFAULT_ENDPOINT = 'https://api.opentopodata.org/v1/srtm90m';

export class Elevation {
  constructor({ endpoint = DEFAULT_ENDPOINT, tileCache, projection } = {}) {
    this.endpoint = endpoint;
    this.tileCache = tileCache;
    this.projection = projection; // { toLatLon(x, z) -> [lat, lon] }
    this.heightCache = new Map(); // in-memory quantized lookups between async refreshes
  }

  async fetchHeights(latLonPairs) {
    const locations = latLonPairs.map(([lat, lon]) => `${lat},${lon}`).join('|');
    const cacheKey = `elevation:${locations}`;
    const cached = this.tileCache && await this.tileCache.get(cacheKey);
    if (cached) return cached;

    const response = await fetch(`${this.endpoint}?locations=${encodeURIComponent(locations)}`);
    if (!response.ok) throw new Error(`Elevation request failed: ${response.status}`);

    const data = await response.json();
    const heights = data.results.map((r) => r.elevation);

    if (this.tileCache) await this.tileCache.set(cacheKey, heights);
    return heights;
  }

  // Synchronous lookup for use inside the voxelizer hot path; relies on prefetched cache data.
  sampleHeight(worldX, worldZ) {
    const key = `${Math.round(worldX)},${Math.round(worldZ)}`;
    return this.heightCache.get(key) ?? 0;
  }

  setHeight(worldX, worldZ, height) {
    const key = `${Math.round(worldX)},${Math.round(worldZ)}`;
    this.heightCache.set(key, height);
  }
}
