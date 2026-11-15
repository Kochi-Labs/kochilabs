import * as THREE from 'three';
import {createRealisticDragon} from './realistic-dragon';
import {createMetroWeatherEffects} from './metro-weather-effects';
import {createMetroDamage} from './metro-damage';
const smooth=(a:number,b:number,x:number)=>THREE.MathUtils.smoothstep(x,a,b);
/** The rain drives extinguishing; cooled, physical damage remains afterward. */
export function sampleDragonSequence(time:number) {
  const rain=smooth(8.2,10.4,time)*(1-smooth(18,22,time));
  const extinguish=smooth(9.5,15.5,time);
  return {
    breath:smooth(3.1,3.5,time)*(1-smooth(7.6,8.2,time)),
    burn:smooth(3.4,6.5,time)*(1-extinguish),
    rain,
    steam:smooth(9.5,12,time)*(1-smooth(17,21,time)),
    damage:smooth(3.5,8,time),
    phase:time>=15.5?'cooled':time>=8.2?'rain':time>=3.1?'fire':'emerging',
  } as const;
}
export function createMetroPassenger(train:THREE.Group) {
  const cars=train.children.filter((o):o is THREE.Group=>o instanceof THREE.Group).sort((a,b)=>a.position.x-b.position.x);
  const carriage=cars[0];if(!carriage)throw new Error('A rear carriage is required.');
  const group=new THREE.Group();group.name='Dragon, fire and rain sequence';train.add(group);
  const dragon=createRealisticDragon(),effects=createMetroWeatherEffects(),damage=createMetroDamage(cars.slice(1,3));
  group.add(dragon.group,effects.group,damage.group);dragon.group.visible=false;
  const mouth=new THREE.Vector3(),target=new THREE.Vector3();
  const originX=carriage.position.x-18;
  let clicks=0,active=false,revealed=false,elapsed=0,rain=0,phase='idle',destroyed=false,wet=0;
  return {
    group,get active(){return active;},get revealed(){return revealed;},get tapCount(){return clicks;},get rain(){return rain;},get phase(){return phase;},get damage(){return damage.damage;},
    hitTest(object:THREE.Object3D){let ancestor:THREE.Object3D|null=object;while(ancestor&&ancestor!==train){if(ancestor===carriage)return true;ancestor=ancestor.parent;}return false;},
    tap(){if(destroyed||active)return false;clicks++;if(clicks<3)return false;clicks=3;active=true;revealed=true;elapsed=0;phase='emerging';wet=0;damage.reset();dragon.group.visible=true;return true;},
    resetDamage(){if(!active){damage.reset();wet=0;}},
    update(dt:number,night:number,reducedMotion:boolean){
      if(destroyed)return;
      const step=THREE.MathUtils.clamp(dt,0,.05);
      if(active)elapsed+=step;
      const t=elapsed,sequence=active?sampleDragonSequence(t):{breath:0,burn:0,rain:0,steam:0,damage:0,phase:'idle'};
      rain=sequence.rain;phase=active?sequence.phase:'idle';wet=Math.max(wet,rain);
      if(active){
        const rise=reducedMotion?1:smooth(.5,2.8,t),depart=reducedMotion?0:smooth(8,12,t);
        const size=THREE.MathUtils.lerp(.10,1.85,rise)*(1-depart*.25);
        dragon.group.scale.setScalar(size);
        dragon.group.position.set(THREE.MathUtils.lerp(originX,-84,rise)+depart*330,THREE.MathUtils.lerp(20,80,rise)+depart*160+(reducedMotion?0:Math.sin(t*1.7)*2*rise),32);
        dragon.group.visible=t<12;
        dragon.update(t,rise,sequence.breath,night,reducedMotion);
        group.updateMatrixWorld(true);
        dragon.mouth.getWorldPosition(mouth);group.worldToLocal(mouth);
        const sweep=smooth(3.3,7.6,t);
        target.set(-25+sweep*160,30,20);
        damage.update(sequence.damage,sequence.burn,wet,night,smooth(4.5,7.5,t));
      }else damage.update(0,0,wet,night);
      effects.update({time:t,mouth,target,breath:sequence.breath,burn:sequence.burn,rain,steam:sequence.steam,night,reducedMotion});
      if(active&&t>=22){active=false;clicks=0;rain=0;phase='idle';dragon.group.visible=false;}
    },
    destroy(){if(destroyed)return;destroyed=true;active=false;dragon.destroy();effects.destroy();damage.destroy();group.removeFromParent();},
  };
}
