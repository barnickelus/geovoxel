(()=>{
'use strict';
const G=window.GV;if(!G||G.failed)return;
G.openDB=()=>{
  if(!('indexedDB'in window))return Promise.reject(new Error('IndexedDB unavailable'));
  if(G.state.dbPromise)return G.state.dbPromise;
  G.state.dbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open('geovoxel-lod',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('chunks');
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  return G.state.dbPromise;
};
G.cacheGet=async key=>{
  try{
    const db=await G.openDB();
    return await new Promise((resolve,reject)=>{
      const req=db.transaction('chunks').objectStore('chunks').get(key);
      req.onsuccess=()=>{const v=req.result;resolve(v&&Date.now()-v.time<G.CACHE_AGE?v.data:null)};
      req.onerror=()=>reject(req.error);
    });
  }catch{return null}
};
G.cachePut=async(key,data)=>{
  try{
    const db=await G.openDB();
    await new Promise((resolve,reject)=>{
      const req=db.transaction('chunks','readwrite').objectStore('chunks').put({time:Date.now(),data},key);
      req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error);
    });
  }catch{}
};
G.bboxFor=c=>{
  const h=G.CHUNK/2+G.OVERLAP;
  const sw=G.worldToGeo(c.cx*G.CHUNK-h,c.cz*G.CHUNK-h),ne=G.worldToGeo(c.cx*G.CHUNK+h,c.cz*G.CHUNK+h);
  return{south:sw.lat,west:sw.lon,north:ne.lat,east:ne.lon};
};
G.queryFor=(b,lod)=>{
  const box=`${b.south},${b.west},${b.north},${b.east}`;
  if(lod===2)return`[out:json][timeout:8];(
    way["building"](${box});
    way["highway"~"motorway|trunk|primary|secondary|tertiary|residential|unclassified"](${box});
    way["natural"="water"](${box});
    way["waterway"](${box});
  );out tags geom qt;`;
  if(lod===1)return`[out:json][timeout:10];(
    way["building"](${box});
    way["highway"](${box});
    way["railway"](${box});
    way["waterway"](${box});
    way["natural"~"water|wood"](${box});
    way["landuse"~"grass|forest|meadow|recreation_ground|village_green|cemetery|reservoir|basin|commercial|retail|industrial"](${box});
    way["leisure"~"park|garden|pitch|playground"](${box});
  );out tags geom qt;`;
  return`[out:json][timeout:12];(
    way["building"](${box});
    relation["building"](${box});
    way["highway"](${box});
    way["railway"](${box});
    way["waterway"](${box});
    way["natural"~"water|wood"](${box});
    way["landuse"~"grass|forest|meadow|recreation_ground|village_green|cemetery|reservoir|basin|commercial|retail|industrial"](${box});
    way["leisure"~"park|garden|pitch|playground"](${box});
    node["natural"="tree"](${box});
    node["highway"="street_lamp"](${box});
  );out tags geom qt;`;
};
G.fetchEndpoint=async(url,query,timeout,signal,delay=0)=>{
  if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
  if(signal.aborted)throw new DOMException('Aborted','AbortError');
  const local=new AbortController(),abort=()=>local.abort();
  signal.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>local.abort(),timeout);
  try{
    const response=await fetch(url,{
      method:'POST',signal:local.signal,
      headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8',Accept:'application/json'},
      body:`data=${encodeURIComponent(query)}`
    });
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    if(!data||!Array.isArray(data.elements))throw new Error('Invalid map response');
    return data;
  }finally{
    clearTimeout(timer);signal.removeEventListener('abort',abort);
  }
};
G.requestMap=async(query,lod,controller)=>{
  const timeout=lod===0?13000:lod===1?10500:8000;
  const order=(G.state.requestCounter++%2)?G.SERVERS.slice().reverse():G.SERVERS.slice();
  const attempts=[
    G.fetchEndpoint(order[0],query,timeout,controller.signal,0),
    G.fetchEndpoint(order[1],query,timeout,controller.signal,650)
  ];
  try{return await Promise.any(attempts)}
  catch(error){throw(error&&error.errors&&error.errors[0])||error}
};
G.fetchChunk=async(c,lod,generation)=>{
  const b=G.bboxFor(c),key=`v4:${lod}:${b.south.toFixed(5)}:${b.west.toFixed(5)}:${b.north.toFixed(5)}:${b.east.toFixed(5)}`;
  const cached=await G.cacheGet(key);if(cached)return{data:cached,cached:true};
  const controller=new AbortController();c.controller=controller;
  const data=await G.requestMap(G.queryFor(b,lod),lod,controller);
  controller.abort();
  if(generation!==G.state.generation)throw new Error('stale generation');
  G.cachePut(key,data);return{data,cached:false};
};
})();
