import * as THREE from 'three';
import { riverDepth, riverShoreV } from './water-physics';

// Crowns traced against kerala-backwaters-clean.png. Image UVs run bottom to top.
const CROWNS = [
  [.125, .975, .205, .24], [.105, .695, .103, .16],
  [.244, .505, .047, .075], [.198, .495, .034, .056],
  [.145, .491, .034, .058], [.348, .449, .033, .06],
  [.374, .432, .031, .052], [.306, .439, .024, .042],
  [.967, .778, .13, .165], [.917, .544, .064, .092],
  [.832, .49, .041, .065], [.869, .461, .037, .062],
  [.429, .414, .024, .038], [.453, .405, .025, .038],
  [.785, .424, .027, .04], [.026, .43, .095, .16],
] as const;

const HOUSE_PIXELS = [
  [207, 559, 384, 649], [558, 607, 626, 645], [686, 616, 716, 640],
  [737, 622, 766, 641], [808, 627, 830, 641], [892, 625, 915, 641],
  [973, 622, 1004, 641], [1036, 615, 1101, 642], [1108, 623, 1135, 641],
  [1173, 621, 1205, 641], [1241, 601, 1335, 645], [1439, 612, 1480, 640],
] as const;
const HOUSES = HOUSE_PIXELS.map(([left, top, right, bottom]) => new THREE.Vector4(left / 1585, 1 - bottom / 992, right / 1585, 1 - top / 992));

/** Include after the host shader's existing `uniform sampler2D uBackdrop;`. */
export const foliageShaderUniforms = `
uniform vec4 uFoliageCrowns[16];
uniform vec2 uFoliageBends[16];
uniform vec4 uFoliageHouses[12];
uniform vec3 uFoliagePointer;
uniform float uFoliageTime;
uniform float uFoliageWind;
uniform float uFoliageGrove;
`;

/** Apply to original image UVs before water displacement / final texture lookup. */
export const foliageShaderFunction = `
float foliageHouseMask(vec2 uv) {
  float excluded = 0.0;
  for (int i = 0; i < 12; i++) {
    vec4 house = uFoliageHouses[i];
    float inside = smoothstep(house.x - .001, house.x + .001, uv.x)
      * (1.0 - smoothstep(house.z - .001, house.z + .001, uv.x))
      * smoothstep(house.y - .001, house.y + .001, uv.y)
      * (1.0 - smoothstep(house.w - .001, house.w + .001, uv.y));
    excluded = max(excluded, inside);
  }
  return excluded;
}
vec2 swayFoliage(vec2 uv) {
  float excluded = foliageHouseMask(uv);
  vec3 pigment = texture2D(uBackdrop, uv).rgb;
  // Pigment masking is for groves; crown regions warp coherently so frond tips
  // can move into neighbouring sky without pinning their original silhouette.
  float vegetation = smoothstep(.018, .075, pigment.g - pigment.b)
    * (1.0 - smoothstep(.055, .18, pigment.r - pigment.g));
  vec2 offset = vec2(0.0);
  for (int i = 0; i < 16; i++) {
    vec4 crown = uFoliageCrowns[i];
    vec2 local = (uv - crown.xy) / crown.zw;
    float mask = 1.0 - smoothstep(.3, 1.0, dot(local, local));
    float anchored = smoothstep(-1.0, .15, local.y);
    float fronds = sin(local.x * 7.0 + local.y * 4.0 + uFoliageTime * 2.2 + float(i));
    float wind = sin(uFoliageTime * .85 + float(i) * 1.9) * .0009 * uFoliageWind;
    offset.x -= (uFoliageBends[i].x + wind + fronds * uFoliageBends[i].y * .15) * mask * anchored;
    offset.y += fronds * abs(uFoliageBends[i].x) * .14 * mask * anchored;
  }
  float grove = smoothstep(.345, .365, uv.y) * (1.0 - smoothstep(.411, .452, uv.y));
  float leftBank = (1.0 - smoothstep(.075, .145, uv.x))
    * smoothstep(.255, .34, uv.y) * (1.0 - smoothstep(.66, .76, uv.y));
  float rightBank = smoothstep(.93, .985, uv.x)
    * smoothstep(.29, .36, uv.y) * (1.0 - smoothstep(.58, .65, uv.y));
  float canopy = max(grove, max(leftBank, rightBank));
  float nearby = exp(-pow((uv.x - uFoliagePointer.x) / .14, 2.0));
  float groveWind = sin(uv.x * 38.0 + uFoliageTime * 1.2) * .00055 * uFoliageWind;
  offset.x -= (uFoliageGrove * (.2 + nearby * .8) + groveWind) * canopy * vegetation;
  offset *= 1.0 - excluded;
  return clamp(uv + clamp(offset, vec2(-.012), vec2(.012)), vec2(.001), vec2(.999));
}
`;

type Coconut = {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  x: number; y: number; vx: number; vy: number; waterY: number;
  born: number; landed: number | null; radius: number; startRadius: number; startY: number; phase: number;
};

export type LivingFoliage = {
  uniforms: Record<string, THREE.IUniform>;
  group: THREE.Group;
  move(u: number, v: number): void;
  leave(): void;
  hitTest(u: number, v: number): boolean;
  tap(u: number, v: number): boolean;
  shakeVisible(minU: number, maxU: number): void;
  update(dt: number, time: number, night: number, reducedMotion: boolean): void;
  destroy(): void;
};

export function createLivingFoliage(options: { onSplash?: (u: number, v: number) => void; waterHeight?: (u: number, v: number) => number } = {}): LivingFoliage {
  const group = new THREE.Group();
  group.name = 'Falling coconuts';
  const bends = CROWNS.map(() => new THREE.Vector2());
  const velocities = CROWNS.map(() => 0);
  const cooldowns = CROWNS.map(() => -100);
  const pointer = new THREE.Vector3(.5, .5, 0);
  const uniforms: Record<string, THREE.IUniform> = {
    uFoliageCrowns: { value: CROWNS.map((crown) => new THREE.Vector4(...crown)) },
    uFoliageBends: { value: bends },
    uFoliageHouses: { value: HOUSES.map((house) => house.clone()) },
    uFoliagePointer: { value: pointer },
    uFoliageTime: { value: 0 },
    uFoliageWind: { value: 1 },
    uFoliageGrove: { value: 0 },
  };
  const coconuts: Coconut[] = [];
  let clock = 0;
  let motion = 0;
  let grove = 0;
  let groveVelocity = 0;
  let lastMoveTime = -100;
  let direction = 0;
  let reversals = 0;
  let lastReversal = -100;
  let lastDrop = -100;
  let reduced = false;
  let destroyed = false;

  function insideHouse(u: number, v: number) {
    return HOUSES.some((house) => u >= house.x && u <= house.z && v >= house.y && v <= house.w);
  }

  function crownAt(u: number, v: number) {
    let nearest = -1;
    let bestDistance = 1;
    CROWNS.forEach(([x, y, rx, ry], index) => {
      const distance = ((u - x) / rx) ** 2 + ((v - y) / ry) ** 2;
      if (distance < bestDistance) { nearest = index; bestDistance = distance; }
    });
    return nearest;
  }

  function hitTest(u: number, v: number) {
    if (destroyed || !Number.isFinite(u + v) || u < 0 || u > 1 || v < 0 || v > 1 || insideHouse(u, v)) return false;
    return crownAt(u, v) >= 0 || (v > .355 && v < .43)
      || (u < .12 && v > .29 && v < .7) || (u > .95 && v > .33 && v < .62);
  }

  function removeCoconut(coconut: Coconut) {
    group.remove(coconut.mesh);
    coconut.mesh.geometry.dispose();
    coconut.mesh.material.dispose();
  }

  function drop(index: number, u: number, v: number) {
    // Bushes and the distant grove band can sway but cannot grow coconuts.
    if (index < 0 || index === CROWNS.length - 1) return;
    if (clock - lastDrop < .35 || (index >= 0 && clock - cooldowns[index]! < 1.4)) return;
    lastDrop = clock;
    if (index >= 0) cooldowns[index] = clock;
    if (coconuts.length >= 6) removeCoconut(coconuts.shift()!);
    const crown = index >= 0 ? CROWNS[index]! : null;
    const originU = crown ? crown[0] : u;
    const originV = crown ? crown[1] - .01 : Math.min(v + .015, .43);
    const nearness = THREE.MathUtils.clamp(((crown?.[2] ?? .025) - .025) / .18, 0, 1);
    const targetU = THREE.MathUtils.clamp(originU, .18, .88);
    const waterV = riverShoreV(targetU) - .018 - nearness * .06;
    const radius = .55 + riverDepth(waterV) * 4.2;
    const startRadius = .55 + nearness * 5.5;
    const geometry = new THREE.SphereGeometry(radius, 10, 7);
    const normals = geometry.getAttribute('normal');
    const colors = new Float32Array(normals.count * 3);
    const base = new THREE.Color('#8e743e');
    for (let i = 0; i < normals.count; i++) {
      const light = .68 + Math.max(0, normals.getY(i) * .6 - normals.getX(i) * .4 + normals.getZ(i) * .4) * .5;
      colors[i * 3] = base.r * light;
      colors[i * 3 + 1] = base.g * light;
      colors[i * 3 + 2] = base.b * light;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true }));
    mesh.scale.set(1, 1.14, 1);
    mesh.position.z = -27;
    group.add(mesh);
    const x = (originU - .5) * 1600;
    const y = (originV - .5) * 1000;
    const waterY = (waterV - .5) * 1000;
    const flightTime = Math.sqrt(Math.max(10, (y - waterY) * 2) / 245);
    const vx = ((targetU - .5) * 1600 - x) / flightTime + THREE.MathUtils.clamp(motion * 500, -12, 12);
    mesh.position.set(x, y, -27);
    coconuts.push({ mesh, x, y, vx, vy: 0, waterY, born: clock, landed: null, radius, startRadius, startY: y, phase: Math.random() * Math.PI * 2 });
  }

  function move(u: number, v: number) {
    if (destroyed || !Number.isFinite(u + v)) return;
    const delta = u - pointer.x;
    const elapsed = Math.max(.016, clock - lastMoveTime);
    const active = hitTest(u, v);
    if (pointer.z > 0 && elapsed < .25) {
      motion = THREE.MathUtils.clamp(delta / elapsed, -2, 2);
      if (active && Math.abs(delta) > .002) {
        const nextDirection = Math.sign(delta);
        if (direction && nextDirection !== direction) {
          reversals = clock - lastReversal < .75 ? reversals + 1 : 1;
          lastReversal = clock;
          if (reversals >= 2) { drop(crownAt(u, v), u, v); reversals = 0; }
        }
        direction = nextDirection;
      }
    }
    pointer.set(u, v, active ? 1 : 0);
    lastMoveTime = clock;
  }

  function leave() {
    pointer.z = 0;
    motion = 0;
    reversals = 0;
    direction = 0;
  }

  function tap(u: number, v: number) {
    if (!hitTest(u, v)) return false;
    move(u, v);
    const index = crownAt(u, v);
    if (index >= 0) velocities[index]! += (u < CROWNS[index]![0] ? -.065 : .065) * (reduced ? .45 : 1);
    else groveVelocity += .025 * (reduced ? .45 : 1);
    drop(index, u, v);
    return true;
  }

  function shakeVisible(minU: number, maxU: number) {
    if (destroyed) return;
    const left = THREE.MathUtils.clamp(Number.isFinite(minU) ? minU : 0, 0, 1);
    const right = THREE.MathUtils.clamp(Number.isFinite(maxU) ? maxU : 1, left, 1);
    const center = (left + right) / 2;
    const span = Math.max(.01, right - left);
    let chosen = -1;
    let score = -Infinity;
    CROWNS.forEach(([u, v, radius], index) => {
      if (u < left || u > right || v > .75 || index === CROWNS.length - 1) return;
      const visibility = radius * (1 - Math.abs(u - center) / span);
      if (visibility > score) { chosen = index; score = visibility; }
    });
    if (chosen >= 0) {
      const crown = CROWNS[chosen]!;
      tap(crown[0], crown[1]);
    } else {
      const overlapping = CROWNS.findIndex(([u, v, radius], index) => u + radius > left && u - radius < right && v < .75 && index !== CROWNS.length - 1);
      if (overlapping >= 0) {
        const crown = CROWNS[overlapping]!;
        tap(crown[0], crown[1]);
      }
    }
  }

  function update(dt: number, time: number, night: number, reducedMotion: boolean) {
    if (destroyed) return;
    clock = Number.isFinite(time) ? time : clock;
    const step = THREE.MathUtils.clamp(Number.isFinite(dt) ? dt : 0, 0, .04);
    reduced = reducedMotion;
    uniforms.uFoliageTime!.value = clock;
    uniforms.uFoliageWind!.value = reduced ? 0 : 1;
    motion *= Math.exp(-step * 6);
    CROWNS.forEach(([x, y, rx, ry], index) => {
      const localX = (pointer.x - x) / rx;
      const localY = (pointer.y - y) / ry;
      const influence = pointer.z * Math.max(0, 1 - (localX * localX + localY * localY) / 2);
      const size = THREE.MathUtils.clamp(rx / .07, .45, 1);
      const target = THREE.MathUtils.clamp(localX * .014 + motion * .004, -.011, .011) * influence * size * (reduced ? .45 : 1);
      velocities[index]! += ((target - bends[index]!.x) * 42 - velocities[index]! * 8) * step;
      bends[index]!.x += velocities[index]! * step;
      bends[index]!.y = reduced ? 0 : Math.min(.008, Math.abs(velocities[index]!) * .2);
    });
    const groveTarget = pointer.z * THREE.MathUtils.clamp((pointer.x - .5) * .003 + motion * .002, -.004, .004) * (reduced ? .45 : 1);
    groveVelocity += ((groveTarget - grove) * 38 - groveVelocity * 8) * step;
    grove += groveVelocity * step;
    uniforms.uFoliageGrove!.value = grove;
    for (let i = coconuts.length - 1; i >= 0; i--) {
      const coconut = coconuts[i]!;
      const age = clock - coconut.born;
      if (age > 14) { removeCoconut(coconut); coconuts.splice(i, 1); continue; }
      if (coconut.landed === null) {
        coconut.vy -= 245 * step;
        coconut.x += coconut.vx * step;
        coconut.y += coconut.vy * step;
        coconut.mesh.rotation.z += step * (coconut.vx * .015 + 1.2);
        if (coconut.y <= coconut.waterY) {
          const landingU = coconut.x / 1600 + .5;
          const landingV = Math.min(coconut.waterY / 1000 + .5, riverShoreV(landingU) - .008);
          coconut.waterY = (landingV - .5) * 1000;
          coconut.y = coconut.waterY;
          coconut.landed = clock;
          coconut.vx *= .12;
          options.onSplash?.(coconut.x / 1600 + .5, coconut.waterY / 1000 + .5);
        }
      } else {
        const afloat = clock - coconut.landed;
        coconut.vx *= Math.exp(-step * .5);
        coconut.x += coconut.vx * step;
        const settle = Math.exp(-afloat * 2.4) * Math.cos(afloat * 8) * coconut.radius;
        const surface = options.waterHeight?.(coconut.x / 1600 + .5, coconut.waterY / 1000 + .5) ?? 0;
        coconut.y = coconut.waterY - coconut.radius * .3 + settle + surface;
        coconut.mesh.rotation.z = Math.sin(afloat + coconut.phase) * (reduced ? .02 : .13);
      }
      // Perspective scale changes with the flight toward the landing depth.
      const flight = coconut.landed === null
        ? THREE.MathUtils.clamp((coconut.startY - coconut.y) / Math.max(1, coconut.startY - coconut.waterY), 0, 1)
        : 1;
      const apparentRadius = THREE.MathUtils.lerp(coconut.startRadius, coconut.radius, flight);
      coconut.mesh.scale.set(apparentRadius / coconut.radius, apparentRadius / coconut.radius * 1.14, 1);
      coconut.mesh.position.x = coconut.x;
      coconut.mesh.position.y = coconut.y;
      coconut.mesh.material.opacity = 1 - THREE.MathUtils.smoothstep(age, 10, 14);
      const darkness = 1 - THREE.MathUtils.clamp(night || 0, 0, 1) * .5;
      coconut.mesh.material.color.setRGB(darkness, darkness, darkness);
    }
  }

  return {
    uniforms, group, move, leave, hitTest, tap, shakeVisible, update,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      coconuts.forEach(removeCoconut);
      coconuts.length = 0;
      group.clear();
    },
  };
}
