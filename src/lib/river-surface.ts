import * as THREE from 'three';
import {MAX_WAVES,RIVER_WIDTH,RIVER_HEIGHT,RIVER_WAVE_GLSL,riverContains,riverShoreV,type WaterImpulse} from './water-physics';
export {riverContains,riverDepth,riverShoreV} from './water-physics';
type RiverUpdate={time:number;waves:WaterImpulse[];night:number;ambient:boolean;scroll:number;moon:THREE.Vector2};
const vertexShader=`
uniform float uTime;uniform float uAmbient;uniform vec4 uWaves[10];
varying vec2 vUv;varying vec3 vNormal;varying float vHeight;varying vec2 vWorld;varying float vShore;
${RIVER_WAVE_GLSL}
void main(){
 vUv=uv;vShore=riverShore(uv.x)-uv.y;
 float h=riverHeight(uv),hx=riverHeight(uv+vec2(.0008,0.0)),hy=riverHeight(uv+vec2(0.0,.0008));
 vec3 tangentX=vec3(1.376,(hx-h)*.65,(hx-h)*1.6);
 vec3 tangentY=vec3(0.0,.86+(hy-h)*.65,(hy-h)*1.6);
 vNormal=normalize(cross(tangentX,tangentY));vHeight=h;
 vec3 displaced=position;displaced.y+=h*.65;displaced.z+=h*1.6;
 vec4 world=modelMatrix*vec4(displaced,1.0);vWorld=world.xy;
 gl_Position=projectionMatrix*viewMatrix*world;
}`;
const fragmentShader=`
uniform sampler2D uBackdrop;uniform float uTime;uniform float uAmbient;uniform float uNight;uniform float uScroll;uniform vec2 uMoon;
varying vec2 vUv;varying vec3 vNormal;varying float vHeight;varying vec2 vWorld;varying float vShore;
void main(){
 vec3 n=normalize(vNormal);float depth=clamp((.355-vUv.y)/.355,0.0,1.0);
 // The painting supplies restrained reflection colour; actual surface normals
 // and displaced geometry create the water, highlights, and moving light paths.
 vec2 reflectedUv=clamp(vUv+n.xy*vec2(.008,.004),vec2(.001),vec2(.999));
 vec3 painted=texture2D(uBackdrop,reflectedUv).rgb;
 vec3 base=mix(vec3(.24,.43,.35),vec3(.075,.24,.22),depth);
 vec3 sky=mix(vec3(.48,.67,.68),vec3(.31,.51,.46),depth);
 float fresnel=pow(1.0-clamp(dot(n,normalize(vec3(0.0,-.65,.76))),0.0,1.0),3.0);
 vec3 color=mix(mix(base,painted,.22),sky,.15+fresnel*.5);
 vec3 light=normalize(vec3(-.35,.7,1.0));
 color*=.78+.22*max(0.0,dot(n,light));
 float specular=pow(max(0.0,dot(reflect(-light,n),normalize(vec3(.08,-.45,1.0)))),48.0);
 color+=vec3(.62,.65,.44)*specular*.35;
 color+=vec3(.07,.1,.075)*max(vHeight,0.0)*.055;
 vec3 nightColor=color*vec3(.07,.12,.23)+vec3(.002,.006,.015);
 color=mix(color,nightColor,uNight);
 vec2 reflected=vWorld+n.xy*vec2(55.0,24.0);
 float sourceY=-242.0-uScroll*16.0;float radius=max(uMoon.y,18.0);
 vec2 p=(reflected-vec2(uMoon.x,sourceY))/vec2(radius,radius*.62);
 float disc=1.0-smoothstep(.9,1.06,length(p));
 float crescent=disc*smoothstep(.85,.94,length(p-vec2(.516,-.516)));
 float sun=1.0-smoothstep(.82,1.12,length(p)*(31.0/25.0));
 float travel=max(0.0,sourceY-reflected.y),width=10.0+travel*.23;
 float path=exp(-pow((reflected.x-uMoon.x)/width,2.0))*exp(-travel/260.0);
 float bands=pow(.5+.5*sin(reflected.y*(.25-depth*.13)+n.x*9.0+uTime*.4*uAmbient),7.0);
 float below=smoothstep(-18.0,35.0,sourceY-reflected.y);
 float moonlight=crescent*(.26+bands*.16)+path*below*(.02+bands*.16);
 float sunlight=sun*(.31+bands*.2)+path*below*(.025+bands*.19);
 color+=mix(vec3(1.0,.69,.26)*sunlight,vec3(.88,.85,.62)*moonlight,uNight);
 // A narrow, stationary water-only blend avoids a hard seam at the shore.
 vec3 original=texture2D(uBackdrop,vUv).rgb;
 original=mix(original,original*vec3(.045,.075,.17)+vec3(.003,.006,.018),uNight);
 color=mix(original,color,smoothstep(.003,.025,vShore));
 gl_FragColor=vec4(color,1.0);
 #include <colorspace_fragment>
}`;
/** Already 1720×1075 world units: do not scale. update owns y=-29*scroll, z=-43. */
export function createRiverSurface(){
 const columns=256,rows=96,positions:number[]=[],uvs:number[]=[],indices:number[]=[];
 for(let row=0;row<=rows;row++)for(let col=0;col<=columns;col++){
  // More rows near the far bank resolve the tighter projected wavelengths.
  const u=col/columns,v=(1-Math.pow(1-row/rows,1.6))*(riverShoreV(u)-.0035);
  positions.push((u-.5)*RIVER_WIDTH,(v-.5)*RIVER_HEIGHT,0);uvs.push(u,v);
 }
 for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
  const a=row*(columns+1)+col,b=a+1,c=a+columns+1,d=c+1;indices.push(a,b,d,a,d,c);
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeBoundingSphere();
 const waves=Array.from({length:MAX_WAVES},()=>new THREE.Vector4(0,0,-100,0));
 const material=new THREE.ShaderMaterial({uniforms:{uBackdrop:{value:null},uTime:{value:0},uAmbient:{value:1},uNight:{value:0},uScroll:{value:0},uMoon:{value:new THREE.Vector2(250,31)},uWaves:{value:waves}},vertexShader,fragmentShader,side:THREE.DoubleSide,depthWrite:true});
 const mesh=new THREE.Mesh(geometry,material);mesh.name='Perspective river surface';mesh.position.z=-43;mesh.visible=false;mesh.frustumCulled=false;
 let destroyed=false;
 return {mesh,
  setTexture(texture:THREE.Texture){if(!destroyed){material.uniforms.uBackdrop!.value=texture;mesh.visible=true;}},
  update(s:RiverUpdate){
   if(destroyed)return;mesh.position.y=-29*s.scroll;
   material.uniforms.uTime!.value=s.time;material.uniforms.uAmbient!.value=s.ambient?1:0;
   material.uniforms.uNight!.value=THREE.MathUtils.clamp(s.night,0,1);material.uniforms.uScroll!.value=s.scroll;
   (material.uniforms.uMoon!.value as THREE.Vector2).copy(s.moon);
   const active=s.waves.slice(-MAX_WAVES);
   for(let i=0;i<MAX_WAVES;i++){
    const w=active[i],u=w?w.x/RIVER_WIDTH+.5:-1,v=w?(w.y-mesh.position.y)/RIVER_HEIGHT+.5:-1;
    if(w&&riverContains(u,v)&&Number.isFinite(w.born+w.strength))waves[i]!.set(u,v,w.born,THREE.MathUtils.clamp(w.strength,0,24));else waves[i]!.set(0,0,-100,0);
   }
  },
  destroy(){if(!destroyed){destroyed=true;geometry.dispose();material.dispose();mesh.removeFromParent();}}
 };
}
