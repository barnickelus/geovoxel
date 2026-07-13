// Fetches building and road vector data from the Overpass API for a bounding box.

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

export class OpenStreetMap {
  constructor({ endpoint = OVERPASS_ENDPOINT, tileCache } = {}) {
    this.endpoint = endpoint;
    this.tileCache = tileCache;
  }

  async fetchBoundingBox(south, west, north, east) {
    const cacheKey = `osm:${south},${west},${north},${east}`;
    const cached = this.tileCache && await this.tileCache.get(cacheKey);
    if (cached) return cached;

    const query = `
      [out:json][timeout:25];
      (
        way["building"](${south},${west},${north},${east});
        way["highway"](${south},${west},${north},${east});
      );
      out body;
      >;
      out skel qt;
    `;

    const response = await fetch(this.endpoint, {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!response.ok) throw new Error(`Overpass request failed: ${response.status}`);

    const data = await response.json();
    const parsed = OpenStreetMap.parse(data);

    if (this.tileCache) await this.tileCache.set(cacheKey, parsed);
    return parsed;
  }

  static parse(osmJson) {
    const nodes = new Map();
    const buildings = [];
    const roads = [];

    for (const el of osmJson.elements) {
      if (el.type === 'node') nodes.set(el.id, [el.lon, el.lat]);
    }

    for (const el of osmJson.elements) {
      if (el.type !== 'way') continue;
      const points = el.nodes.map((id) => nodes.get(id)).filter(Boolean);

      if (el.tags?.building) {
        buildings.push({ points, tags: el.tags });
      } else if (el.tags?.highway) {
        roads.push({ points, tags: el.tags });
      }
    }

    return { buildings, roads };
  }
}
