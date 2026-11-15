import * as THREE from 'three';

/** A lit luxury kettuvallam, modelled around its waterline (y=0). */
export function createLuxuryHouseboat() {
  const group = new THREE.Group(); group.name = 'Luxury teak and glass kettuvallam';
  const lighting = new THREE.Group(); lighting.name = 'Houseboat daylight and interior lighting';
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  const keep = <T extends THREE.BufferGeometry>(geometry:T) => { geometries.add(geometry); return geometry; };
  function standard(color:string, roughness=.6, metalness=0) {
    const material=new THREE.MeshStandardMaterial({color,roughness,metalness});materials.add(material);return material;
  }
  const teak=standard('#59402b',.31,.05), trim=standard('#8d683e',.4,.16), darkTeak=standard('#2c241c',.4,.03);
  const weave=standard('#b39a70',.83), ivory=standard('#eee8d7',.83), cushion=standard('#d2c9b4',.87);
  const brass=standard('#b5a174',.24,.75), porcelain=standard('#e5dfd1',.3,.04), foliage=standard('#375846',.8);
  const interior=standard('#c3a37d',.7);
  const glass=new THREE.MeshPhysicalMaterial({color:'#527b79',metalness:.12,roughness:.12,transparent:true,opacity:.37,depthWrite:false,clearcoat:1,clearcoatRoughness:.12,side:THREE.DoubleSide});materials.add(glass);
  const glassRim=new THREE.MeshBasicMaterial({color:'#c5e0d5',transparent:true,opacity:.27,depthWrite:false});materials.add(glassRim);
  const glow=new THREE.MeshBasicMaterial({color:'#ffda91',transparent:true,opacity:.25});glow.userData.nightGlow=true;materials.add(glow);
  const interiorGlow=standard('#d9ad67',.6);interiorGlow.emissive.set('#ffd089');interiorGlow.emissiveIntensity=.15;
  function grain(material:THREE.MeshStandardMaterial,kind:'wood'|'woven') {
    material.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vBoatLocal;');
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvBoatLocal=position;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 vBoatLocal;`);
      const detail=kind==='wood'
        ? 'float grain=sin(vBoatLocal.x*.11+sin(vBoatLocal.y*2.7+vBoatLocal.z*.7)*1.8)*.025+sin(vBoatLocal.y*7.0+vBoatLocal.z*1.3+sin(vBoatLocal.x*.07)*2.0)*.045;'
        : 'float grain=sin(vBoatLocal.x*3.8)*sin((vBoatLocal.y+vBoatLocal.z)*3.8)*.065+sin(vBoatLocal.x*.35)*.025;';
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\n${detail}\ndiffuseColor.rgb*=.96+grain;`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nnormal=normalize(normal-vec3(dFdx(grain),dFdy(grain),0.0)*.65);');
    };
    material.customProgramCacheKey=()=>`luxury-boat-${kind}-1`;
  }
  grain(teak,'wood');grain(darkTeak,'wood');grain(trim,'wood');grain(weave,'woven');
  const unitBox=keep(new THREE.BoxGeometry(1,1,1));
  const sphere=keep(new THREE.SphereGeometry(1,12,8));
  function box(size:number[],at:number[],material:THREE.Material,parent:THREE.Object3D=group) {
    const mesh=new THREE.Mesh(unitBox,material);mesh.scale.set(size[0]!,size[1]!,size[2]!);mesh.position.set(at[0]!,at[1]!,at[2]!);parent.add(mesh);return mesh;
  }
  function ellipsoid(size:number[],at:number[],material:THREE.Material,parent:THREE.Object3D=group) {
    const mesh=new THREE.Mesh(sphere,material);mesh.scale.set(size[0]!,size[1]!,size[2]!);mesh.position.set(at[0]!,at[1]!,at[2]!);parent.add(mesh);return mesh;
  }
  function tube(points:THREE.Vector3[],radius:number,material:THREE.Material,parent:THREE.Object3D=group) {
    const curve=new THREE.CatmullRomCurve3(points);const geometry=keep(new THREE.TubeGeometry(curve,Math.max(8,points.length*3),radius,6,false));
    const mesh=new THREE.Mesh(geometry,material);parent.add(mesh);return mesh;
  }
  const pos:number[]=[],uv:number[]=[],indices:number[]=[];
  const lengthSegments=52,sides=28;
  for(let i=0;i<=lengthSegments;i++) {
    const t=i/lengthSegments,x=(t-.5)*250,end=Math.pow(Math.abs(t-.5)*2,4),w=Math.pow(Math.sin(t*Math.PI),.62)*28;
    for(let j=0;j<=sides;j++){
      const a=j/sides*Math.PI*2;
      pos.push(x,3+end*20+Math.sin(a)*12*Math.pow(Math.sin(t*Math.PI),.3),Math.cos(a)*w);
      uv.push(t,j/sides);
      if(i<lengthSegments&&j<sides){const n=i*(sides+1)+j;indices.push(n,n+1,n+sides+1,n+1,n+sides+2,n+sides+1);}
    }
  }
  const hullGeo=keep(new THREE.BufferGeometry());hullGeo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));hullGeo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));hullGeo.setIndex(indices);hullGeo.computeVertexNormals();
  const hull=new THREE.Mesh(hullGeo,teak);hull.name='Tapered polished teak hull';group.add(hull);
  const rim=Array.from({length:19},(_,i)=>{const t=i/18;return new THREE.Vector3((t-.5)*244,15+Math.pow(Math.abs(t-.5)*2,4)*10,Math.pow(Math.sin(t*Math.PI),.62)*28.5);});
  tube(rim,1.1,brass);tube(rim.map(p=>new THREE.Vector3(p.x,p.y-4,p.z-.2)),.55,trim);
  // Teak promenade deck and subtle inlaid plank lines.
  box([202,3,52],[0,15.5,0],trim);box([193,.8,48],[0,17.4,0],teak);
  const planks=new THREE.InstancedMesh(unitBox,darkTeak,19),matrix=new THREE.Matrix4();
  for(let i=0;i<19;i++){matrix.compose(new THREE.Vector3(-90+i*10,17.85,0),new THREE.Quaternion(),new THREE.Vector3(.25,.12,46));planks.setMatrixAt(i,matrix);}group.add(planks);
  // A deep, furnished lounge behind large glazing (not opaque window decals).
  box([139,1.7,42],[9,20,0],ivory);box([139,39,1.6],[9,39,-20],interior);
  box([2,41,42],[79,40,0],trim);box([2,41,42],[-61,40,0],trim);
  box([139,3,44],[9,61,0],trim);
  for(const x of [-40,3,46]) {
    box([32,5,11],[x,25,-9],cushion);box([32,13,4],[x,31,-16],ivory);
    box([2,12,12],[x-16,29,-10],trim);box([2,12,12],[x+16,29,-10],trim);
    for(const dx of [-9,9])ellipsoid([5,4.5,1.8],[x+dx,31,-12.8],dx<0?cushion:ivory);
  }
  // A long low travertine table, visible through the middle glazed panels.
  box([38,2.3,13],[5,28,7],porcelain);box([3,7,7],[-9,23.8,7],brass);box([3,7,7],[19,23.8,7],brass);
  ellipsoid([2.2,3.4,2.2],[6,32.2,7],porcelain);
  for(const x of [-44,-8,28,64]) {
    box([33,35,.6],[x,40.5,22],glass);
    box([.75,37,1.1],[x-17,40.5,23],brass);
    box([.45,27,.25],[x-10,43,22.5],glassRim);
  }
  box([141,1,1.2],[9,22,23],brass);box([141,1,1.2],[9,59,23],brass);
  // Curved woven palm canopy with true volume, normals and sculpted eaves.
  const roofPositions:number[]=[],roofUv:number[]=[],roofIndices:number[]=[];
  const roofX=24,roofArc=24;
  const roofPoint=(u:number,v:number)=>{
    const x=-91+u*147,a=v*Math.PI,end=Math.pow(Math.abs(u-.5)*2,2);
    return new THREE.Vector3(x,62-end*3+Math.sin(a)*(26-end*7),Math.cos(a)*30);
  };
  for(let i=0;i<=roofX;i++)for(let j=0;j<=roofArc;j++){
    const p=roofPoint(i/roofX,j/roofArc);roofPositions.push(p.x,p.y,p.z);roofUv.push(i/roofX,j/roofArc);
    if(i<roofX&&j<roofArc){const n=i*(roofArc+1)+j;roofIndices.push(n,n+1,n+roofArc+1,n+1,n+roofArc+2,n+roofArc+1);}
  }
  const roofGeo=keep(new THREE.BufferGeometry());roofGeo.setAttribute('position',new THREE.Float32BufferAttribute(roofPositions,3));roofGeo.setAttribute('uv',new THREE.Float32BufferAttribute(roofUv,2));roofGeo.setIndex(roofIndices);roofGeo.computeVertexNormals();weave.side=THREE.DoubleSide;
  const roof=new THREE.Mesh(roofGeo,weave);roof.name='Woven vaulted palm canopy';group.add(roof);
  for(const u of [0,.22,.5,.78,1])tube(Array.from({length:13},(_,i)=>roofPoint(u,i/12)),.65,trim);
  tube(Array.from({length:20},(_,i)=>roofPoint(i/19,0)),1.05,brass);
  tube(Array.from({length:20},(_,i)=>roofPoint(i/19,1)),1.05,trim);
  // The aft sun terrace is raised above the lounge, with a glass balustrade.
  box([50,3,47],[61,65,0],teak);box([46,.8,43],[61,67,0],ivory);
  box([46,12,.6],[61,74,24],glass);box([.6,12,43],[86,74,0],glass);
  box([49,.8,.9],[61,80,24],brass);box([.8,.8,44],[86,80,0],brass);
  for(const x of [38,61,85])box([.8,14,.8],[x,73,24],brass);
  // Two sun loungers, slim brass legs and ivory upholstery.
  for(const z of [-10,10]){
    box([31,2,11],[62,71,z],trim);box([29,2.5,10],[61,73,z],ivory);
    const back=box([11,2.8,10],[74,76,z],cushion);back.rotation.z=.35;
  }
  // Shaded bow veranda, generous sofa and open railings.
  for(const x of [-88,-65])box([1.8,43,1.8],[x,39,25],trim);
  box([25,4,17],[-82,24,6],ivory);box([4,12,17],[-95,29,6],cushion);
  box([25,9,3],[-82,28,-3],ivory);
  const posts=new THREE.InstancedMesh(unitBox,brass,12);
  for(let i=0;i<12;i++){const x=i<6?-106+i*9:87+(i-6)*5;matrix.compose(new THREE.Vector3(x,25.5,27),new THREE.Quaternion(),new THREE.Vector3(.7,17,.7));posts.setMatrixAt(i,matrix);}group.add(posts);
  tube([new THREE.Vector3(-108,34,27),new THREE.Vector3(-65,34,27)],.75,brass);
  tube([new THREE.Vector3(87,34,27),new THREE.Vector3(111,37,23)],.75,brass);
  // Two small palms in ceramic planters on the terrace.
  for(const x of [39,84]) {
    ellipsoid([3.4,4.7,3.4],[x,71,-16],porcelain);
    const plant=new THREE.Group();plant.position.set(x,76,-16);group.add(plant);
    for(let j=0;j<4;j++){const leaf=ellipsoid([.8,5,1.2],[Math.sin(j*1.57)*2.3,3,Math.cos(j*1.57)*2.3],foliage,plant);leaf.rotation.z=Math.sin(j*1.57)*.6;}
  }
  // Under-eave lights, warm interior pendants and recessed deck lamps.
  box([140,.6,.6],[9,60.8,24],glow);box([180,.45,.6],[0,18.5,27.2],glow);
  for(const x of [-35,8,49]){
    box([.5,7,.5],[x,55,0],brass);ellipsoid([4.5,2,4.5],[x,51,0],interiorGlow);
  }
  const fenderGeometry=keep(new THREE.CapsuleGeometry(2,5,4,8));
  for(const x of [-64,54,95]){const fender=new THREE.Mesh(fenderGeometry,ivory);fender.position.set(x,9,28.5);group.add(fender);}
  const hemi=new THREE.HemisphereLight('#ebf5f3','#334038',2.3);lighting.add(hemi);
  const sun=new THREE.DirectionalLight('#fff1d4',2.6);sun.position.set(-180,300,240);lighting.add(sun);
  const rimLight=new THREE.DirectionalLight('#b9d5e6',.8);rimLight.position.set(200,80,-160);lighting.add(rimLight,sun.target,rimLight.target);
  const cabinLight=new THREE.PointLight('#ffd193',0,350,1.2);cabinLight.position.set(0,48,50);lighting.add(cabinLight);
  const emissiveMaterials=[interior,ivory,cushion];
  let destroyed=false;
  return {
    group,lighting,
    update(_time:number,night:number,_reducedMotion:boolean){
      if(destroyed)return;const n=THREE.MathUtils.clamp(night,0,1);
      hemi.intensity=THREE.MathUtils.lerp(2.3,.3,n);sun.intensity=THREE.MathUtils.lerp(2.6,.18,n);rimLight.intensity=THREE.MathUtils.lerp(.8,.36,n);cabinLight.intensity=n*145;
      glow.opacity=THREE.MathUtils.lerp(.16,.94,n);interiorGlow.emissiveIntensity=THREE.MathUtils.lerp(.15,1.6,n);
      emissiveMaterials.forEach(m=>{m.emissive.set('#9b592b');m.emissiveIntensity=n*.22;});
      glass.opacity=THREE.MathUtils.lerp(.37,.23,n);glassRim.opacity=THREE.MathUtils.lerp(.27,.08,n);
    },
    destroy(){if(destroyed)return;destroyed=true;group.removeFromParent();lighting.removeFromParent();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());},
  };
}
