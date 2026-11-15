import * as THREE from 'three';
import { createRiverSurface, riverContains } from './river-surface';
import { createMetroPassenger } from './metro-passenger';
import { createVillageHouses } from './village-houses';
import { createLivingFoliage, foliageShaderUniforms, foliageShaderFunction } from './living-foliage';
import { createLuxuryHouseboat } from './luxury-houseboat';
import { createBoatWater } from './boat-water';
import { createMetro, createViaduct, createLotus } from './scene-models';
import { MAX_WAVES, WAVE_LIFETIME, sampleWaterHeight as sampleWaveHeight, springStep, type WaterImpulse } from './water-physics';

// The restored surface displays 65% of the shared wave height.
const sampleWaterHeight = (...args: Parameters<typeof sampleWaveHeight>) => sampleWaveHeight(...args) * .65;

export type KeralaSceneController = {
  destroy(): void;
  splashAt(clientX: number, clientY: number): void;
  nudgeBoat(): void;
  releaseBirds(): void;
  setScroll(progress: number): void;
  setNight(enabled: boolean): void;
  houseLabels: readonly string[];
  toggleHouse(index: number): boolean;
  shakePalm(): void;
};

type SceneOptions = { backgroundUrl: string; moonElement?: HTMLElement; onHouseChange?: (index: number, open: boolean, automatic?: boolean) => void; onCoconutSplash?: () => void; onPassengerFound?: () => void; onStormChange?: (intensity: number) => void; onSequencePhase?: (phase: string) => void; onReady?: (supported: boolean) => void };
type Lotus = { group: THREE.Group; x: number; y: number; born: number; phase: number };
type Bird = { group: THREE.Group; left: THREE.Mesh; right: THREE.Mesh; born: number; origin: THREE.Vector3; direction: number; phase: number };

const waterVertex = `
varying vec2 vUv;
varying vec2 vWorld;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xy;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const backgroundFragment = `
uniform sampler2D uBackdrop;
uniform float uNight;
varying vec2 vUv;
${foliageShaderUniforms}
${foliageShaderFunction}
void main() {
  vec3 color = texture2D(uBackdrop, swayFoliage(vUv)).rgb;
  vec3 moonlit = color * vec3(.045, .075, .17) + vec3(.003, .006, .018);
  gl_FragColor = vec4(mix(color, moonlit, uNight), 1.0);
  #include <colorspace_fragment>
}`;

/** A transparent WebGL layer; the caller's painted background remains the fallback. */
export function createKeralaScene(canvas: HTMLCanvasElement, options: SceneOptions): KeralaSceneController {
  const noop: KeralaSceneController = { destroy() {}, splashAt() {}, nudgeBoat() {}, releaseBirds() {}, setScroll() {}, setNight() {}, houseLabels: [], toggleHouse() { return false; }, shakePalm() {} };
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    options.onReady?.(false);
    return noop;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-800, 800, 500, -500, .1, 1000);
  camera.position.set(0, 0, 300);
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const waterPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = media.matches;
  let destroyed = false;
  let ready = false;
  let failed = false;
  let time = 0;
  let night = 0;
  let nightTarget = 0;
  let previousTime = 0;
  let accumulator = 0;
  let animationFrame = 0;
  let scrollTarget = 0;
  let scroll = 0;
  let viewWidth = 1600;
  let shortViewportOffset = 0;
  let trainBoost = 0;
  let lastStorm = -1;
  let lastPassengerPhase = 'idle';
  let boatX = 40;
  let boatTargetX = 40;
  let boatVelocityX = 0;
  let boatY = -220;
  let boatVelocityY = 0;
  let boatRoll = 0;
  let boatRollVelocity = 0;
  let pointer: { id: number; x: number; y: number; worldX: number; boatX: number; dragging: boolean; target: 'boat' | 'train' | 'water' | 'house' | 'foliage' | 'other'; houseIndex: number | null; lastCarriage?: boolean } | null = null;
  const oldCursor = canvas.style.cursor;
  const oldTouchAction = canvas.style.touchAction;
  canvas.style.touchAction = 'pan-y';

  const village = createVillageHouses();
  const foliage = createLivingFoliage({
    waterHeight(u, v) {
      const point = backdropToWorld(u, v);
      return sampleWaterHeight(point.x, point.y, time, waves, !reducedMotion, background.position.y) / 1.075;
    },
    onSplash(u, v) {
      const point = backdropToWorld(u, v);
      impulse(point.x, point.y, 17);
      options.onCoconutSplash?.();
    },
  });
  village.group.scale.setScalar(1.075);
  village.group.position.z = -35;
  foliage.group.scale.setScalar(1.075);
  foliage.group.position.z = 0;

  const river = createRiverSurface();
  const celestialReflection = new THREE.Vector2(250, 31);
  const backgroundMaterial = new THREE.ShaderMaterial({
    uniforms: { ...foliage.uniforms, uBackdrop: { value: null }, uNight: { value: 0 } },
    vertexShader: waterVertex,
    fragmentShader: backgroundFragment,
    depthWrite: false,
  });
  const background = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1000), backgroundMaterial);
  background.position.z = -60;
  background.scale.setScalar(1.075);
  scene.add(background, river.mesh);

  const viaduct = createViaduct();
  viaduct.position.set(0, -95, -20);
  scene.add(viaduct);
  const train = createMetro();
  train.position.set(-220, -94, -10);
  scene.add(train);
  const luxuryBoat = createLuxuryHouseboat();
  const boat = luxuryBoat.group;
  boat.traverse(o => { o.userData.luxuryBoat = true; });
  boat.position.set(boatX, boatY, 10);
  boat.rotation.x = .18;
  boat.rotation.y = -.16;
  scene.add(boat);

  scene.add(luxuryBoat.lighting);
  const boatWater = createBoatWater(renderer, scene, boat, luxuryBoat.lighting);
  scene.add(boatWater.group);
  const waves: WaterImpulse[] = [];
  const lotuses: Lotus[] = [];
  const birds: Bird[] = [];
  const ownedTextures = new Set<THREE.Texture>();

  // A single draw call for a sparse, softly pulsing swarm along the banks.
  const fireflyCount = 36;
  const fireflyPositions = new Float32Array(fireflyCount * 3);
  const fireflyPhases = new Float32Array(fireflyCount);
  const fireflyGeometry = new THREE.BufferGeometry();
  for (let i = 0; i < fireflyCount; i++) fireflyPhases[i] = i * 2.39996;
  fireflyGeometry.setAttribute('position', new THREE.BufferAttribute(fireflyPositions, 3));
  fireflyGeometry.setAttribute('phase', new THREE.BufferAttribute(fireflyPhases, 1));
  const fireflyMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uMotion: { value: reducedMotion ? 0 : 1 }, uDpr: { value: renderer.getPixelRatio() } },
    vertexShader: `
      attribute float phase;
      uniform float uTime;
      uniform float uMotion;
      uniform float uDpr;
      varying float vGlow;
      void main() {
        float t = uTime * uMotion;
        vec3 p = position;
        p.x += (sin(t * .34 + phase) * 11.0 + sin(t * .17 + phase * 2.0) * 4.0) * uMotion;
        p.y += sin(t * .47 + phase * 1.7) * 9.0 * uMotion;
        vGlow = .24 + .76 * pow(.5 + .5 * sin(t * .9 + phase), 2.0);
        gl_PointSize = (9.0 + 4.0 * vGlow) * uDpr;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform float uNight;
      varying float vGlow;
      void main() {
        float d = length(gl_PointCoord - .5) * 2.0;
        float halo = exp(-d * d * 5.5) * .24;
        float core = (1.0 - smoothstep(.08, .25, d)) * .85;
        float alpha = (halo + core) * vGlow * uNight;
        gl_FragColor = vec4(1.0, .89, .38, alpha);
      }`,
  });
  const fireflies = new THREE.Points(fireflyGeometry, fireflyMaterial);
  fireflies.frustumCulled = false;
  scene.add(fireflies);

  // Store original colors once so repeated day/night switches are reversible.
  const nightMaterials = new Map<THREE.MeshBasicMaterial, { day: THREE.Color; night: THREE.Color }>();
  const moonTint = new THREE.Color('#758bc4').multiplyScalar(.55);
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object.userData.luxuryBoat) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshBasicMaterial) || nightMaterials.has(material)) continue;
      const day = material.color.clone();
      const afterDark = material.userData.nightGlow ? new THREE.Color('#ffd58c') : day.clone().multiply(moonTint);
      nightMaterials.set(material, { day, night: afterDark });
    }
  });

  scene.add(village.group, foliage.group);
  const passenger = createMetroPassenger(train);

  function toggleHouse(index: number) {
    if (destroyed || index < 0 || index >= village.labels.length) return false;
    const open = village.toggle(index);
    options.onHouseChange?.(index, open);
    return open;
  }

  function backdropToWorld(u: number, v: number) {
    return new THREE.Vector2((u - .5) * 1720, (v - .5) * 1075 + background.position.y);
  }

  function backdropPoint(point: THREE.Vector3) {
    return new THREE.Vector2(point.x / 1720 + .5, (point.y - background.position.y) / 1075 + .5);
  }

  function disposeObject(object: THREE.Object3D) {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.Points)) return;
      geometries.add(child.geometry);
      (Array.isArray(child.material) ? child.material : [child.material]).forEach((material) => materials.add(material));
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  }

  function worldPoint(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    mouse.set(((clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1, -((clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1);
    raycaster.setFromCamera(mouse, camera);
    return raycaster.ray.intersectPlane(waterPlane, new THREE.Vector3());
  }

  function impulse(x: number, y: number, strength = 14) {
    const u = x / 1720 + .5;
    const v = (y - background.position.y) / 1075 + .5;
    if (!riverContains(u, v)) return;
    if (waves.length >= MAX_WAVES) waves.shift();
    waves.push({ x, y, born: time, strength: strength * (reducedMotion ? .45 : 1) });
  }

  function addLotus(x: number, y: number) {
    if (lotuses.length >= 8) {
      const oldest = lotuses.shift()!;
      scene.remove(oldest.group);
      disposeObject(oldest.group);
    }
    const group = createLotus();
    group.position.set(x, y, 5);
    group.scale.setScalar(.1);
    scene.add(group);
    lotuses.push({ group, x, y, born: time, phase: Math.random() * Math.PI * 2 });
  }

  function splashAt(clientX: number, clientY: number) {
    if (destroyed || !ready) return;
    const point = worldPoint(clientX, clientY);
    if (!point) return;
    const uv = backdropPoint(point);
    if (!riverContains(uv.x, uv.y)) return;
    impulse(point.x, point.y);
    addLotus(point.x, point.y);
  }

  function nudgeBoat() {
    if (destroyed) return;
    boatVelocityY += reducedMotion ? 11 : 32;
    boatRollVelocity += reducedMotion ? .035 : .13;
    impulse(boatX - 95, boatY - 3, 11);
    impulse(boatX + 85, boatY - 5, 7);
  }

  function releaseBirds() {
    if (destroyed) return;
    const count = reducedMotion ? 3 : 6;
    for (let i = 0; i < count; i++) {
      if (birds.length >= 18) {
        const oldest = birds.shift()!;
        scene.remove(oldest.group);
        disposeObject(oldest.group);
      }
      const group = new THREE.Group();
      const wing = new THREE.Shape();
      wing.moveTo(0, 0); wing.quadraticCurveTo(5, 7, 12, 4); wing.lineTo(5, 2); wing.closePath();
      const geometry = new THREE.ShapeGeometry(wing);
      const material = new THREE.MeshBasicMaterial({ color: '#294c4c', side: THREE.DoubleSide, transparent: true });
      const right = new THREE.Mesh(geometry, material);
      const left = new THREE.Mesh(geometry, material);
      left.scale.x = -1;
      group.add(left, right);
      const origin = new THREE.Vector3(boatX + (Math.random() - .5) * 75, boatY + 75 + Math.random() * 20, 15);
      group.position.copy(origin);
      group.scale.setScalar(.5 + Math.random() * .25);
      scene.add(group);
      birds.push({ group, left, right, born: time + i * .12, origin, direction: i % 2 ? 1 : -1, phase: Math.random() * 3 });
    }
  }

  function pick(clientX: number, clientY: number): { target: 'boat' | 'train' | 'water' | 'house' | 'foliage' | 'other'; houseIndex: number | null; lastCarriage?: boolean } {
    const point = worldPoint(clientX, clientY);
    scene.updateMatrixWorld();
    if (raycaster.intersectObject(boat, true).length) return { target: 'boat', houseIndex: null };
    const trainHit = raycaster.intersectObject(train, true)[0];
    if (trainHit) return { target: 'train', houseIndex: null, lastCarriage: passenger.hitTest(trainHit.object) };
    if (point) {
      const uv = backdropPoint(point);
      const houseIndex = village.hitTest(uv.x, uv.y);
      if (houseIndex !== null) return { target: 'house', houseIndex };
      if (foliage.hitTest(uv.x, uv.y)) return { target: 'foliage', houseIndex: null };
      if (riverContains(uv.x, uv.y)) return { target: 'water', houseIndex: null };
    }
    return { target: 'other', houseIndex: null };
  }

  function clampBoatX(x: number) {
    const edge = Math.max(0, viewWidth / 2 - 128);
    return THREE.MathUtils.clamp(x, -edge, edge);
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0 || !ready || pointer) return;
    const { target, houseIndex, lastCarriage } = pick(event.clientX, event.clientY);
    const point = worldPoint(event.clientX, event.clientY);
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, worldX: point?.x ?? 0, boatX, dragging: false, target, houseIndex, lastCarriage };
    canvas.setPointerCapture(event.pointerId);
    if (target === 'boat') {
      canvas.style.cursor = 'grabbing';
    }
  }

  function onPointerMove(event: PointerEvent) {
    if (!ready) return;
    const hoverPoint = worldPoint(event.clientX, event.clientY);
    if (hoverPoint && pointer?.target !== 'boat') {
      const uv = backdropPoint(hoverPoint);
      foliage.move(uv.x, uv.y);
    }
    if (pointer?.id === event.pointerId && pointer.target === 'boat') {
      const point = worldPoint(event.clientX, event.clientY);
      if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 5) pointer.dragging = true;
      if (point) boatTargetX = clampBoatX(pointer.boatX + point.x - pointer.worldX);
    } else if (!pointer) {
      const { target } = pick(event.clientX, event.clientY);
      canvas.style.cursor = target === 'boat' ? 'grab' : target === 'water' ? 'crosshair' : 'pointer';
    }
  }

  function onPointerUp(event: PointerEvent) {
    if (!pointer || pointer.id !== event.pointerId) return;
    const current = pointer;
    pointer = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    const tap = Math.hypot(event.clientX - current.x, event.clientY - current.y) < 9;
    if (current.target === 'boat') {
      if (current.dragging) {
        boatTargetX = clampBoatX(boatX + boatVelocityX * .22);
        impulse(boatX, boatY - 10, 7);
      } else if (tap) nudgeBoat();
      canvas.style.cursor = 'grab';
    } else if (current.target === 'water' && tap) splashAt(event.clientX, event.clientY);
    else if (current.target === 'train' && tap) {
      if (passenger.tap()) options.onPassengerFound?.();
    }
    else if (current.target === 'house' && tap && current.houseIndex !== null) toggleHouse(current.houseIndex);
    else if (current.target === 'foliage' && tap) {
      const point = worldPoint(event.clientX, event.clientY);
      if (point) { const uv = backdropPoint(point); foliage.tap(uv.x, uv.y); }
    }
    else if (current.target === 'other' && tap) releaseBirds();
  }

  function onPointerCancel() {
    if (pointer && canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id);
    pointer = null;
    canvas.style.cursor = 'default';
    foliage.leave();
  }

  function onPointerLeave() { if (!pointer) foliage.leave(); }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const aspect = width / height;
    viewWidth = aspect >= 1.6 ? 1600 : 1000 * aspect;
    const viewHeight = aspect >= 1.6 ? 1600 / aspect : 1000;
    // Keep the boat and shoreline above the compact runner on landscape phones.
    shortViewportOffset = aspect > 1 && height <= 900
      ? Math.max(0, 220 - (height / 2 - 171) * viewHeight / height)
      : 0;
    camera.left = -viewWidth / 2;
    camera.right = viewWidth / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    renderer.setSize(width, height, false);
    boatTargetX = clampBoatX(boatTargetX);
    const moonBounds = options.moonElement?.getBoundingClientRect();
    const moonScreenX = moonBounds ? moonBounds.left + moonBounds.width / 2 : rect.left + width * .76;
    const moonRadius = moonBounds ? moonBounds.width * .31 : 24;
    celestialReflection.set(((moonScreenX - rect.left) / width - .5) * viewWidth, moonRadius / width * viewWidth);
    for (let i = 0; i < fireflyCount; i++) {
      fireflyPositions[i * 3] = (((i * .618034) % 1) - .5) * viewWidth * .94;
      fireflyPositions[i * 3 + 1] = -105 - ((i * 47) % 168);
      fireflyPositions[i * 3 + 2] = 24;
    }
    fireflyGeometry.attributes.position!.needsUpdate = true;
    fireflyMaterial.uniforms.uDpr!.value = renderer.getPixelRatio();
  }

  function simulate(dt: number) {
    time += dt;
    night += (nightTarget - night) * Math.min(1, dt * 4);
    if (reducedMotion) night = nightTarget;
    scroll += (scrollTarget - scroll) * Math.min(1, dt * 5);
    village.update(dt, night, reducedMotion);
    passenger.update(dt, night, reducedMotion);
    if (Math.abs(passenger.rain - lastStorm) > .012 || (passenger.rain === 0 && lastStorm !== 0)) {
      lastStorm = passenger.rain; options.onStormChange?.(lastStorm);
    }
    if (passenger.phase !== lastPassengerPhase) {
      lastPassengerPhase = passenger.phase; options.onSequencePhase?.(lastPassengerPhase);
    }
    foliage.update(dt, time, night, reducedMotion);
    const waterY = -220 + scroll * 4;
    const leftHeight = sampleWaterHeight(boatX - 76, waterY, time, waves, !reducedMotion, background.position.y);
    const rightHeight = sampleWaterHeight(boatX + 76, waterY, time, waves, !reducedMotion, background.position.y);
    const centerHeight = sampleWaterHeight(boatX, waterY, time, waves, !reducedMotion, background.position.y);
    const midLeft = sampleWaterHeight(boatX - 38, waterY, time, waves, !reducedMotion, background.position.y);
    const midRight = sampleWaterHeight(boatX + 38, waterY, time, waves, !reducedMotion, background.position.y);
    const heave = (leftHeight + rightHeight + centerHeight * 2 + midLeft + midRight) / 6;
    const surge = pointer?.target === 'boat' ? 0 : THREE.MathUtils.clamp((leftHeight - rightHeight) * 1.5, -9, 9);
    [boatX, boatVelocityX] = springStep(boatX, boatVelocityX, clampBoatX(boatTargetX + surge), 22, 8, dt);
    [boatY, boatVelocityY] = springStep(boatY, boatVelocityY, waterY + heave, 42, 8, dt);
    const angle = Math.atan2(rightHeight - leftHeight, 152) - THREE.MathUtils.clamp(boatVelocityX * .00012, -.025, .025);
    [boatRoll, boatRollVelocity] = springStep(boatRoll, boatRollVelocity, angle, 38, 7, dt);
    trainBoost = Math.max(0, trainBoost - dt);
    if (passenger.active) {
      // Hold the train for the little performance and bring both front cars
      // into view if it was discovered near a screen edge.
      trainBoost = 0;
      const edge = Math.max(0, viewWidth / 2 - 180);
      const stageX = THREE.MathUtils.clamp(train.position.x, -edge, edge);
      train.position.x += (stageX - train.position.x) * (reducedMotion ? 1 : Math.min(1, dt * 3));
    } else if (!reducedMotion || trainBoost > 0) train.position.x += dt * (trainBoost > 0 ? 150 : 39);
    const trainBoundary = viewWidth / 2 + 160;
    if (train.position.x > trainBoundary) { train.position.x = -trainBoundary; passenger.resetDamage(); }
    for (let i = waves.length - 1; i >= 0; i--) if (time - waves[i]!.born > WAVE_LIFETIME) waves.splice(i, 1);
  }

  function render() {
    camera.position.y = -scroll * 42 - shortViewportOffset;
    camera.updateMatrixWorld();
    background.position.y = -scroll * 29;
    village.group.position.y = background.position.y;
    foliage.group.position.y = background.position.y;
    viaduct.position.y = -95 - scroll * 14;
    train.position.y = -94 - scroll * 14;
    boat.position.set(boatX, boatY, 10);
    boat.rotation.z = boatRoll;
    luxuryBoat.lighting.position.copy(boat.position);
    luxuryBoat.update(time, night, reducedMotion);
    backgroundMaterial.uniforms.uNight!.value = night;
    river.update({ time, waves, night, ambient: !reducedMotion, scroll, moon: celestialReflection });
    fireflies.visible = night > .005;
    fireflies.position.y = -scroll * 12;
    fireflyMaterial.uniforms.uTime!.value = time;
    fireflyMaterial.uniforms.uNight!.value = night;
    fireflyMaterial.uniforms.uMotion!.value = reducedMotion ? 0 : 1;
    nightMaterials.forEach((colors, material) => material.color.lerpColors(colors.day, colors.night, night));
    for (let i = lotuses.length - 1; i >= 0; i--) {
      const lotus = lotuses[i]!;
      const age = time - lotus.born;
      if (age > 24) {
        scene.remove(lotus.group); disposeObject(lotus.group); lotuses.splice(i, 1); continue;
      }
      const grow = THREE.MathUtils.smoothstep(age, 0, .8);
      const fade = 1 - THREE.MathUtils.smoothstep(age, 19, 24);
      lotus.group.scale.setScalar(grow * fade);
      lotus.group.position.x = lotus.x + (reducedMotion ? 0 : Math.sin(age * .3 + lotus.phase) * 5);
      lotus.group.position.y = lotus.y + sampleWaterHeight(lotus.x, lotus.y, time, waves, !reducedMotion, background.position.y) * .4;
      lotus.group.rotation.z = reducedMotion ? 0 : Math.sin(time * .7 + lotus.phase) * .05;
    }
    for (let i = birds.length - 1; i >= 0; i--) {
      const bird = birds[i]!;
      const age = Math.max(0, time - bird.born);
      if (age > 7) { scene.remove(bird.group); disposeObject(bird.group); birds.splice(i, 1); continue; }
      const speed = reducedMotion ? 20 : 45;
      bird.group.position.set(bird.origin.x + age * speed * bird.direction, bird.origin.y + age * 35 + Math.sin(age + bird.phase) * 8, 15);
      const flap = Math.sin(age * (reducedMotion ? 4 : 11) + bird.phase) * .45;
      bird.left.rotation.z = -flap;
      bird.right.rotation.z = flap;
      (bird.left.material as THREE.MeshBasicMaterial).opacity = 1 - THREE.MathUtils.smoothstep(age, 5, 7);
    }
    boatWater.update({ time, night, reducedMotion, surfaceOffset: background.position.y, waves, speed: boatVelocityX, waterY: -220 + scroll * 4 });
    renderer.render(scene, camera);
  }

  function animate(timestamp: number) {
    if (destroyed || failed || document.hidden) return;
    const dt = previousTime ? Math.min((timestamp - previousTime) / 1000, .04) : 0;
    previousTime = timestamp;
    if (ready) {
      accumulator += dt;
      while (accumulator >= 1 / 120) { simulate(1 / 120); accumulator -= 1 / 120; }
      render();
    }
    animationFrame = requestAnimationFrame(animate);
  }

  function onVisibility() {
    cancelAnimationFrame(animationFrame);
    onPointerCancel();
    previousTime = 0;
    if (!document.hidden && !destroyed && !failed) animationFrame = requestAnimationFrame(animate);
  }
  function onMotionChange() {
    reducedMotion = media.matches;
  }
  function onContextLost(event: Event) {
    event.preventDefault();
    failed = true;
    cancelAnimationFrame(animationFrame);
    options.onReady?.(false);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('webglcontextlost', onContextLost);
  document.addEventListener('visibilitychange', onVisibility);
  media.addEventListener('change', onMotionChange);
  resize();
  const texture = new THREE.TextureLoader().load(options.backgroundUrl, (loaded) => {
    if (destroyed || failed) { loaded.dispose(); return; }
    loaded.colorSpace = THREE.SRGBColorSpace;
    loaded.minFilter = THREE.LinearFilter;
    loaded.magFilter = THREE.LinearFilter;
    loaded.generateMipmaps = false;
    backgroundMaterial.uniforms.uBackdrop!.value = loaded;
    river.setTexture(loaded);
    ready = true;
    render();
    options.onReady?.(true);
  }, undefined, () => {
    failed = true;
    cancelAnimationFrame(animationFrame);
    if (!destroyed) options.onReady?.(false);
  });
  ownedTextures.add(texture);
  animationFrame = requestAnimationFrame(animate);

  return {
    splashAt,
    houseLabels: village.labels,
    toggleHouse,
    shakePalm() {
      foliage.shakeVisible(.5 - viewWidth / 3440, .5 + viewWidth / 3440);
    },
    setNight(enabled) {
      if (destroyed) return;
      nightTarget = enabled ? 1 : 0;
      for (const { index, open } of village.setNight(enabled)) options.onHouseChange?.(index, open, true);
    },
    nudgeBoat,
    releaseBirds,
    setScroll(progress) { scrollTarget = Number.isFinite(progress) ? THREE.MathUtils.clamp(progress, 0, 1) : 0; },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      document.removeEventListener('visibilitychange', onVisibility);
      media.removeEventListener('change', onMotionChange);
      if (pointer && canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id);
      canvas.style.cursor = oldCursor;
      canvas.style.touchAction = oldTouchAction;
      scene.remove(village.group, foliage.group, river.mesh);
      river.destroy();
      village.destroy();
      foliage.destroy();
      passenger.destroy();
      boatWater.destroy();
      luxuryBoat.destroy();
      disposeObject(scene);
      ownedTextures.forEach((owned) => owned.dispose());
      renderer.dispose();
    },
  };
}
