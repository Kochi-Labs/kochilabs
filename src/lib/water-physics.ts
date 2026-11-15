export type WaterImpulse = { x: number; y: number; born: number; strength: number };
export const WAVE_LIFETIME = 6;
export const MAX_WAVES = 10;
export const RIVER_WIDTH = 1720;
export const RIVER_HEIGHT = 1075;
const SHORE = [[0,.232],[.088,.242],[.139,.294],[.19,.339],[.4,.347],[.6,.347],[.84,.342],[.87,.309],[.921,.276],[1,.261]] as const;
export function riverShoreV(u:number):number {
 const x=Math.max(0,Math.min(1,Number.isFinite(u)?u:.5));
 for(let i=1;i<SHORE.length;i++){const a=SHORE[i-1]!,b=SHORE[i]!;if(x<=b[0])return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);}
 return .261;
}
export function riverContains(u:number,v:number):boolean {return Number.isFinite(u+v)&&u>=0&&u<=1&&v>=0&&v<riverShoreV(u)-.003;}
/** 0 is the distant shore; 1 is the near foreground. */
export function riverDepth(v:number):number {return Math.max(0,Math.min(1,(.355-v)/.355));}
function smoothstep(a:number,b:number,x:number){const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);}
// A circular wave in the water plane projects as an ellipse; both its radius
// and amplitude shrink with distance. Each impulse keeps its own local scale.
function hash(x:number,y:number){const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);}
function noise(x:number,y:number){const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);return (hash(ix,iy)*(1-sx)+hash(ix+1,iy)*sx)*(1-sy)+(hash(ix,iy+1)*(1-sx)+hash(ix+1,iy+1)*sx)*sy;}
/** Shared CPU/GPU wave field, in actual displayed world-height units. */
export function sampleWaterHeight(x:number,y:number,time:number,waves:WaterImpulse[],ambient=true,surfaceOffsetY=0):number {
 const u=x/RIVER_WIDTH+.5,v=(y-surfaceOffsetY)/RIVER_HEIGHT+.5;
 if(!riverContains(u,v)||!Number.isFinite(time))return 0;
 const depth=riverDepth(v),p=.28+.72*depth;
 const qx=(u-.5)*1720/(.55+.45*depth),qy=v*1075*2.3;
 const warp=noise(qx*.009+time*.07,qy*.009-time*.04)*2;
 let h=ambient?((noise(qx*.018+warp-time*.12,qy*.018+warp+time*.07)-.5)*1.5+(noise(qx*.043+time*.09,qy*.043-time*.13)-.5)*.55)*p:0;
 for(const wave of waves.slice(-MAX_WAVES)){
  const age=time-wave.born,wu=wave.x/RIVER_WIDTH+.5,wv=(wave.y-surfaceOffsetY)/RIVER_HEIGHT+.5;
  if(!Number.isFinite(age+wave.strength)||age<0||age>WAVE_LIFETIME||!riverContains(wu,wv))continue;
  const depthAtOrigin=riverDepth(wv),scale=.28+.72*depthAtOrigin,foreshorten=.42+.18*depthAtOrigin;
  const radius=Math.hypot((u-wu)*1720,(v-wv)*1075/foreshorten)/scale;
  const front=radius-age*105,width=22+age*4;
  h+=Math.cos(front*.115)*Math.exp(-front*front/(2*width*width))*Math.exp(-age*.32-radius*.0012)*smoothstep(0,.14,age)*(1-smoothstep(4.5,6,age))*Math.max(0,Math.min(28,wave.strength))*.8*scale;
 }
 return Math.max(-9,Math.min(9,h*smoothstep(.003,.022,riverShoreV(u)-v)));
}
export const RIVER_WAVE_GLSL = `
float riverShore(float u){
${SHORE.slice(1).map((b,i)=>`if(u<=${b[0].toFixed(6)})return mix(${SHORE[i]![1].toFixed(6)},${b[1].toFixed(6)},clamp((u-${SHORE[i]![0].toFixed(6)})/${(b[0]-SHORE[i]![0]).toFixed(6)},0.0,1.0));`).join('\n')}
return .261;
}
float waterHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float waterNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(waterHash(i),waterHash(i+vec2(1.0,0.0)),f.x),mix(waterHash(i+vec2(0.0,1.0)),waterHash(i+vec2(1.0)),f.x),f.y);}
float riverHeight(vec2 uv){
 if(uv.y>=riverShore(uv.x)-.003||uv.y<0.0)return 0.0;
 float depth=clamp((.355-uv.y)/.355,0.0,1.0),p=.28+.72*depth;
 vec2 q=vec2((uv.x-.5)*1720.0/(.55+.45*depth),uv.y*1075.0*2.3);
 float warp=waterNoise(q*.009+vec2(uTime*.07,-uTime*.04))*2.0;
 float h=((waterNoise(q*.018+warp+vec2(-uTime*.12,uTime*.07))-.5)*1.5+(waterNoise(q*.043+vec2(uTime*.09,-uTime*.13))-.5)*.55)*p*uAmbient;
 for(int i=0;i<10;i++){
  vec4 w=uWaves[i];float age=uTime-w.z;
  if(w.w>0.0&&age>=0.0&&age<=6.0){
   float d=clamp((.355-w.y)/.355,0.0,1.0),scale=.28+.72*d,foreshorten=.42+.18*d;
   float r=length((uv-w.xy)*vec2(1720.0,1075.0/foreshorten))/scale;
   float f=r-age*105.0,width=22.0+age*4.0;
   h+=cos(f*.115)*exp(-f*f/(2.0*width*width))*exp(-age*.32-r*.0012)*smoothstep(0.0,.14,age)*(1.0-smoothstep(4.5,6.0,age))*min(w.w,28.0)*.8*scale;
  }
 }
 return clamp(h*smoothstep(.003,.022,riverShore(uv.x)-uv.y),-9.0,9.0);
}`;
export function springStep(position:number,velocity:number,target:number,stiffness:number,damping:number,dt:number):[number,number]{const next=velocity+((target-position)*stiffness-velocity*damping)*dt;return [position+next*dt,next];}
