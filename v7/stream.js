(()=>{
'use strict';
const G=window.GeoVoxel;if(!G||G.failed)return;const S=G.state;
const lodFor=(dx,dz)=>{const d=Math.hypot(dx,dz);return d<.55?0:d<1.85?1:2};
const priority=(c,lod,upgrade)=>{
  const f=G.getFocus(),d=Math.hypot(c.cx-f.x/G.CFG.CHUNK,c.cz-f.z/G.CFG.CHUNK);
  if(upgrade&&lod===0)return 1+d*2.5;
  if(upgrade&&lod===1)return 5+d*3;
  return (d<.6?0:10)+d*4;
};
const sort=()=>{for(const q of S.queue)q.p=priority(q.c,q.lod,q.upgrade);S.queue.sort((a,b)=>a.p-b.p)};
G.enqueue=(c,lod,upgrade=false)=>{
  const alreadyGood=c.lod!=null&&c.lod<=lod&&!c.partial;
  if(!S.chunks.has(c.key)||c.loading||c.queued.has(lod)||alreadyGood)return;
  c.queued.add(lod);S.queue.push({c,lod,upgrade,p:priority(c,lod,upgrade)});sort();pump();updateStats();
};
const placeholder=c=>{const b=G.chunkBounds(c),g=new THREE.Group(),mat=new THREE.MeshStandardMaterial({color:0x769069,transparent:true,opacity:.38,roughness:1}),m=new THREE.Mesh(new THREE.BoxGeometry(G.CFG.CHUNK,.6,G.CFG.CHUNK),mat);m.position.set((b.minX+b.maxX)/2,-.35,(b.minZ+b.maxZ)/2);g.add(m);c.group.add(g);c.placeholder=g};
const makeChunk=(cx,cz,desired)=>{
  const key=G.chunkKey(cx,cz);let c=S.chunks.get(key);
  if(c){c.desired=desired;if(c.lod!=null&&desired<c.lod)G.enqueue(c,desired,true);return c}
  c={key,cx,cz,desired,lod:null,state:'new',group:new THREE.Group(),content:null,placeholder:null,source:null,sourcePromise:null,featureCount:0,queued:new Set(),loading:false,errorLod:null,partial:false};
  G.world.add(c.group);S.chunks.set(key,c);placeholder(c);G.enqueue(c,2,false);return c;
};
const pump=()=>{
  while(S.active<G.CFG.MAX_ACTIVE&&S.queue.length){
    const item=S.queue.shift(),c=item.c;c.queued.delete(item.lod);
    if(!S.chunks.has(c.key)||(c.lod!=null&&c.lod<=item.lod&&!c.partial)||c.loading)continue;
    c.loading=true;c.state='loading';S.active++;
    const generation=S.generation;
    G.status.textContent=c.lod==null?`Loading map tile ${c.key}…`:`Refining ${c.key} to ${['near','middle','far'][item.lod]} detail…`;
    G.loadChunkSource(c).then(source=>{
      if(generation!==S.generation||!S.chunks.has(c.key))return;
      G.renderChunk(c,source,item.lod);c.partial=false;
      if(c.placeholder){G.disposeObject(c.placeholder);c.placeholder=null}
      c.errorLod=null;G.$('#source').textContent=source.network?'tiles':'cache';
      G.status.textContent=S.queue.length?'Center detail is ready; surrounding chunks continue in the background.':'Streaming ready. Travel or fly and the voxel world will generate ahead.';
      if(c.desired<c.lod)G.enqueue(c,c.desired,true);
    }).catch(error=>{
      console.warn('Chunk source failed',c.key,error);
      if(generation===S.generation&&S.chunks.has(c.key)){
        if(!c.content){
          try{G.renderChunk(c,G.emptySource?.()||{buildings:[],roads:[],rails:[],waterLines:[],areas:[],network:false},item.lod);c.partial=true;if(c.placeholder){G.disposeObject(c.placeholder);c.placeholder=null}}catch(renderError){console.error('Terrain fallback failed',renderError)}
        }
        c.errorLod=item.lod;c.state=c.lod==null?'error':'ready';
        G.status.textContent=`Map data timed out for ${c.key}; terrain remains usable. Tap Retry to load streets and buildings.`;
      }
    }).finally(()=>{c.loading=false;S.active=Math.max(0,S.active-1);updateStats();setTimeout(pump,90)});
  }
};
G.desiredChunks=()=>{const focus=G.getFocus(),base=Number(G.$('#radius').value)||1,radius=Math.min(4,base+(S.flightExtra||0)),cx=Math.round(focus.x/G.CFG.CHUNK),cz=Math.round(focus.z/G.CFG.CHUNK),items=[];for(let dx=-radius;dx<=radius;dx++)for(let dz=-radius;dz<=radius;dz++)items.push({dx,dz,d:Math.hypot(dx,dz),lod:lodFor(dx,dz)});items.sort((a,b)=>a.d-b.d);for(const q of items)makeChunk(cx+q.dx,cz+q.dz,q.lod);const unload=radius+2;for(const[k,c]of[...S.chunks])if(Math.max(Math.abs(c.cx-cx),Math.abs(c.cz-cz))>unload){S.totalFeatures-=c.featureCount||0;G.disposeObject(c.group);S.chunks.delete(k)}S.queue=S.queue.filter(q=>S.chunks.has(q.c.key));sort();pump();return{cx,cz}};
const updateStats=G.updateStats=()=>{let ready=0,fail=0;const l=[0,0,0];for(const c of S.chunks.values()){if(c.lod!=null){ready++;l[c.lod]++}if(c.errorLod!=null)fail++}G.$('#loaded').textContent=ready;G.$('#queued').textContent=S.queue.length+S.active;G.$('#features').textContent=Math.max(0,S.totalFeatures);if(fail)G.$('#source').textContent=`${fail} retry`;G.$('#lodread').textContent=`LOD: ${l[0]} near · ${l[1]} middle · ${l[2]} far`};
G.retry=()=>{let n=0;for(const c of S.chunks.values())if(c.errorLod!=null){const l=c.errorLod;c.errorLod=null;c.partial=true;c.source=null;G.enqueue(c,l,true);n++}G.toast(n?`Retrying ${n} tile${n===1?'':'s'}`:'No failed tiles')};
G.rebuild=()=>{S.generation++;S.queue=[];S.active=0;for(const c of S.chunks.values()){if(c.content){S.totalFeatures-=c.featureCount||0;G.disposeObject(c.content);c.content=null}c.featureCount=0;c.lod=null;c.partial=false;c.loading=false;c.queued.clear();c.errorLod=null;if(!c.placeholder)placeholder(c);G.enqueue(c,2,false)}updateStats();G.toast('Rebuilding visible chunks with the new voxel settings')};
G.startWorld=(lat,lon)=>{S.origin={lat,lon};S.baseElev=null;G.clearWorld();G.clearDataMemory();G.controls.target.set(0,8,0);S.lastCenterKey='';G.resetView();G.$('#osm').href=`https://www.openstreetmap.org/#map=18/${lat}/${lon}`;G.status.textContent='Loading the center first; terrain and buildings will appear independently.';G.desiredChunks();updateStats()};
G.updateStream=time=>{if(time-S.lastStream<340)return;S.lastStream=time;const c=G.desiredChunks(),key=`${c.cx},${c.cz}`;if(key!==S.lastCenterKey){S.lastCenterKey=key;const f=G.getFocus(),geo=G.worldToGeo(f.x,f.z);G.$('#coords').textContent=`Center ${geo.lat.toFixed(5)}, ${geo.lon.toFixed(5)} · chunk ${key}`;G.$('#osm').href=`https://www.openstreetmap.org/#map=18/${geo.lat}/${geo.lon}`;G.updateURL?.();updateStats()}};
G.pump=pump;
})();