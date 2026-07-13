(()=>{
'use strict';
const G=window.GV;if(!G||G.failed)return;

G.addArea=(group,pts,style,lod)=>{
  const shape=G.makeShape(pts);if(!shape)return false;
  try{
    const geo=new THREE.ShapeGeometry(shape);geo.rotateX(-Math.PI/2);
    const mesh=new THREE.Mesh(geo,style.water?G.shared.water:G.areaMat(style.color));
    mesh.position.y=style.y;mesh.receiveShadow=lod<2;group.add(mesh);return true;
  }catch{return false}
};
G.buildingHeight=(t,id,lod)=>{
  let h=G.parseMeters(t.height);
  if(!Number.isFinite(h)){const levels=parseFloat(t['building:levels']);if(Number.isFinite(levels))h=levels*3.15}
  if(!Number.isFinite(h)){
    if(['garage','garages','shed','roof','carport'].includes(t.building))h=3.2;
    else{const r=G.hash(id)%1000/1000;h=5.5+Math.pow(r,1.55)*27}
  }
  h=Math.max(3,Math.min(180,h));
  if(lod===1)h=Math.round(h/3)*3;
  if(lod===2)h=Math.max(8,Math.round(h/8)*8);
  return h;
};
G.buildingColor=(t,id,lod)=>{
  const name=(t['building:material']||'').toLowerCase(),explicit=t['building:colour']||t['building:color'];
  let color;
  if(explicit&&/^#?[0-9a-f]{6}$/i.test(explicit))color=parseInt(explicit.replace('#',''),16);
  else if(name.includes('brick'))color=0xb97961;
  else if(name.includes('glass'))color=0x91adb4;
  else if(name.includes('concrete'))color=0xb8b6ae;
  else if(name.includes('wood'))color=0xb18c66;
  else color=G.buildingPalette[G.hash(id)%G.buildingPalette.length];
  if(lod===2){const c=new THREE.Color(color);c.lerp(new THREE.Color(0xb9b29f),.28);return c.getHex()}
  return color;
};
G.addRoofDetail=(group,b,height,lod,seed)=>{
  if(lod>0||b.w<7||b.d<7)return;
  const r=G.rng(`${seed}:roof`);if(r()>.55)return;
  const unit=Math.max(1.5,Math.min(4,Math.min(b.w,b.d)*.14));
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(unit*1.8,unit,unit*1.5),G.shared.roof);
  mesh.position.set(b.x+(r()-.5)*b.w*.25,height+unit/2,b.z+(r()-.5)*b.d*.25);
  mesh.castShadow=true;group.add(mesh);
};
G.addWindowBands=(group,b,height,lod)=>{
  if(lod!==0||Number(G.$('#detail').value)<2||height<9||b.w*b.d<90)return;
  const y=Math.max(3,height*.5),panelH=Math.max(2.4,Math.min(height-2,height*.62)),offset=.04;
  const panels=[
    {w:b.w*.84,x:b.x,z:b.minZ-offset,ry:0},
    {w:b.w*.84,x:b.x,z:b.maxZ+offset,ry:0},
    {w:b.d*.84,x:b.minX-offset,z:b.z,ry:Math.PI/2},
    {w:b.d*.84,x:b.maxX+offset,z:b.z,ry:Math.PI/2}
  ];
  for(const p of panels){
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(p.w,panelH),G.windowMat);
    mesh.position.set(p.x,y,p.z);mesh.rotation.y=p.ry;group.add(mesh);
  }
};
G.addBuilding=(group,pts,tags,id,lod)=>{
  if(pts.length<4)return false;
  const b=G.boundsOf(pts);if(b.w<1.5||b.d<1.5)return false;
  const height=G.buildingHeight(tags,id,lod),color=G.buildingColor(tags,id,lod);
  if(lod===2){
    const w=Math.max(8,Math.round(b.w/8)*8),d=Math.max(8,Math.round(b.d/8)*8);
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,height,d),G.buildingMat(color));
    mesh.position.set(G.snapValue(b.x,2),height/2,G.snapValue(b.z,2));
    group.add(mesh);return true;
  }
  const shape=G.makeShape(pts);if(!shape)return false;
  try{
    const geo=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,steps:1,curveSegments:1});
    geo.rotateX(-Math.PI/2);geo.computeVertexNormals();
    const mesh=new THREE.Mesh(geo,G.buildingMat(color));
    mesh.receiveShadow=true;mesh.castShadow=lod===0;group.add(mesh);
    if(lod===0){G.addRoofDetail(group,b,height,lod,id);G.addWindowBands(group,b,height,lod)}
    else{
      const cap=new THREE.Mesh(new THREE.BoxGeometry(Math.max(2,b.w*.88),.35,Math.max(2,b.d*.88)),G.shared.roof);
      cap.position.set(b.x,height+.18,b.z);group.add(cap);
    }
    return true;
  }catch{return false}
};
G.addSegmentBox=(group,a,b,width,mat,y=.07,height=.11)=>{
  const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<.25)return null;
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(len,height,width),mat);
  mesh.position.set((a.x+b.x)/2,y,(a.z+b.z)/2);mesh.rotation.y=-Math.atan2(dz,dx);
  mesh.receiveShadow=true;group.add(mesh);
  return{len,dx:dx/len,dz:dz/len,midX:mesh.position.x,midZ:mesh.position.z};
};
G.renderRoad=(group,pts,tags,bounds,lod)=>{
  const style=G.roadStyle(tags,lod),layer=parseFloat(tags.layer)||0;
  const y=tags.bridge?1.1+layer*.55:.07+layer*.12;let rendered=0;
  for(let i=1;i<pts.length;i++){
    const a=pts[i-1],b=pts[i],mx=(a.x+b.x)/2,mz=(a.z+b.z)/2;
    if(!G.inBounds(mx,mz,bounds,3))continue;
    if(style.walk&&lod===0)G.addSegmentBox(group,a,b,style.width+3.2*style.walk,G.shared.sidewalk,y-.035,.09);
    const seg=G.addSegmentBox(group,a,b,style.width,G.roadMat(style.color),y,.12);if(!seg)continue;
    rendered++;
    if(style.mark&&lod===0&&Number(G.$('#detail').value)>0){
      const dash=5,gap=5,n=Math.floor(seg.len/(dash+gap));
      for(let j=0;j<n;j++){
        const off=(j+.5)*(dash+gap)-seg.len/2;
        const c={x:seg.midX+seg.dx*off,z:seg.midZ+seg.dz*off};
        const p1={x:c.x-seg.dx*dash/2,z:c.z-seg.dz*dash/2},p2={x:c.x+seg.dx*dash/2,z:c.z+seg.dz*dash/2};
        G.addSegmentBox(group,p1,p2,.18,G.shared.marking,y+.07,.035);
      }
    }
  }
  return rendered;
};
G.scatterTrees=(list,pts,bounds,id,density,lod)=>{
  if(!density||lod!==0||Number(G.$('#detail').value)===0)return;
  const b=G.boundsOf(pts),minX=Math.max(b.minX,bounds.minX),maxX=Math.min(b.maxX,bounds.maxX);
  const minZ=Math.max(b.minZ,bounds.minZ),maxZ=Math.min(b.maxZ,bounds.maxZ);
  const area=Math.max(0,(maxX-minX)*(maxZ-minZ)),max=Number(G.$('#detail').value)===2?42:20;
  const limit=Math.min(max,Math.floor(area/190*density)),r=G.rng(`${id}:trees`);
  for(let tries=0;tries<limit*5&&list.length<limit;tries++){
    const x=minX+r()*(maxX-minX),z=minZ+r()*(maxZ-minZ);
    if(G.pointInPoly(x,z,pts))list.push({x,z,scale:.7+r()*.9});
  }
};
G.addTreeInstances=(group,trees,lod)=>{
  if(!trees.length||lod!==0)return;
  const max=Number(G.$('#detail').value)===2?80:36,data=trees.slice(0,max);
  const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.28,.42,3.4,6),G.shared.trunk,data.length);
  const leaves=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1.8,0),G.shared.leaf,data.length);
  const matrix=new THREE.Matrix4();
  data.forEach((t,i)=>{
    matrix.compose(new THREE.Vector3(t.x,1.7*t.scale,t.z),new THREE.Quaternion(),new THREE.Vector3(t.scale,t.scale,t.scale));trunks.setMatrixAt(i,matrix);
    matrix.compose(new THREE.Vector3(t.x,4.2*t.scale,t.z),new THREE.Quaternion(),new THREE.Vector3(t.scale,t.scale,t.scale));leaves.setMatrixAt(i,matrix);
  });
  trunks.castShadow=leaves.castShadow=Number(G.$('#detail').value)>0;group.add(trunks,leaves);
};
G.addLampInstances=(group,lamps,lod)=>{
  if(!lamps.length||lod!==0||Number(G.$('#detail').value)===0)return;
  const count=Math.min(lamps.length,60);
  const pole=new THREE.InstancedMesh(new THREE.CylinderGeometry(.08,.12,4.2,5),G.shared.lamp,count);
  const glow=new THREE.InstancedMesh(new THREE.SphereGeometry(.22,6,4),G.shared.lampGlow,count),matrix=new THREE.Matrix4();
  for(let i=0;i<count;i++){const p=lamps[i];matrix.makeTranslation(p.x,2.1,p.z);pole.setMatrixAt(i,matrix);matrix.makeTranslation(p.x,4.15,p.z);glow.setMatrixAt(i,matrix)}
  group.add(pole,glow);
};
G.renderChunk=(c,data,lod)=>{
  const bounds=G.chunkBounds(c),content=new THREE.Group();
  content.name=`lod-${lod}-content`;
  const areas=[],roads=[],buildings=[],trees=[],lamps=[];
  for(const el of data.elements||[]){
    const t=el.tags||{};
    if(el.type==='node'){
      if(lod===0&&Number.isFinite(el.lat)&&Number.isFinite(el.lon)){
        const w=G.geoToWorld(el.lat,el.lon);
        if(G.inBounds(w.x,w.z,bounds)){
          if(t.natural==='tree')trees.push({x:w.x,z:w.z,scale:.8+(G.hash(el.id)%50)/100});
          if(t.highway==='street_lamp')lamps.push(w);
        }
      }
      continue;
    }
    if(t.building)buildings.push(el);
    else if(t.highway||t.railway||t.waterway)roads.push(el);
    else if(t.natural||t.landuse||t.leisure)areas.push(el);
  }
  let count=0;
  for(const el of areas)for(const q of G.geometries(el)){
    const pts=G.cleanPoints(q.geometry,lod,true);if(pts.length<3)continue;
    const center=G.centroid(pts);if(!G.inBounds(center.x,center.z,bounds,6))continue;
    const style=G.areaStyle(q.tags);if(lod===2&&!style.water&&G.polygonArea(pts)<1400)continue;
    if(G.addArea(content,pts,style,lod))count++;
    G.scatterTrees(trees,pts,bounds,q.id,style.trees,lod);
  }
  for(const el of roads)for(const q of G.geometries(el)){
    const pts=G.cleanPoints(q.geometry,lod,false);if(pts.length<2)continue;
    if(q.tags.waterway){
      for(let i=1;i<pts.length;i++){
        const a=pts[i-1],b=pts[i],m={x:(a.x+b.x)/2,z:(a.z+b.z)/2};
        if(G.inBounds(m.x,m.z,bounds,3))G.addSegmentBox(content,a,b,Math.max(3,parseFloat(q.tags.width)||4),G.shared.water,.035,.08);
      }
      count++;
    }else if(q.tags.railway){
      if(lod===2)continue;
      for(let i=1;i<pts.length;i++){
        const a=pts[i-1],b=pts[i],m={x:(a.x+b.x)/2,z:(a.z+b.z)/2};
        if(G.inBounds(m.x,m.z,bounds,3))G.addSegmentBox(content,a,b,2.2,G.shared.rail,.075,.11);
      }
      count++;
    }else if(G.renderRoad(content,pts,q.tags,bounds,lod))count++;
  }
  const quality=Number(G.$('#detail').value);
  const limit=lod===0?(quality===2?300:quality===1?230:160):lod===1?230:190;
  let built=0;
  for(const el of buildings){
    if(built>=limit)break;
    for(const q of G.geometries(el)){
      if(built>=limit)break;
      const pts=G.cleanPoints(q.geometry,lod,true);if(pts.length<4)continue;
      const center=G.centroid(pts);if(!G.inBounds(center.x,center.z,bounds,4))continue;
      if(G.addBuilding(content,pts,q.tags,q.id,lod)){built++;count++}
    }
  }
  G.addTreeInstances(content,trees,lod);G.addLampInstances(content,lamps,lod);
  if(c.content){G.state.totalFeatures-=c.featureCount||0;G.disposeObject(c.content)}
  c.content=content;c.group.add(content);c.lod=lod;c.featureCount=count;G.state.totalFeatures+=count;
  if(c.pin){c.group.remove(c.pin);c.pin.geometry.dispose();c.pin=null}
  c.state='ready';c.errorLod=null;
  if(G.updateStats)G.updateStats();
  if(c.desiredLod<c.lod&&G.enqueue)G.enqueue(c,c.desiredLod,true);
};
})();
