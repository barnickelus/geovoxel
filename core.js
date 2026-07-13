(()=>{
'use strict';
const GV=window.GV=window.GV||{};
GV.$=s=>document.querySelector(s);
GV.canvas=GV.$('#view');
GV.statusEl=GV.$('#status');
GV.loadingEl=GV.$('#loading');
if(!window.THREE){
  GV.loadingEl.innerHTML='<div><h2>Could not load 3D engine</h2><p>Open in Safari and check the internet connection.</p></div>';
  GV.failed=true;
  return;
}
GV.MOBILE=/iPad|iPhone|Android/i.test(navigator.userAgent);
GV.CHUNK=140;
GV.OVERLAP=7;
GV.CACHE_AGE=7*86400000;
GV.MAX_ACTIVE=GV.MOBILE?2:3;
GV.LOD_LABEL=['near','middle','far'];
GV.LOD_SNAP=[0,3,8];
GV.SERVERS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];

GV.scene=new THREE.Scene();
GV.scene.background=new THREE.Color(0x9fc3d4);
GV.scene.fog=new THREE.Fog(0x9fc3d4,380,1180);
GV.camera=new THREE.PerspectiveCamera(56,innerWidth/innerHeight,.1,2600);
GV.renderer=new THREE.WebGLRenderer({canvas:GV.canvas,antialias:true,powerPreference:'high-performance'});
GV.renderer.setPixelRatio(Math.min(devicePixelRatio,GV.MOBILE?1.35:1.8));
GV.renderer.setSize(innerWidth,innerHeight);
GV.renderer.shadowMap.enabled=true;
GV.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
GV.renderer.outputEncoding=THREE.sRGBEncoding;
GV.controls=new THREE.OrbitControls(GV.camera,GV.renderer.domElement);
GV.controls.enableDamping=true;
GV.controls.dampingFactor=.065;
GV.controls.maxPolarAngle=Math.PI*.475;
GV.controls.minDistance=24;
GV.controls.maxDistance=1000;
GV.controls.screenSpacePanning=false;
GV.scene.add(new THREE.HemisphereLight(0xecfaff,0x4c5d44,1.78));
const sun=new THREE.DirectionalLight(0xffefd0,1.52);
sun.position.set(-260,360,180);
sun.castShadow=true;
sun.shadow.mapSize.set(GV.MOBILE?1024:2048,GV.MOBILE?1024:2048);
sun.shadow.camera.left=-430;sun.shadow.camera.right=430;
sun.shadow.camera.top=430;sun.shadow.camera.bottom=-430;
sun.shadow.bias=-.0008;
GV.scene.add(sun);
GV.world=new THREE.Group();
GV.scene.add(GV.world);

GV.shared={
  groundNear:new THREE.MeshStandardMaterial({color:0x879c79,roughness:1}),
  groundMid:new THREE.MeshStandardMaterial({color:0x839777,roughness:1}),
  groundFar:new THREE.MeshStandardMaterial({color:0x7e9074,roughness:1}),
  chunkLineNear:new THREE.LineBasicMaterial({color:0xbafd67,transparent:true,opacity:.22}),
  chunkLineMid:new THREE.LineBasicMaterial({color:0x72d8ff,transparent:true,opacity:.15}),
  chunkLineFar:new THREE.LineBasicMaterial({color:0xe1bd76,transparent:true,opacity:.10}),
  sidewalk:new THREE.MeshStandardMaterial({color:0xaaa495,roughness:1}),
  marking:new THREE.MeshBasicMaterial({color:0xe7dfbf}),
  rail:new THREE.MeshStandardMaterial({color:0x43484b,roughness:1}),
  water:new THREE.MeshStandardMaterial({color:0x69a9c3,roughness:.26,metalness:.04,transparent:true,opacity:.90,side:THREE.DoubleSide}),
  trunk:new THREE.MeshStandardMaterial({color:0x6f543b,roughness:1}),
  leaf:new THREE.MeshStandardMaterial({color:0x4e7952,roughness:1,flatShading:true}),
  lamp:new THREE.MeshStandardMaterial({color:0x4b5357,roughness:.8,metalness:.15}),
  lampGlow:new THREE.MeshBasicMaterial({color:0xffe6a5}),
  roof:new THREE.MeshStandardMaterial({color:0x73766f,roughness:.95,flatShading:true}),
  loader:[
    new THREE.MeshBasicMaterial({color:0xbafd67,transparent:true,opacity:.65}),
    new THREE.MeshBasicMaterial({color:0x72d8ff,transparent:true,opacity:.55}),
    new THREE.MeshBasicMaterial({color:0xe1bd76,transparent:true,opacity:.42})
  ],
  road:{},area:{},building:{}
};
GV.buildingPalette=[0xd8c59f,0xc9ad83,0xbcc0b8,0xc58e77,0xddd3bd,0xa5aca4,0xc7bba7];

const windowCanvas=document.createElement('canvas');
windowCanvas.width=128;windowCanvas.height=64;
const wc=windowCanvas.getContext('2d');
wc.fillStyle='#28383e';wc.fillRect(0,0,128,64);
for(let row=5;row<64;row+=16)for(let col=5;col<128;col+=16){
  wc.fillStyle=((row+col)%32)?'#a6c2c7':'#e0cb83';
  wc.globalAlpha=.68;wc.fillRect(col,row,9,8);
}
wc.globalAlpha=1;
const windowTexture=new THREE.CanvasTexture(windowCanvas);
windowTexture.magFilter=THREE.NearestFilter;
windowTexture.minFilter=THREE.LinearFilter;
GV.windowMat=new THREE.MeshBasicMaterial({map:windowTexture,transparent:true,opacity:.62,depthWrite:false,side:THREE.DoubleSide});

GV.state={
  origin:{lat:45.5231,lon:-122.6765},
  chunks:new Map(),queue:[],active:0,generation:0,totalFeatures:0,
  lastStream:0,lastCenterKey:'',panMode:true,toastTimer:null,
  dbPromise:null,requestCounter:0
};

GV.toast=text=>{
  const el=GV.$('#toast');
  el.textContent=text;el.classList.add('show');
  clearTimeout(GV.state.toastTimer);
  GV.state.toastTimer=setTimeout(()=>el.classList.remove('show'),2500);
};
GV.hash=value=>{
  let h=2166136261;
  for(const c of String(value)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}
  return h>>>0;
};
GV.rng=seed=>{
  let s=GV.hash(seed)||1;
  return()=>((s=(Math.imul(1664525,s)+1013904223)>>>0)/4294967296);
};
GV.geoToWorld=(lat,lon)=>{
  const o=GV.state.origin;
  return{x:(lon-o.lon)*111320*Math.cos(o.lat*Math.PI/180),z:(lat-o.lat)*110540};
};
GV.worldToGeo=(x,z)=>{
  const o=GV.state.origin;
  return{lat:o.lat+z/110540,lon:o.lon+x/(111320*Math.cos(o.lat*Math.PI/180))};
};
GV.baseVoxel=()=>Number(GV.$('#voxel').value)||0;
GV.snapForLod=lod=>Math.max(GV.baseVoxel(),GV.LOD_SNAP[lod]);
GV.snapValue=(v,lod)=>{
  const size=GV.snapForLod(lod);
  return size?Math.round(v/size)*size:v;
};
GV.parseMeters=v=>{
  if(v==null)return NaN;
  const s=String(v).trim(),n=parseFloat(s);
  if(!Number.isFinite(n))return NaN;
  return /ft|feet|foot|'/i.test(s)?n*.3048:n;
};
GV.material=(store,color,extra={})=>{
  const key=String(color)+JSON.stringify(extra);
  return store[key]||(store[key]=new THREE.MeshStandardMaterial({color,roughness:.9,...extra}));
};
GV.roadMat=color=>GV.material(GV.shared.road,color,{polygonOffset:true,polygonOffsetFactor:-2});
GV.areaMat=color=>GV.material(GV.shared.area,color,{side:THREE.DoubleSide});
GV.buildingMat=color=>GV.material(GV.shared.building,color,{flatShading:true});
GV.chunkKey=(cx,cz)=>`${cx},${cz}`;
GV.chunkBounds=c=>{
  const h=GV.CHUNK/2;
  return{minX:c.cx*GV.CHUNK-h,maxX:c.cx*GV.CHUNK+h,minZ:c.cz*GV.CHUNK-h,maxZ:c.cz*GV.CHUNK+h};
};
GV.inBounds=(x,z,b,pad=0)=>x>=b.minX-pad&&x<=b.maxX+pad&&z>=b.minZ-pad&&z<=b.maxZ+pad;
GV.disposeObject=root=>{
  root.traverse(o=>{
    if(o.geometry)o.geometry.dispose();
    if(o.material&&o.userData.ownedMaterial){
      if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose();
    }
  });
  if(root.parent)root.parent.remove(root);
};
GV.clearWorld=()=>{
  const s=GV.state;
  s.generation++;s.queue=[];s.active=0;
  for(const c of s.chunks.values()){
    if(c.controller)c.controller.abort();
    GV.disposeObject(c.group);
  }
  s.chunks.clear();s.totalFeatures=0;
  if(GV.updateStats)GV.updateStats();
};

GV.simplifyPoints=(points,tolerance,closed)=>{
  if(tolerance<=0||points.length<5)return points;
  let pts=points.slice();
  if(closed&&pts.length>2){
    const a=pts[0],b=pts[pts.length-1];
    if(Math.hypot(a.x-b.x,a.z-b.z)<.2)pts.pop();
  }
  const distance=(p,a,b)=>{
    const dx=b.x-a.x,dz=b.z-a.z;
    if(dx===0&&dz===0)return Math.hypot(p.x-a.x,p.z-a.z);
    const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));
    return Math.hypot(p.x-(a.x+t*dx),p.z-(a.z+t*dz));
  };
  const rdp=arr=>{
    if(arr.length<3)return arr;
    let index=-1,max=0;
    for(let i=1;i<arr.length-1;i++){
      const d=distance(arr[i],arr[0],arr[arr.length-1]);
      if(d>max){max=d;index=i}
    }
    if(max>tolerance&&index>0){
      const left=rdp(arr.slice(0,index+1)),right=rdp(arr.slice(index));
      return left.slice(0,-1).concat(right);
    }
    return[arr[0],arr[arr.length-1]];
  };
  if(closed)pts.push({...pts[0]});
  let out=rdp(pts);
  if(closed&&out.length>2){
    const a=out[0],b=out[out.length-1];
    if(Math.hypot(a.x-b.x,a.z-b.z)>.2)out.push({...a});
  }
  return out;
};
GV.cleanPoints=(geometry,lod,closed=false)=>{
  if(!geometry)return[];
  const points=[];
  for(const p of geometry){
    if(!Number.isFinite(p.lat)||!Number.isFinite(p.lon))continue;
    const w=GV.geoToWorld(p.lat,p.lon);
    const q={x:GV.snapValue(w.x,lod),z:GV.snapValue(w.z,lod)};
    const prev=points[points.length-1];
    if(!prev||Math.hypot(q.x-prev.x,q.z-prev.z)>.18)points.push(q);
  }
  if(closed&&points.length>2){
    const a=points[0],b=points[points.length-1];
    if(Math.hypot(a.x-b.x,a.z-b.z)>.18)points.push({...a});
  }
  return GV.simplifyPoints(points,lod===0?0:lod===1?1.5:5,closed);
};
GV.centroid=pts=>{
  let x=0,z=0;for(const p of pts){x+=p.x;z+=p.z}
  return pts.length?{x:x/pts.length,z:z/pts.length}:{x:0,z:0};
};
GV.polygonArea=pts=>{
  let a=0;for(let i=0,j=pts.length-1;i<pts.length;j=i++)a+=pts[j].x*pts[i].z-pts[i].x*pts[j].z;
  return Math.abs(a*.5);
};
GV.pointInPoly=(x,z,poly)=>{
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i],b=poly[j];
    if(((a.z>z)!==(b.z>z))&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z+1e-9)+a.x)inside=!inside;
  }
  return inside;
};
GV.makeShape=pts=>{
  if(pts.length<3)return null;
  const p=pts.slice(),first=p[0],last=p[p.length-1];
  if(Math.hypot(first.x-last.x,first.z-last.z)<.2)p.pop();
  if(p.length<3)return null;
  const shape=new THREE.Shape();
  shape.moveTo(p[0].x,-p[0].z);
  for(let i=1;i<p.length;i++)shape.lineTo(p[i].x,-p[i].z);
  shape.closePath();return shape;
};
GV.boundsOf=pts=>{
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const p of pts){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z)}
  return{minX,maxX,minZ,maxZ,x:(minX+maxX)/2,z:(minZ+maxZ)/2,w:maxX-minX,d:maxZ-minZ};
};
GV.lodForOffset=(dx,dz)=>dx===0&&dz===0?0:Math.abs(dx)+Math.abs(dz)===1?1:2;
GV.geometries=el=>{
  if(el.type==='way'&&el.geometry)return[{geometry:el.geometry,id:el.id,tags:el.tags||{}}];
  if(el.type==='relation'&&el.members)return el.members
    .filter(m=>m.type==='way'&&m.geometry&&(!m.role||m.role==='outer'))
    .map((m,i)=>({geometry:m.geometry,id:`${el.id}-${i}`,tags:el.tags||{}}));
  return[];
};
GV.areaStyle=t=>{
  if(t.natural==='water'||['reservoir','basin'].includes(t.landuse))return{color:0x69a9c3,y:.025,water:true,trees:0};
  if(t.natural==='wood'||t.landuse==='forest')return{color:0x547c58,y:.018,trees:1};
  if(['park','garden'].includes(t.leisure))return{color:0x6d9870,y:.019,trees:.45};
  if(t.leisure==='pitch')return{color:0x72906b,y:.02,trees:0};
  if(['grass','meadow','recreation_ground','village_green','cemetery'].includes(t.landuse))return{color:0x76956d,y:.017,trees:.18};
  if(['commercial','retail'].includes(t.landuse))return{color:0x9b8f82,y:.014,trees:0};
  if(t.landuse==='industrial')return{color:0x8c8a82,y:.014,trees:0};
  return{color:0x829775,y:.012,trees:0};
};
GV.roadStyle=(t,lod)=>{
  const h=t.highway||'';let style;
  if(['motorway','trunk'].includes(h))style={width:12,color:0x48535a,walk:0,mark:1};
  else if(['primary','secondary'].includes(h))style={width:9,color:0x525e64,walk:1,mark:1};
  else if(h==='tertiary')style={width:7.5,color:0x576268,walk:1,mark:1};
  else if(['residential','unclassified'].includes(h))style={width:6.2,color:0x5d676c,walk:1,mark:0};
  else if(['service','living_street'].includes(h))style={width:4.5,color:0x666e72,walk:.5,mark:0};
  else if(['pedestrian','footway','path','cycleway','steps'].includes(h))style={width:2.1,color:0x9d927b,walk:0,mark:0};
  else style={width:4,color:0x626a6e,walk:0,mark:0};
  if(lod===1){style.walk=0;style.mark=0}
  if(lod===2){style.walk=0;style.mark=0;style.width=Math.max(4,Math.round(style.width/3)*3)}
  return style;
};
})();
