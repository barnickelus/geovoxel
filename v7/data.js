(()=>{
'use strict';
const G=window.GeoVoxel;if(!G||G.failed)return;
const S=G.state,C=G.CFG;
const TILEJSON='https://tiles.openfreemap.org/planet';
const FALLBACK_TEMPLATE='https://tiles.openfreemap.org/planet/{z}/{x}/{y}.pbf';
const terrainUrl=(x,y)=>`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${C.TERRAIN_Z}/${x}/${y}.png`;
S.vectorTiles=new Map();S.terrainTiles=new Map();S.vectorPromises=new Map();S.terrainPromises=new Map();
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const fetchTimed=async(url,options={},timeout=9000)=>{
  const ctrl=new AbortController();
  const parent=options.signal;
  const abort=()=>ctrl.abort();
  parent?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>ctrl.abort(),timeout);
  try{return await fetch(url,{...options,signal:ctrl.signal})}
  finally{clearTimeout(timer);parent?.removeEventListener('abort',abort)}
};
const openDB=()=>{if(!('indexedDB'in window))return Promise.reject();if(S.dbPromise)return S.dbPromise;S.dbPromise=new Promise((ok,no)=>{const r=indexedDB.open('geovoxel-v7',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('tiles'))r.result.createObjectStore('tiles')};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});return S.dbPromise};
const cacheGet=async key=>{try{const db=await openDB();return await new Promise((ok,no)=>{const r=db.transaction('tiles').objectStore('tiles').get(key);r.onsuccess=()=>{const v=r.result;ok(v&&Date.now()-v.time<C.CACHE_AGE?v.data:null)};r.onerror=()=>no(r.error)})}catch{return null}};
const cachePut=async(key,data)=>{try{const db=await openDB();await new Promise((ok,no)=>{const r=db.transaction('tiles','readwrite').objectStore('tiles').put({time:Date.now(),data},key);r.onsuccess=()=>ok();r.onerror=()=>no(r.error)})}catch{}};
const lonX=(lon,z)=>(lon+180)/360*2**z;
const latY=(lat,z)=>{const r=G.clamp(lat,-85.0511,85.0511)*Math.PI/180;return(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*2**z};
const range=(b,z)=>{const x0=Math.floor(lonX(b.lonMin,z)),x1=Math.floor(lonX(b.lonMax,z)),y0=Math.floor(latY(b.latMax,z)),y1=Math.floor(latY(b.latMin,z)),a=[];for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)a.push({x,y});return a};
G.geoBounds=c=>{const b=G.chunkBounds(c),a=G.worldToGeo(b.minX,b.minZ),d=G.worldToGeo(b.maxX,b.maxZ);return{latMin:Math.min(a.lat,d.lat),latMax:Math.max(a.lat,d.lat),lonMin:Math.min(a.lon,d.lon),lonMax:Math.max(a.lon,d.lon)}};
const tileTemplate=async()=>{
  if(S.tileTemplate)return S.tileTemplate;
  if(!S.tileJsonPromise)S.tileJsonPromise=(async()=>{
    try{
      const r=await fetchTimed(TILEJSON,{headers:{Accept:'application/json'}},6000);
      if(!r.ok)throw Error(`TileJSON ${r.status}`);
      const j=await r.json();
      if(!j.tiles?.[0])throw Error('TileJSON has no tile template');
      return S.tileTemplate=j.tiles[0];
    }catch(error){
      console.warn('TileJSON unavailable; using direct OpenFreeMap template',error);
      return S.tileTemplate=FALLBACK_TEMPLATE;
    }
  })().finally(()=>S.tileJsonPromise=null);
  return S.tileJsonPromise;
};
const getVector=async(z,x,y)=>{
  const key=`v:${z}/${x}/${y}`;
  if(S.vectorTiles.has(key))return S.vectorTiles.get(key);
  if(S.vectorPromises.has(key))return S.vectorPromises.get(key);
  const promise=(async()=>{
    let buf=await cacheGet(key),network=false;
    if(!buf){
      const tpl=await tileTemplate(),url=tpl.replace('{z}',z).replace('{x}',x).replace('{y}',y);
      const r=await fetchTimed(url,{headers:{Accept:'application/x-protobuf,application/vnd.mapbox-vector-tile,application/octet-stream'}},11000);
      if(!r.ok)throw Error(`Vector tile HTTP ${r.status}`);
      buf=await r.arrayBuffer();
      if(!buf.byteLength)throw Error('Vector tile was empty');
      cachePut(key,buf);network=true;
    }
    const parsed=G.parseVectorTile(G.decodeMVT(buf),z,x,y);parsed.network=network;
    S.vectorTiles.set(key,parsed);if(S.vectorTiles.size>80)S.vectorTiles.delete(S.vectorTiles.keys().next().value);
    return parsed;
  })().finally(()=>S.vectorPromises.delete(key));
  S.vectorPromises.set(key,promise);return promise;
};
const decodeTerrain=async blob=>{
  if(typeof createImageBitmap!=='function')throw Error('createImageBitmap unavailable');
  const bmp=await createImageBitmap(blob),c=document.createElement('canvas');c.width=C.TILE_PX;c.height=C.TILE_PX;
  const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(bmp,0,0,C.TILE_PX,C.TILE_PX);bmp.close?.();
  const d=x.getImageData(0,0,C.TILE_PX,C.TILE_PX).data,out=new Float32Array(C.TILE_PX*C.TILE_PX);
  for(let i=0,j=0;i<d.length;i+=4,j++)out[j]=d[i]*256+d[i+1]+d[i+2]/256-32768;
  return out;
};
const getTerrain=async(x,y)=>{
  const key=`t:${C.TERRAIN_Z}/${x}/${y}`;
  if(S.terrainTiles.has(key))return S.terrainTiles.get(key);
  if(S.terrainPromises.has(key))return S.terrainPromises.get(key);
  const promise=(async()=>{
    let data=await cacheGet(key);
    if(!data){
      try{const r=await fetchTimed(terrainUrl(x,y),{},6500);if(!r.ok)throw Error(`Terrain HTTP ${r.status}`);data=await decodeTerrain(await r.blob());cachePut(key,data)}
      catch(error){console.warn('Terrain tile unavailable; using flat fallback',key,error);data=null}
    }
    S.terrainTiles.set(key,data);if(S.terrainTiles.size>140)S.terrainTiles.delete(S.terrainTiles.keys().next().value);
    return data;
  })().finally(()=>S.terrainPromises.delete(key));
  S.terrainPromises.set(key,promise);return promise;
};
const ensureTerrain=async b=>{
  const tiles=range(b,C.TERRAIN_Z),ox=Math.floor(lonX(S.origin.lon,C.TERRAIN_Z)),oy=Math.floor(latY(S.origin.lat,C.TERRAIN_Z));
  await Promise.all([...tiles.map(t=>getTerrain(t.x,t.y)),getTerrain(ox,oy)]);
  if(S.baseElev==null){const o=S.origin;S.baseElev=G.elevationAbs(o.lat,o.lon)}
};
G.elevationAbs=(lat,lon)=>{const fx=lonX(lon,C.TERRAIN_Z),fy=latY(lat,C.TERRAIN_Z),tx=Math.floor(fx),ty=Math.floor(fy),data=S.terrainTiles.get(`t:${C.TERRAIN_Z}/${tx}/${ty}`);if(!data)return 0;const px=G.clamp((fx-tx)*C.TILE_PX-.5,0,C.TILE_PX-1.001),py=G.clamp((fy-ty)*C.TILE_PX-.5,0,C.TILE_PX-1.001),x0=Math.floor(px),y0=Math.floor(py),x1=Math.min(C.TILE_PX-1,x0+1),y1=Math.min(C.TILE_PX-1,y0+1),dx=px-x0,dy=py-y0,at=(x,y)=>data[y*C.TILE_PX+x];return at(x0,y0)*(1-dx)*(1-dy)+at(x1,y0)*dx*(1-dy)+at(x0,y1)*(1-dx)*dy+at(x1,y1)*dx*dy};
G.elevAtWorld=(x,z)=>{const p=G.worldToGeo(x,z);return G.elevationAbs(p.lat,p.lon)-(S.baseElev||0)};
G.voxelElev=(x,z,lod=0)=>{const raw=G.elevAtWorld(x,z),base=Number(G.$('#voxel').value)||2,step=lod===0?base:lod===1?Math.max(3,base*2):Math.max(8,base*4);return Math.round(raw/step)*step};
const mergeGroups=tiles=>{const out={buildings:[],roads:[],rails:[],waterLines:[],areas:[],network:false},seen=new Set();for(const g of tiles){out.network||=!!g.network;for(const k of['buildings','roads','rails','waterLines','areas'])for(const f of g[k]||[]){const id=`${k}:${f.id}`;if(seen.has(id))continue;seen.add(id);out[k].push(f)}}return out};
G.emptySource=()=>({buildings:[],roads:[],rails:[],waterLines:[],areas:[],network:false});
G.loadChunkSource=async c=>{
  if(c.source)return c.source;if(c.sourcePromise)return c.sourcePromise;
  const b=G.geoBounds(c);
  c.sourcePromise=(async()=>{
    const vtiles=range(b,C.VECTOR_Z);
    const terrain=ensureTerrain(b);
    const vectors=Promise.all(vtiles.map(t=>getVector(C.VECTOR_Z,t.x,t.y)));
    const vt=await vectors;
    await Promise.race([terrain,wait(4200)]).catch(()=>{});
    return c.source=mergeGroups(vt);
  })().finally(()=>c.sourcePromise=null);
  return c.sourcePromise;
};
G.clearDataMemory=()=>{S.vectorTiles.clear();S.terrainTiles.clear();S.vectorPromises.clear();S.terrainPromises.clear();S.tileTemplate=null;S.tileJsonPromise=null};
})();