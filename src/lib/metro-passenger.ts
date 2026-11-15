import * as THREE from 'three';
import {createMetroWeatherEffects} from './metro-weather-effects';
import {createMetroDamage} from './metro-damage';
const smooth=(a:number,b:number,x:number)=>THREE.MathUtils.smoothstep(x,a,b);
/** The rear carriage burns; arriving rain extinguishes it and leaves cooled damage. */
export function sampleMetroFireSequence(time:number) {
  const rain=smooth(5,7,time)*(1-smooth(14,18,time));
  const extinguish=smooth(7,12,time);
  return {
    burn:smooth(0,.8,time)*(1-extinguish),
    rain,
    steam:smooth(7.5,10,time)*(1-smooth(14,17.8,time)),
    damage:smooth(.15,4.8,time),
    phase:time>=12?'cooled':time>=5?'rain':'fire',
  } as const;
}
/** Single-click metro interaction, retained under the existing controller API. */
export function createMetroPassenger(train:THREE.Group) {
  const cars=train.children.filter((o):o is THREE.Group=>o instanceof THREE.Group).sort((a,b)=>a.position.x-b.position.x);
  const carriage=cars[0];if(!carriage)throw new Error('A rear carriage is required.');
  const group=new THREE.Group();group.name='Rear carriage fire and rain';train.add(group);
  const effects=createMetroWeatherEffects([carriage.position.x]),damage=createMetroDamage(cars.slice(0,1));
  group.add(effects.group,damage.group);
  let clicks=0,active=false,revealed=false,elapsed=0,rain=0,phase='idle',destroyed=false,wet=0;
  return {
    group,get active(){return active;},get revealed(){return revealed;},get tapCount(){return clicks;},get rain(){return rain;},get phase(){return phase;},get damage(){return damage.damage;},
    hitTest(object:THREE.Object3D){let ancestor:THREE.Object3D|null=object;while(ancestor&&ancestor!==train){if(ancestor===carriage)return true;ancestor=ancestor.parent;}return false;},
    tap(){if(destroyed||active)return false;clicks=1;active=true;revealed=true;elapsed=0;phase='fire';wet=0;damage.reset();return true;},
    resetDamage(){if(!active){damage.reset();wet=0;}},
    update(dt:number,night:number,reducedMotion:boolean){
      if(destroyed)return;
      const step=Number.isFinite(dt)?THREE.MathUtils.clamp(dt,0,.05):0;
      if(active)elapsed+=step;
      const t=elapsed,sequence=active?sampleMetroFireSequence(t):{burn:0,rain:0,steam:0,damage:0,phase:'idle'};
      rain=sequence.rain;phase=active?sequence.phase:'idle';wet=Math.max(wet,rain);
      damage.update(sequence.damage,sequence.burn,wet,night);
      effects.update({time:t,burn:sequence.burn,rain,steam:sequence.steam,night,reducedMotion});
      if(active&&t>=18){active=false;clicks=0;rain=0;phase='idle';}
    },
    destroy(){if(destroyed)return;destroyed=true;active=false;effects.destroy();damage.destroy();group.removeFromParent();},
  };
}
