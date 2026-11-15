import * as THREE from 'three';
import {MAX_WAVES,RIVER_WAVE_GLSL,RIVER_WIDTH,RIVER_HEIGHT,riverContains,type WaterImpulse} from './water-physics';

/** A fresh render of the vessel, mirrored and distorted by the river's wave field. */
export function createBoatWater(renderer:THREE.WebGLRenderer,scene:THREE.Scene,boat:THREE.Group,lighting:THREE.Group) {
  boat.traverse(o=>o.layers.enable(1));lighting.traverse(o=>o.layers.enable(1));
  const target=new THREE.WebGLRenderTarget(512,256,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true,generateMipmaps:false});
  const camera=new THREE.OrthographicCamera(-140,140,125,-15,.1,1000);camera.layers.set(1);
  const group=new THREE.Group();group.name='Houseboat reflection and water contact';
  const waves=Array.from({length:MAX_WAVES},()=>new THREE.Vector4(0,0,-100,0));
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{
    uBoat:{value:target.texture},uTime:{value:0},uNight:{value:0},uAmbient:{value:1},uSurfaceOffset:{value:0},uWaves:{value:waves},uSpeed:{value:0},
  },vertexShader:`varying vec2 vUv;varying vec2 vWorld;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.0);vWorld=w.xy;gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:`
    uniform sampler2D uBoat;uniform float uTime,uNight,uAmbient,uSurfaceOffset,uSpeed;uniform vec4 uWaves[10];
    varying vec2 vUv;varying vec2 vWorld;
    ${RIVER_WAVE_GLSL}
    void main(){
      vec2 riverUv=vec2(vWorld.x/1720.0+.5,(vWorld.y-uSurfaceOffset)/1075.0+.5);
      if(riverUv.y>=riverShore(riverUv.x)-.003)discard;
      float h=riverHeight(riverUv),hx=riverHeight(riverUv+vec2(.001,0));
      float distanceFromHull=1.0-vUv.y;
      vec2 uv=vec2(vUv.x,1.0-vUv.y);
      uv.x+=(hx-h)*.013+h*.0015+sin(vWorld.y*.36+uTime*.8*uAmbient)*.002*distanceFromHull;
      uv.y+=h*.0025;
      if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0)discard;
      vec4 reflected=texture2D(uBoat,uv);
      vec3 waterTint=mix(vec3(.38,.58,.53),vec3(.10,.19,.26),uNight);
      vec3 color=mix(reflected.rgb,waterTint,.30);
      float broken=.77+.23*sin(vWorld.y*.66+h*.7);
      float fade=pow(vUv.y,1.05)*smoothstep(0.0,.035,vUv.x)*smoothstep(0.0,.035,1.0-vUv.x);
      float alpha=reflected.a*fade*broken*mix(.62,.82,uNight);
      gl_FragColor=vec4(color,alpha);
      #include <colorspace_fragment>
    }`});
  const reflection=new THREE.Mesh(new THREE.PlaneGeometry(280,82),material);reflection.position.set(0,-48,4);group.add(reflection);
  const contactMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uTime:{value:0},uMotion:{value:1},uSpeed:{value:0},uNight:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:`
    varying vec2 vUv;uniform float uTime,uMotion,uSpeed,uNight;
    void main(){vec2 p=(vUv-.5)*2.0;float r=length(p*vec2(1.0,1.7));
      float shadow=exp(-pow(p.x/.88,6.0)-p.y*p.y*8.0)*.24;
      float trail=exp(-pow((r-.90)/.035,2.0))*(.04+.11*uSpeed);
      trail*=.65+.35*sin(p.x*36.0+uTime*1.2*uMotion);
      vec3 color=mix(vec3(.045,.12,.10),vec3(.64,.76,.68),trail/(shadow+trail+.001));
      color*=1.0-uNight*.65;
      gl_FragColor=vec4(color,shadow+trail);
      #include <colorspace_fragment>
    }`});
  const contact=new THREE.Mesh(new THREE.PlaneGeometry(268,25),contactMaterial);contact.position.set(0,-8,5);group.add(contact);
  let destroyed=false;
  return {group,update(state:{time:number;night:number;reducedMotion:boolean;surfaceOffset:number;waves:WaterImpulse[];speed:number;waterY:number}){
    if(destroyed)return;
    group.position.set(boat.position.x,state.waterY,0);
    camera.position.set(boat.position.x,boat.position.y,300);camera.updateMatrixWorld();
    material.uniforms.uTime!.value=state.time;material.uniforms.uNight!.value=state.night;material.uniforms.uAmbient!.value=state.reducedMotion?0:1;material.uniforms.uSurfaceOffset!.value=state.surfaceOffset;
    const active=state.waves.slice(-MAX_WAVES);
    for(let i=0;i<MAX_WAVES;i++) {const w=active[i],u=w?w.x/RIVER_WIDTH+.5:-1,v=w?(w.y-state.surfaceOffset)/RIVER_HEIGHT+.5:-1;if(w&&riverContains(u,v))waves[i]!.set(u,v,w.born,w.strength);else waves[i]!.set(0,0,-100,0);}
    contactMaterial.uniforms.uTime!.value=state.time;contactMaterial.uniforms.uMotion!.value=state.reducedMotion?0:1;contactMaterial.uniforms.uSpeed!.value=Math.min(1,Math.abs(state.speed)/60);contactMaterial.uniforms.uNight!.value=state.night;
    const previous=renderer.getRenderTarget();renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);renderer.setRenderTarget(previous);
  },destroy(){if(destroyed)return;destroyed=true;group.removeFromParent();target.dispose();reflection.geometry.dispose();material.dispose();contact.geometry.dispose();contactMaterial.dispose();}};
}
