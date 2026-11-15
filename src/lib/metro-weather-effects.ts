import * as THREE from 'three';

export type MetroWeatherState = {
  time: number;
  mouth: THREE.Vector3;
  target: THREE.Vector3;
  breath: number;
  burn: number;
  rain: number;
  steam: number;
  night: number;
  reducedMotion: boolean;
};

const noiseShader = `
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) { vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0)),f.x),f.y); }
float fbm(vec2 p) { float f=0.0,a=.55; for(int i=0;i<4;i++){f+=a*noise(p);p=mat2(1.6,1.2,-1.2,1.6)*p+3.1;a*=.48;} return f; }
`;
const flameFragment = `
uniform float uTime,uStrength,uMotion,uNight;
varying vec2 vUv;
varying float vSeed;
varying float vPower;
${noiseShader}
void main(){
 vec2 uv=vUv;float t=uTime*uMotion;
 float curl=fbm(vec2(uv.x*4.0+vSeed,uv.y*5.0-t*2.7));
 float wisps=fbm(vec2(uv.x*8.0+curl*2.5,uv.y*7.0-t*4.2)+vSeed);
 float x=uv.x-.5+(curl-.5)*(.08+uv.y*.25);
 float taper=mix(.47,.025,pow(uv.y,.75));
 float body=1.0-smoothstep(taper*.3,taper,abs(x));
 float height=1.0-smoothstep(.28,.98,uv.y+(wisps-.5)*.42);
 float density=body*height*(.35+wisps*.85)*smoothstep(0.0,.06,uv.y);
 float heat=clamp((1.0-uv.y)*.78+body*.42+wisps*.16-.2,0.0,1.0);
 vec3 color=mix(vec3(.5,.035,.008),vec3(1.0,.24,.018),smoothstep(.05,.4,heat));
 color=mix(color,vec3(1.0,.73,.19),smoothstep(.42,.78,heat));
 color=mix(color,vec3(1.0,.98,.79),smoothstep(.78,1.0,heat));
 float alpha=clamp(density*vPower,0.0,.96);
 if(alpha<.006)discard;
 gl_FragColor=vec4(color*(1.0+uNight*.15),alpha);
 #include <colorspace_fragment>
}`;
const breathFragment = `
uniform float uTime,uStrength,uMotion,uNight;
varying vec2 vUv;
${noiseShader}
void main(){
 float t=uTime*uMotion;vec2 uv=vUv;
 float billow=fbm(vec2(uv.x*8.0-t*3.8,uv.y*3.3));
 float fine=fbm(vec2(uv.x*18.0-t*7.0,uv.y*6.0)+billow*2.0);
 float center=uv.y-.5+(billow-.5)*.2;
 float edge=1.0-smoothstep(.08,.45+billow*.08,abs(center));
 float end=1.0-smoothstep(.72,1.0,uv.x+fine*.08);
 float start=smoothstep(0.0,.035,uv.x);
 float core=exp(-center*center*48.0)*(1.0-uv.x*.6);
 float heat=clamp(core*.8+fine*.32,0.0,1.0);
 vec3 color=mix(vec3(.68,.05,.009),vec3(1.0,.4,.035),heat);
 color=mix(color,vec3(1.0,.94,.65),pow(heat,3.0));
 float alpha=edge*end*start*(.45+fine*.55)*uStrength;
 if(alpha<.008)discard;
 gl_FragColor=vec4(color*(1.0+uNight*.2),alpha);
 #include <colorspace_fragment>
}`;
const puffVertex = `
attribute float aSeed;
attribute vec3 aOrigin;
uniform float uTime,uStrength,uMotion,uSteam;
varying vec2 vUv;
varying float vLife,vSeed;
void main(){
 float age=fract(aSeed+uTime*(.11+uSteam*.025)*uMotion);
 vLife=age;vSeed=aSeed*33.0;vUv=uv;
 float size=(12.0+age*(36.0+uSteam*7.0))*(.65+fract(aSeed*7.3)*.6);
 vec3 p=position*size+aOrigin;
 p.x+=sin(age*5.0+aSeed*24.0)*(4.0+age*15.0)+age*12.0;
 p.y+=age*(80.0+uSteam*20.0);
 p.z+=aSeed*3.0;
 gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
}`;
const puffFragment = `
uniform float uTime,uStrength,uMotion,uSteam,uNight;
varying vec2 vUv;varying float vLife,vSeed;
${noiseShader}
void main(){
 vec2 p=(vUv-.5)*2.0;
 float grain=fbm(vUv*5.0+vSeed+vec2(uTime*.08,-uTime*.13)*uMotion);
 float density=(1.0-smoothstep(.32,1.05,length(p)+(grain-.5)*.45));
 density*=smoothstep(0.0,.14,vLife)*(1.0-smoothstep(.45,1.0,vLife));
 vec3 smoke=mix(vec3(.10,.105,.11),vec3(.27,.27,.25),grain);
 vec3 steam=mix(vec3(.52,.58,.58),vec3(.86,.9,.88),grain);
 vec3 color=mix(smoke,steam,uSteam)*mix(1.0,.57,uNight);
 float alpha=density*uStrength*mix(.43,.25,uSteam);
 if(alpha<.005)discard;
 gl_FragColor=vec4(color,alpha);
 #include <colorspace_fragment>
}`;

/** Procedural fire, smoke, rain, and steam. All buffers are allocated once. */
export function createMetroWeatherEffects() {
  const group = new THREE.Group();
  group.name = 'Fire rain and steam';
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const clamp = (value: number) => Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0;
  function material(vertexShader: string, fragmentShader: string, extra: Record<string, THREE.IUniform> = {}) {
    const result = new THREE.ShaderMaterial({
      uniforms: {uTime:{value:0},uStrength:{value:0},uMotion:{value:1},uNight:{value:0},...extra},
      vertexShader,fragmentShader,transparent:true,depthWrite:false,side:THREE.DoubleSide,
    });
    materials.add(result);return result;
  }
  const quad = new THREE.PlaneGeometry(1,1);
  geometries.add(quad);
  function instanced(count: number, centerY: number) {
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index=quad.index;
    geometry.attributes.position=quad.attributes.position!;
    geometry.attributes.uv=quad.attributes.uv!;
    geometry.instanceCount=count;
    const seeds=new Float32Array(count),origins=new Float32Array(count*3);
    for(let i=0;i<count;i++){
      const car=i%2,slot=Math.floor(i/2),half=count/2;
      seeds[i]=(i*.61803398875)%1;
      origins.set([car*101-38+(slot/(half-1))*76,centerY,18+seeds[i]*4],i*3);
    }
    geometry.setAttribute('aSeed',new THREE.InstancedBufferAttribute(seeds,1));
    geometry.setAttribute('aOrigin',new THREE.InstancedBufferAttribute(origins,3));
    geometries.add(geometry);return geometry;
  }
  const roofMaterial=material(`
attribute float aSeed;attribute vec3 aOrigin;
uniform float uTime,uStrength,uMotion;
varying vec2 vUv;varying float vSeed;varying float vPower;
void main(){
 vUv=uv;vSeed=aSeed*41.0;
 float ignition=3.3+(aOrigin.x+38.0)/177.0*3.1;
 vPower=uStrength*smoothstep(ignition,ignition+.7,uTime);
 float sway=sin(uTime*3.0+aSeed*21.0)*uMotion;
 float height=(19.0+aSeed*26.0)*(.35+.65*uStrength);
 vec3 p=position;
 p.x*=13.0+aSeed*10.0;
 p.y=(p.y+.5)*height;
 p.x+=p.y*.12*sway;
 p+=aOrigin;
 gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
}`,flameFragment);
  const roofFire=new THREE.Mesh(instanced(28,27.5),roofMaterial);roofFire.name='Turbulent carriage flames';roofFire.frustumCulled=false;roofFire.renderOrder=5;group.add(roofFire);
  const smokeMaterial=material(puffVertex,puffFragment,{uSteam:{value:0}});
  const smoke=new THREE.Mesh(instanced(44,32),smokeMaterial);smoke.name='Rising soot';smoke.frustumCulled=false;smoke.renderOrder=4;group.add(smoke);
  const steamMaterial=material(puffVertex,puffFragment,{uSteam:{value:1}});
  const steam=new THREE.Mesh(instanced(32,31),steamMaterial);steam.name='Rain cooling steam';steam.frustumCulled=false;steam.renderOrder=7;group.add(steam);

  const breathGeometry=new THREE.BufferGeometry();
  const segments=36,breathPositions=new Float32Array((segments+1)*6),uvs=new Float32Array((segments+1)*4),indices:number[]=[];
  for(let i=0;i<=segments;i++){uvs.set([i/segments,0,i/segments,1],i*4);if(i<segments){let a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}}
  breathGeometry.setAttribute('position',new THREE.BufferAttribute(breathPositions,3).setUsage(THREE.DynamicDrawUsage));
  breathGeometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));breathGeometry.setIndex(indices);geometries.add(breathGeometry);
  const breathMaterial=material('varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',breathFragment);
  const breath=new THREE.Mesh(breathGeometry,breathMaterial);breath.name='Turbulent dragon breath';breath.frustumCulled=false;breath.renderOrder=6;group.add(breath);

  const emberCount=64,emberPositions=new Float32Array(emberCount*3),emberSizes=new Float32Array(emberCount),emberSeeds=new Float32Array(emberCount);
  for(let i=0;i<emberCount;i++){emberSeeds[i]=(i*.61803398875)%1;emberSizes[i]=1+emberSeeds[i]*2;}
  const emberGeometry=new THREE.BufferGeometry();geometries.add(emberGeometry);
  emberGeometry.setAttribute('position',new THREE.BufferAttribute(emberPositions,3).setUsage(THREE.DynamicDrawUsage));emberGeometry.setAttribute('aSize',new THREE.BufferAttribute(emberSizes,1));
  const emberMaterial=material('attribute float aSize;void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_PointSize=aSize;}',`uniform float uStrength;void main(){float r=length(gl_PointCoord-.5)*2.0;gl_FragColor=vec4(1.0,.45,.055,(1.0-smoothstep(.1,1.0,r))*uStrength);}`);
  emberMaterial.blending=THREE.AdditiveBlending;
  const embers=new THREE.Points(emberGeometry,emberMaterial);embers.name='Hot windblown embers';embers.frustumCulled=false;embers.renderOrder=8;group.add(embers);

  const rainCount=720,rainPositions=new Float32Array(rainCount*6),rainSeeds=new Float32Array(rainCount*3);
  for(let i=0;i<rainCount;i++){rainSeeds.set([(i*.754877666)%1,(i*.569840296)%1,(i*.438579)%1],i*3);}
  const rainGeometry=new THREE.BufferGeometry();geometries.add(rainGeometry);rainGeometry.setAttribute('position',new THREE.BufferAttribute(rainPositions,3).setUsage(THREE.DynamicDrawUsage));
  const rainMaterial=new THREE.LineBasicMaterial({color:'#c2d9df',transparent:true,opacity:0,depthWrite:false});materials.add(rainMaterial);
  const rain=new THREE.LineSegments(rainGeometry,rainMaterial);rain.name='Slanting monsoon rain';rain.frustumCulled=false;rain.renderOrder=9;group.add(rain);
  const splashCount=48,splashPositions=new Float32Array(splashCount*12);
  const splashGeometry=new THREE.BufferGeometry();geometries.add(splashGeometry);splashGeometry.setAttribute('position',new THREE.BufferAttribute(splashPositions,3).setUsage(THREE.DynamicDrawUsage));
  const splashMaterial=new THREE.LineBasicMaterial({color:'#d9e5e6',transparent:true,opacity:0,depthWrite:false});materials.add(splashMaterial);
  const splashes=new THREE.LineSegments(splashGeometry,splashMaterial);splashes.name='Rain hitting metro roof';splashes.frustumCulled=false;splashes.renderOrder=10;group.add(splashes);
  let destroyed=false;
  const shaderMaterials=[roofMaterial,smokeMaterial,steamMaterial,breathMaterial,emberMaterial];
  return {
    group,
    update(state: MetroWeatherState){
      if(destroyed)return;
      const t=Number.isFinite(state.time)?state.time:0;
      const wet=clamp(state.rain),burn=clamp(state.burn),fireStrength=burn*(1-wet*.35),motion=state.reducedMotion?0:1;
      for(const shader of shaderMaterials){shader.uniforms.uTime!.value=t;shader.uniforms.uMotion!.value=motion;shader.uniforms.uNight!.value=clamp(state.night);}
      roofMaterial.uniforms.uStrength!.value=fireStrength;
      smokeMaterial.uniforms.uStrength!.value=burn*(1-wet*.6);
      steamMaterial.uniforms.uStrength!.value=clamp(state.steam);
      breathMaterial.uniforms.uStrength!.value=clamp(state.breath);
      emberMaterial.uniforms.uStrength!.value=fireStrength*(1-wet*.7);
      roofFire.visible=fireStrength>.001;smoke.visible=burn>.001;steam.visible=state.steam>.001;breath.visible=state.breath>.001;embers.visible=fireStrength>.001;
      rain.visible=wet>.001;splashes.visible=wet>.001;
      const dx=state.target.x-state.mouth.x,dy=state.target.y-state.mouth.y,length=Math.max(1,Math.hypot(dx,dy));
      for(let i=0;i<=segments;i++){
        const f=i/segments;
        const wobble=Math.sin(f*22-t*8)*Math.sin(f*Math.PI)*3*motion;
        const width=(1.5+Math.pow(f,.7)*17)*(.3+.7*clamp(state.breath));
        for(let side=0;side<2;side++){
          const offset=(side?1:-1)*width+wobble,j=(i*2+side)*3;
          breathPositions[j]=state.mouth.x+dx*f-dy/length*offset;
          breathPositions[j+1]=state.mouth.y+dy*f+dx/length*offset;
          breathPositions[j+2]=THREE.MathUtils.lerp(state.mouth.z,state.target.z,f)+.4;
        }
      }
      breathGeometry.attributes.position!.needsUpdate=true;
      for(let i=0;i<emberCount;i++){
        const seed=emberSeeds[i]!,age=(seed+t*.38*motion)%1,j=i*3;
        emberPositions[j]=(i%2)*101-37+((i*13.17)%74)+age*18;
        emberPositions[j+1]=29+age*(25+seed*40)-age*age*17;
        emberPositions[j+2]=24+seed*6;
      }
      emberGeometry.attributes.position!.needsUpdate=true;
      rainMaterial.opacity=wet*(state.reducedMotion?.2:.43);splashMaterial.opacity=wet*.45;
      for(let i=0;i<rainCount;i++){
        const a=rainSeeds[i*3]!,b=rainSeeds[i*3+1]!,c=rainSeeds[i*3+2]!,phase=(b+t*(.48+c*.2)*motion)%1;
        const x=-900+a*1800-phase*120,y=600-phase*1050,z=60+c*12,streak=14+c*22,j=i*6;
        rainPositions[j]=x;rainPositions[j+1]=y;rainPositions[j+2]=z;
        rainPositions[j+3]=x+streak*.2;rainPositions[j+4]=y+streak;rainPositions[j+5]=z;
      }
      rainGeometry.attributes.position!.needsUpdate=true;
      for(let i=0;i<splashCount;i++){
        const age=((i*.618)+t*1.8*motion)%1,x=(i%2)*101-41+((i*17.13)%82),rise=Math.sin(age*Math.PI)*3,spread=age*3,j=i*12;
        splashPositions[j]=x-spread;splashPositions[j+1]=29+rise;splashPositions[j+2]=26;
        splashPositions[j+3]=x-spread-1;splashPositions[j+4]=30+rise;splashPositions[j+5]=26;
        splashPositions[j+6]=x+spread;splashPositions[j+7]=29+rise;splashPositions[j+8]=26;
        splashPositions[j+9]=x+spread+1;splashPositions[j+10]=30+rise;splashPositions[j+11]=26;
      }
      splashGeometry.attributes.position!.needsUpdate=true;
    },
    destroy(){
      if(destroyed)return;destroyed=true;group.removeFromParent();
      geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());group.clear();
    },
  };
}
