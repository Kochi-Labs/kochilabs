export type WaterImpulse = { x: number; y: number; born: number; strength: number };

export const WAVE_LIFETIME = 5;
export const MAX_WAVES = 10;

/** Same damped, elliptical travelling wave as the GPU water shader. */
export function sampleWaterHeight(x: number, y: number, time: number, waves: WaterImpulse[], ambient = true): number {
  let height = ambient ? Math.sin(time * 1.2 + x * .014) * 1.3 + Math.sin(time * .72 + x * .024) * .7 : 0;
  for (const wave of waves) {
    const age = time - wave.born;
    if (age < 0 || age > WAVE_LIFETIME) continue;
    const radius = Math.hypot((x - wave.x) * .64, (y - wave.y) * 1.45);
    const front = radius - age * 145;
    height += Math.sin(front * .08) * Math.exp(-(front * front) / 3600) * Math.exp(-age * .7) * wave.strength;
  }
  return height;
}

export function springStep(position: number, velocity: number, target: number, stiffness: number, damping: number, dt: number): [number, number] {
  const nextVelocity = velocity + ((target - position) * stiffness - velocity * damping) * dt;
  return [position + nextVelocity * dt, nextVelocity];
}
