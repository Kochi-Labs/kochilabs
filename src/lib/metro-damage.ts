import * as THREE from 'three';

/** Damage belongs to each carriage, not the shared original train materials. */
export function createMetroDamage(cars: THREE.Group[]) {
  const root = new THREE.Group(); root.name = 'Scorched carriage damage';
  const overlays: { mesh: THREE.Mesh; shader: THREE.ShaderMaterial; cracks: THREE.LineSegments; crackMaterial: THREE.LineBasicMaterial }[] = [];
  const replaced: { mesh: THREE.Mesh; original: THREE.Material | THREE.Material[]; copies: THREE.MeshBasicMaterial[]; day: THREE.Color[]; night: THREE.Color[]; car: number }[] = [];
  const warped: { mesh: THREE.Mesh; original: THREE.BufferGeometry; geometry: THREE.BufferGeometry; source: Float32Array; lastDamage: number; car: number }[] = [];
  const burns = cars.map(() => 0);
  const charColor = new THREE.Color('#252625'), moon = new THREE.Color('#404c6c'), warm = new THREE.Color('#ff9c43');
  const vertexShader = `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
  const fragmentShader = `
    varying vec2 vUv; uniform float uDamage; uniform float uWet; uniform float uHeat;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
    void main(){
      float n=noise(vUv*vec2(18,8))*.6+noise(vUv*vec2(49,22))*.28+noise(vUv*vec2(110,43))*.12;
      float drip=noise(vec2(vUv.x*65.0,vUv.y*2.0));
      float scorched=smoothstep(.45,.85,n*.85+vUv.y*.30+(uDamage-.5)*.20+drip*.05);
      float x=vUv.x*94.0-47.0;
      float windowX=max(max(1.0-smoothstep(5.3,6.0,abs(x+33.0)),1.0-smoothstep(5.3,6.0,abs(x+18.0))),max(1.0-smoothstep(5.3,6.0,abs(x-18.0)),1.0-smoothstep(5.3,6.0,abs(x-33.0))));
      float windowY=smoothstep(.46,.49,vUv.y)*(1.0-smoothstep(.86,.89,vUv.y));
      float edge=smoothstep(0.0,.025,min(vUv.x,1.0-vUv.x))*(1.0-smoothstep(.96,1.0,vUv.y));
      scorched*=edge*(1.0-windowX*windowY*.78);
      vec3 ash=mix(vec3(.075,.069,.061),vec3(.25,.245,.22),n*.65);
      ash*=1.0-uWet*.32;
      float ember=smoothstep(.78,.94,n)*uHeat*smoothstep(.4,.9,vUv.y);
      ash+=vec3(.8,.14,.015)*ember;
      gl_FragColor=vec4(ash,scorched*uDamage*.88);
      #include <colorspace_fragment>
    }`;
  cars.forEach((car, index) => {
    car.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const original = object.material;
      const list = Array.isArray(original) ? original : [original];
      if (!list.every(m => m instanceof THREE.MeshBasicMaterial)) return;
      const copies = list.map(m => m.clone() as THREE.MeshBasicMaterial);
      replaced.push({mesh: object, original, copies, day: copies.map(m => m.color.clone()), night: copies.map(m => m.userData.nightGlow ? new THREE.Color('#ffd58c') : m.color.clone().multiply(moon)), car:index});
      object.material = Array.isArray(original) ? copies : copies[0]!;
      object.geometry.computeBoundingBox();
      const box = object.geometry.boundingBox!;
      if (box.max.x-box.min.x>65 && box.max.y+object.position.y>24) {
        const geometry = object.geometry.clone();
        warped.push({mesh:object,original:object.geometry,geometry,source:new Float32Array(geometry.getAttribute('position').array),lastDamage:-1,car:index});
        object.geometry = geometry;
      }
    });
    const shader = new THREE.ShaderMaterial({uniforms:{uDamage:{value:0},uWet:{value:0},uHeat:{value:0}},vertexShader,fragmentShader,transparent:true,depthWrite:false});
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(94,22),shader);
    mesh.position.set(car.position.x,16.5,13); mesh.visible=false; root.add(mesh);
    const points:number[]=[];
    for(const x of [-33,-18,18,33]) {
      const centerX=car.position.x+x;
      for(let ray=0;ray<5;ray++){
        const a=ray*1.257+.45,dx=Math.cos(a)*4.6,dy=Math.sin(a)*3.6;
        points.push(centerX,20.2,13.8,centerX+dx,20.2+dy,13.8);
        if(ray%2===0) points.push(centerX+dx*.6,20.2+dy*.6,13.8,centerX+dx*.6+1.2,20.2+dy*.6-1.2,13.8);
      }
    }
    const crackMaterial = new THREE.LineBasicMaterial({color:'#b0b2a7',transparent:true,opacity:0,depthWrite:false});
    const cracks = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(points,3)),crackMaterial);
    root.add(cracks);overlays.push({mesh,shader,cracks,crackMaterial});
  });
  let destroyed=false;
  function update(damage:number,heat:number,wet:number,night:number,sweep=1) {
    if(destroyed)return;
    for(let i=0;i<burns.length;i++) burns[i]=Math.max(burns[i]!,THREE.MathUtils.clamp(damage*(i===0?1:sweep),0,1));
    replaced.forEach(entry=>entry.copies.forEach((m,i)=>{
      m.color.copy(entry.day[i]!);
      m.color.lerp(entry.night[i]!,night);
      m.color.lerp(charColor,burns[entry.car]!*.42);
      m.color.lerp(warm,heat*.1*(1-night*.2));
      m.color.multiplyScalar(1-wet*.08);
    }));
    warped.forEach(item=>{
      const attr=item.geometry.getAttribute('position'),amount=burns[item.car]!;
      if (Math.abs(amount-item.lastDamage)<.0001) return;
      item.lastDamage=amount;
      for(let i=0;i<attr.count;i++){
        const x=item.source[i*3]!,y=item.source[i*3+1]!,z=item.source[i*3+2]!;
        const top=THREE.MathUtils.smoothstep(y+item.mesh.position.y,19,28);
        attr.setXYZ(i,x+Math.sin(x*.23)*amount*.5*top,y-Math.pow(Math.sin(x*.10+1),2)*3.6*amount*top,z+Math.sin(x*.17)*1.1*amount*top);
      }
      attr.needsUpdate=true;
    });
    overlays.forEach((o,i)=>{o.mesh.visible=burns[i]!>.002;o.shader.uniforms.uDamage!.value=burns[i];o.shader.uniforms.uWet!.value=wet;o.shader.uniforms.uHeat!.value=heat;o.crackMaterial.opacity=burns[i]!*.7;});
  }
  return {group:root,update,get damage(){return burns.length ? Math.max(...burns) : 0;},reset(){burns.fill(0);update(0,0,0,0);},destroy(){
    if(destroyed)return;destroyed=true;root.removeFromParent();
    replaced.forEach(e=>{e.mesh.material=e.original;e.copies.forEach(m=>m.dispose());});
    warped.forEach(e=>{e.mesh.geometry=e.original;e.geometry.dispose();});
    overlays.forEach(o=>{o.mesh.geometry.dispose();o.shader.dispose();o.cracks.geometry.dispose();o.crackMaterial.dispose();});
  }};
}
