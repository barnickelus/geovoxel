(()=>{
'use strict';
const G=window.GV;if(!G||G.failed)return;
const $=G.$,S=G.state;

G.setChunkVisualLod=(c,lod)=>{
  c.desiredLod=lod;
  const mat=lod===0?G.shared.groundNear:lod===1?G.shared.groundMid:G.shared.groundFar;
  const line=lod===0?G.shared.chunkLineNear:lod===1?G.shared.chunkLineMid:G.shared.chunkLineFar;
  if(c.ground)c.ground.material=mat;if(c.line)c.line.material=line;if(c.pin)c.pin.material=G.shared.loader[lod];
};
G.addChunkBase=c=>{
  const lod=c.desiredLod,mat=lod===0?G.shared.groundNear:lod===1?G.shared.groundMid:G.shared.groundFar;
  const lineMat=lod===0?G.shared.chunkLineNear:lod===1?G.shared.chunkLineMid:G.shared.chunkLineFar;
  const ground=new THREE.Mesh(new THREE.BoxGeometry(G.CHUNK-.25,1,G.CHUNK-.25),mat);
  ground.position.set(c.cx*G.CHUNK,-.56,c.cz*G.CHUNK);ground.receiveShadow=lod<2;c.group.add(ground);c.ground=ground;
  const line=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(G.CHUNK,.02,G.CHUNK)),lineMat);
  line.position.set(c.cx*G.CHUNK,.015,c.cz*G.CHUNK);c.group.add(line);c.line=line;
  const pin=new THREE.Mesh(new THREE.CylinderGeometry(1.7,1.7,.18,12),G.shared.loader[lod]);
  pin.position.set(c.cx*G.CHUNK,.11,c.cz*G.CHUNK);c.group.add(pin);c.pin=pin;
};
G.queuePriority=(c,lod,upgrade)=>{
  const x=G.controls.target.x/G.CHUNK,z=G.controls.target.z/G.CHUNK,d=Math.hypot(c.cx-x,c.cz-z);
  if(lod===2&&!upgrade)return d*8;
  if(lod===0)return 5+d*6;
  return 18+d*6;
};
G.sortQueue=()=>{
  for(const item of S.queue)item.priority=G.queuePriority(item.c,item.lod,item.upgrade);
  S.queue.sort((a,b)=>a.priority-b.priority);
};
G.enqueue=(c,lod,upgrade=false)=>{
  if(!S.chunks.has(c.key)||c.loadingLod===lod||c.queuedLods.has(lod)||(c.lod!=null&&c.lod<=lod))return;
  c.queuedLods.add(lod);S.queue.push({c,lod,upgrade,priority:G.queuePriority(c,lod,upgrade)});
  G.sortQueue();G.pump();G.updateStats();
};
G.pump=()=>{
  while(S.active<G.MAX_ACTIVE&&S.queue.length){
    const item=S.queue.shift(),c=item.c,lod=item.lod;c.queuedLods.delete(lod);
    if(!S.chunks.has(c.key)||(c.lod!=null&&c.lod<=lod))continue;
    if(c.loadingLod!=null){c.deferredLod=c.deferredLod==null?lod:Math.min(c.deferredLod,lod);continue}
    S.active++;c.loadingLod=lod;c.state='loading';if(c.pin)c.pin.material=G.shared.loader[lod];
    const generation=S.generation,isUpgrade=c.lod!=null;
    G.statusEl.textContent=isUpgrade?`Refining ${c.key} to ${G.LOD_LABEL[lod]} detail…`:`Loading ${G.LOD_LABEL[lod]} map chunk ${c.key}…`;
    G.fetchChunk(c,lod,generation).then(result=>{
      if(generation!==S.generation||!S.chunks.has(c.key))return;
      G.renderChunk(c,result.data,lod);$('#source').textContent=result.cached?'cache':'OSM';
      G.statusEl.textContent=S.queue.length?'The map is usable now; background chunks are still refining.':'Adaptive streaming ready. Drag to travel; nearby chunks refine automatically.';
    }).catch(error=>{
      if(error&&(error.name==='AbortError'||error.message==='stale generation'))return;
      console.warn('Chunk load failed',c.key,lod,error);
      if(generation===S.generation&&S.chunks.has(c.key)){
        c.errorLod=lod;c.state=c.lod==null?'error':'ready';
        if(c.pin)c.pin.material.color.set(0xe56b5d);
        G.statusEl.textContent='One map tile timed out; the loader continued. Tap Retry to request failed tiles again.';
      }
    }).finally(()=>{
      c.controller=null;c.loadingLod=null;S.active=Math.max(0,S.active-1);
      if(S.chunks.has(c.key)&&c.errorLod==null){
        if(c.deferredLod!=null){const next=c.deferredLod;c.deferredLod=null;G.enqueue(c,next,c.lod!=null)}
        else if(c.desiredLod<(c.lod==null?3:c.lod))G.enqueue(c,c.lod==null?2:c.desiredLod,c.lod!=null);
      }
      G.updateStats();setTimeout(G.pump,90);
    });
  }
};
G.makeChunk=(cx,cz,desiredLod)=>{
  const key=G.chunkKey(cx,cz);let c=S.chunks.get(key);
  if(c){
    G.setChunkVisualLod(c,desiredLod);
    if(c.lod==null)G.enqueue(c,2,false);else if(desiredLod<c.lod)G.enqueue(c,desiredLod,true);
    return c;
  }
  c={key,cx,cz,desiredLod,lod:null,state:'new',group:new THREE.Group(),content:null,pin:null,ground:null,line:null,
    queuedLods:new Set(),loadingLod:null,deferredLod:null,controller:null,featureCount:0,errorLod:null};
  c.group.name=`chunk-${key}`;G.world.add(c.group);S.chunks.set(key,c);G.addChunkBase(c);G.enqueue(c,2,false);return c;
};
G.desiredChunks=()=>{
  const radius=Number($('#radius').value)||1,cx=Math.round(G.controls.target.x/G.CHUNK),cz=Math.round(G.controls.target.z/G.CHUNK);
  const candidates=[];
  for(let dx=-radius;dx<=radius;dx++)for(let dz=-radius;dz<=radius;dz++)candidates.push({dx,dz,d:Math.hypot(dx,dz),lod:G.lodForOffset(dx,dz)});
  candidates.sort((a,b)=>a.d-b.d);
  for(const item of candidates)G.makeChunk(cx+item.dx,cz+item.dz,item.lod);
  const unload=radius+2;
  for(const[key,c]of[...S.chunks])if(Math.max(Math.abs(c.cx-cx),Math.abs(c.cz-cz))>unload){
    if(c.controller)c.controller.abort();S.totalFeatures-=c.featureCount||0;G.disposeObject(c.group);S.chunks.delete(key);
  }
  S.queue=S.queue.filter(item=>S.chunks.has(item.c.key));G.sortQueue();G.pump();return{cx,cz};
};
G.updateStats=()=>{
  let ready=0,failed=0;const lod=[0,0,0];
  for(const c of S.chunks.values()){if(c.lod!=null){ready++;lod[c.lod]++}if(c.errorLod!=null)failed++}
  $('#loaded').textContent=ready;$('#queued').textContent=S.queue.length+S.active;$('#features').textContent=Math.max(0,S.totalFeatures);
  if(failed)$('#source').textContent=`${failed} retry`;
  const read=$('#lodread');if(read)read.textContent=`LOD: ${lod[0]} near · ${lod[1]} middle · ${lod[2]} far`;
};
G.stream=time=>{
  if(time-S.lastStream<380)return;S.lastStream=time;
  const center=G.desiredChunks(),key=`${center.cx},${center.cz}`;
  if(key!==S.lastCenterKey){
    S.lastCenterKey=key;const geo=G.worldToGeo(G.controls.target.x,G.controls.target.z);
    $('#coords').textContent=`Center: ${geo.lat.toFixed(5)}, ${geo.lon.toFixed(5)} · chunk ${key}`;
    $('#osm').href=`https://www.openstreetmap.org/#map=18/${geo.lat}/${geo.lon}`;G.updateStats();
  }
};
G.setMode=pan=>{
  S.panMode=pan;G.controls.enableRotate=!pan;
  G.controls.mouseButtons.LEFT=pan?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;
  G.controls.touches.ONE=pan?THREE.TOUCH.PAN:THREE.TOUCH.ROTATE;
  G.controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
  $('#mode').textContent=pan?'Pan mode':'Orbit mode';$('#mode').classList.toggle('active',pan);
  $('#help').textContent=pan?'Pan mode: drag to travel · center refines first · outer rings stay coarse':'Orbit mode: drag to rotate · two-finger drag to travel';
  G.toast(pan?'Drag to travel through adaptive LOD rings':'Drag to orbit; use two fingers to travel');
};
G.resetView=()=>{
  const x=G.controls.target.x,z=G.controls.target.z;
  G.camera.position.set(x+190,165,z+220);G.controls.target.set(x,8,z);G.controls.update();
};
G.startLocation=()=>{
  const lat=parseFloat($('#lat').value),lon=parseFloat($('#lon').value);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)){G.statusEl.textContent='Enter valid coordinates.';return}
  S.origin={lat,lon};G.clearWorld();G.controls.target.set(0,8,0);S.lastCenterKey='';G.resetView();
  $('#osm').href=`https://www.openstreetmap.org/#map=18/${lat}/${lon}`;
  G.statusEl.textContent='Loading a coarse real-map silhouette first; detail will refine inward.';G.desiredChunks();
};
G.retryErrors=()=>{
  let count=0;
  for(const c of S.chunks.values())if(c.errorLod!=null){const lod=c.errorLod;c.errorLod=null;G.enqueue(c,lod,c.lod!=null);count++}
  G.toast(count?`Retrying ${count} map tile${count===1?'':'s'}`:'No failed tiles to retry');
};
G.rebuildVisible=()=>{
  S.generation++;S.queue=[];S.active=0;
  for(const c of S.chunks.values()){
    if(c.controller)c.controller.abort();
    if(c.content){S.totalFeatures-=c.featureCount||0;G.disposeObject(c.content);c.content=null;c.featureCount=0}
    c.lod=null;c.state='new';c.errorLod=null;c.loadingLod=null;c.deferredLod=null;c.queuedLods.clear();
    if(!c.pin){
      c.pin=new THREE.Mesh(new THREE.CylinderGeometry(1.7,1.7,.18,12),G.shared.loader[c.desiredLod]);
      c.pin.position.set(c.cx*G.CHUNK,.11,c.cz*G.CHUNK);c.group.add(c.pin);
    }
    G.enqueue(c,2,false);
  }
  G.updateStats();G.toast('Rebuilding visible chunks with the new settings');
};
G.updateCompass=()=>{
  const direction=new THREE.Vector3();G.camera.getWorldDirection(direction);
  $('#needle').style.transform=`rotate(${Math.atan2(direction.x,direction.z)}rad)`;
};

$('#preset').onchange=event=>{const[lat,lon]=event.target.value.split(',');$('#lat').value=lat;$('#lon').value=lon};
$('#go').onclick=G.startLocation;
$('#locate').onclick=()=>{
  if(!navigator.geolocation){G.statusEl.textContent='Geolocation is unavailable.';return}
  navigator.geolocation.getCurrentPosition(p=>{
    $('#lat').value=p.coords.latitude.toFixed(6);$('#lon').value=p.coords.longitude.toFixed(6);G.startLocation();
  },()=>G.statusEl.textContent='Location permission was not granted.',{enableHighAccuracy:true,timeout:12000});
};
$('#mode').onclick=()=>G.setMode(!S.panMode);
$('#reset').onclick=G.resetView;
$('#retry').onclick=G.retryErrors;
$('#radius').onchange=G.desiredChunks;
$('#detail').onchange=G.rebuildVisible;
$('#voxel').onchange=G.rebuildVisible;
addEventListener('resize',()=>{
  G.camera.aspect=innerWidth/innerHeight;G.camera.updateProjectionMatrix();G.renderer.setSize(innerWidth,innerHeight);
});
G.renderer.setAnimationLoop(time=>{
  G.controls.update();G.stream(time);G.updateCompass();G.renderer.render(G.scene,G.camera);
});
G.setMode(true);G.resetView();G.loadingEl.hidden=true;G.startLocation();
})();
