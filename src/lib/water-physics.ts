export type WaterImpulse = { x: number; y: number; born: number; strength: number };
export const WAVE_LIFETIME = 5;
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
function riverPoint(u:number,v:number):[number,number,number]{const p=.22+.78*riverDepth(v);return [(u-.5)*RIVER_WIDTH/p,-1050/p,p];}
/** Shared perspective wave field. Offset is the background's current world Y. */
export function sampleWaterHeight(x:number,y:number,time:number,waves:WaterImpulse[],ambient=true,surfaceOffsetY=0):number {
 const u=x/RIVER_WIDTH+.5,v=(y-surfaceOffsetY)/RIVER_HEIGHT+.5;
 if(!riverContains(u,v)||!Number.isFinite(time))return 0;
 const [px,pz,p]=riverPoint(u,v);
 let h=ambient?Math.sin(px*.028+pz*.018-time*1.1)*.55+Math.cos(px*.047-pz*.011+time*.7)*.35:0;
 for(const wave of waves.slice(-MAX_WAVES)){
  const age=time-wave.born,wu=wave.x/RIVER_WIDTH+.5,wv=(wave.y-surfaceOffsetY)/RIVER_HEIGHT+.5;
  if(!Number.isFinite(age+wave.strength)||age<0||age>WAVE_LIFETIME||!riverContains(wu,wv))continue;
  const [wx,wz]=riverPoint(wu,wv),radius=Math.hypot(px-wx,pz-wz),front=radius-age*160;
  h+=Math.sin(front*.055)*Math.exp(-front*front/6400)*Math.exp(-age*.5-radius/1100)*Math.max(0,Math.min(24,wave.strength))*.65;
 }
 return Math.max(-7,Math.min(7,h*p*smoothstep(.003,.022,riverShoreV(u)-v)));
}
export const RIVER_WAVE_GLSL = `
float riverShore(float u){
${SHORE.slice(1).map((b,i)=>`if(u<=${b[0].toFixed(6)})return mix(${SHORE[i]![1].toFixed(6)},${b[1].toFixed(6)},clamp((u-${SHORE[i]![0].toFixed(6)})/${(b[0]-SHORE[i]![0]).toFixed(6)},0.0,1.0));`).join('\n')}
return .261;
}
vec3 riverPoint(vec2 uv){float p=.22+.78*clamp((.355-uv.y)/.355,0.0,1.0);return vec3((uv.x-.5)*1720.0/p,-1050.0/p,p);}
float riverHeight(vec2 uv){
 if(uv.y>=riverShore(uv.x)-.003||uv.y<0.0)return 0.0;
 vec3 p=riverPoint(uv);
 float h=(sin(p.x*.028+p.y*.018-uTime*1.1)*.55+cos(p.x*.047-p.y*.011+uTime*.7)*.35)*uAmbient;
 for(int i=0;i<10;i++){
  vec4 w=uWaves[i];float age=uTime-w.z;
  if(w.w>0.0&&age>=0.0&&age<=5.0){vec3 o=riverPoint(w.xy);float r=length(p.xy-o.xy);float f=r-age*160.0;h+=sin(f*.055)*exp(-f*f/6400.0)*exp(-age*.5-r/1100.0)*min(w.w,24.0)*.65;}
 }
 return clamp(h*p.z*smoothstep(.003,.022,riverShore(uv.x)-uv.y),-7.0,7.0);
}`;
export function springStep(position:number,velocity:number,target:number,stiffness:number,damping:number,dt:number):[number,number]{const next=velocity+((target-position)*stiffness-velocity*damping)*dt;return [position+next*dt,next];}
