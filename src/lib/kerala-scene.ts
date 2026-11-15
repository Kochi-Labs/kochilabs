import * as THREE from 'three';
import { createHouseboat, createMetro, createViaduct, createLotus } from './scene-models';
import { MAX_WAVES, WAVE_LIFETIME, sampleWaterHeight, springStep, type WaterImpulse } from './water-physics';

export type KeralaSceneController = {
  destroy(): void;
  splashAt(clientX: number, clientY: number): void;
  nudgeBoat(): void;
  releaseBirds(): void;
  setScroll(progress: number): void;
  setNight(enabled: boolean): void;
};

type SceneOptions = { backgroundUrl: string; moonElement?: HTMLElement; onReady?: (supported: boolean) => void };
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

const waterFragment = `
uniform sampler2D uBackdrop;
uniform float uTime;
uniform float uAmbient;
uniform float uNight;
uniform vec2 uMoon;
uniform float uScroll;
uniform vec4 uWaves[10];
varying vec2 vUv;
varying vec2 vWorld;
void main() {
  float water = 1.0 - smoothstep(-175.0, -135.0, vWorld.y);
  vec2 displacement = vec2(sin(vWorld.y * .095 + uTime * 1.3), cos(vWorld.x * .045 + uTime * .8)) * .00035 * uAmbient;
  float highlight = 0.0;
  for (int i = 0; i < 10; i++) {
    vec4 wave = uWaves[i];
    float age = uTime - wave.z;
    if (wave.w > 0.0 && age >= 0.0 && age < 5.0) {
      vec2 delta = (vWorld - wave.xy) * vec2(.64, 1.45);
      float radius = length(delta);
      float front = radius - age * 145.0;
      float envelope = exp(-(front * front) / 3600.0) * exp(-age * .7);
      float height = sin(front * .08) * envelope * wave.w;
      vec2 direction = delta / max(radius, 1.0);
      displacement += direction * height * vec2(.00042, .0008);
      highlight += cos(front * .08) * envelope * wave.w * .007;
    }
  }
  vec3 color = texture2D(uBackdrop, clamp(vUv + displacement * water, vec2(.002), vec2(.998))).rgb;
  color += vec3(.76, .89, .72) * max(highlight, 0.0) * water;
  color -= vec3(.12, .23, .18) * max(-highlight, 0.0) * water;
  vec3 moonlit = color * vec3(.045, .075, .17) + vec3(.003, .006, .018);
  color = mix(color, moonlit, uNight);
  // Both reflections sample the water's displacement field. A click refracts
  // the sun or crescent and breaks up its light path together.
  vec2 reflected = vWorld + displacement * vec2(1720.0, 1075.0);
  reflected.x += sin(reflected.y * .23 + uTime * .65 * uAmbient) * 2.2;
  float moonY = -242.0 - uScroll * 16.0;
  float radius = max(uMoon.y, 18.0);
  vec2 crescentPoint = (reflected - vec2(uMoon.x, moonY)) / vec2(radius, radius * .62);
  float disc = 1.0 - smoothstep(.93, 1.04, length(crescentPoint));
  float cutout = smoothstep(.85, .94, length(crescentPoint - vec2(.516, -.516)));
  float crescent = disc * cutout;
  float depth = -reflected.y - 165.0;
  float width = 12.0 + max(depth, 0.0) * .15;
  float offset = reflected.x - uMoon.x;
  float path = exp(-pow(offset / width, 2.0));
  float taper = smoothstep(0.0, 40.0, depth) * (1.0 - smoothstep(180.0, 320.0, depth));
  float bands = pow(.5 + .5 * sin(reflected.y * .29 + sin(reflected.y * .071) * 2.0 + uTime * .55 * uAmbient), 9.0);
  float glimmer = crescent * (.25 + bands * .22) + path * taper * (.012 + bands * .07);
  color += vec3(.95, .84, .55) * glimmer * water * uNight;
  // The sun is 25/31 the moon's radius in the sky illustration. Its warm,
  // full-disc reflection crossfades to the crescent when night falls.
  vec2 sunPoint = crescentPoint * (31.0 / 25.0);
  float sunDistance = length(sunPoint);
  float sunDisc = 1.0 - smoothstep(.82, 1.12, sunDistance);
  float sunHalo = exp(-sunDistance * sunDistance * .7) * .045;
  float sunlight = sunDisc * (.32 + bands * .23) + sunHalo + path * taper * (.018 + bands * .12);
  color += vec3(1.0, .63, .18) * sunlight * water * (1.0 - uNight);
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}`;

/** A transparent WebGL layer; the caller's painted background remains the fallback. */
export function createKeralaScene(canvas: HTMLCanvasElement, options: SceneOptions): KeralaSceneController {
  const noop: KeralaSceneController = { destroy() {}, splashAt() {}, nudgeBoat() {}, releaseBirds() {}, setScroll() {}, setNight() {} };
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
  let trainBoost = 0;
  let boatX = 40;
  let boatTargetX = 40;
  let boatVelocityX = 0;
  let boatY = -220;
  let boatVelocityY = 0;
  let boatRoll = 0;
  let boatRollVelocity = 0;
  let pointer: { id: number; x: number; y: number; worldX: number; boatX: number; dragging: boolean; target: 'boat' | 'train' | 'water' | 'other' } | null = null;
  const oldCursor = canvas.style.cursor;
  const oldTouchAction = canvas.style.touchAction;
  canvas.style.touchAction = 'pan-y';

  const waveVectors = Array.from({ length: MAX_WAVES }, () => new THREE.Vector4(0, 0, -100, 0));
  const backgroundMaterial = new THREE.ShaderMaterial({
    uniforms: { uBackdrop: { value: null }, uNight: { value: 0 }, uMoon: { value: new THREE.Vector2(250, 31) }, uScroll: { value: 0 }, uTime: { value: 0 }, uAmbient: { value: reducedMotion ? 0 : 1 }, uWaves: { value: waveVectors } },
    vertexShader: waterVertex,
    fragmentShader: waterFragment,
    depthWrite: false,
  });
  const background = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1000), backgroundMaterial);
  background.position.z = -60;
  background.scale.setScalar(1.075);
  scene.add(background);

  const viaduct = createViaduct();
  viaduct.position.set(0, -95, -20);
  scene.add(viaduct);
  const train = createMetro();
  train.position.set(-220, -94, -10);
  scene.add(train);
  const boat = createHouseboat();
  boat.position.set(boatX, boatY, 10);
  scene.add(boat);

  const reflection = boat.clone(true);
  reflection.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const copies = materials.map((material) => {
      const copy = material.clone();
      copy.transparent = true;
      copy.opacity = .12;
      copy.depthWrite = false;
      copy.side = THREE.DoubleSide;
      if ('color' in copy) (copy as THREE.MeshBasicMaterial).color.lerp(new THREE.Color('#507d75'), .55);
      return copy;
    });
    object.material = Array.isArray(object.material) ? copies : copies[0]!;
  });
  reflection.scale.y = -.38;
  reflection.position.set(boatX, boatY - 9, 2);
  scene.add(reflection);

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: '#244c43', transparent: true, opacity: .12, depthWrite: false }));
  shadow.scale.set(116, 9, 1);
  shadow.position.set(boatX, -224, 3);
  scene.add(shadow);
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
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshBasicMaterial) || nightMaterials.has(material)) continue;
      const day = material.color.clone();
      const afterDark = material.userData.nightGlow ? new THREE.Color('#ffd58c') : day.clone().multiply(moonTint);
      nightMaterials.set(material, { day, night: afterDark });
    }
  });

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
    if (!point || point.y > -145) return;
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

  function pick(clientX: number, clientY: number): 'boat' | 'train' | 'water' | 'other' {
    const point = worldPoint(clientX, clientY);
    scene.updateMatrixWorld();
    if (raycaster.intersectObject(boat, true).length) return 'boat';
    if (raycaster.intersectObject(train, true).length) return 'train';
    return point && point.y < -145 ? 'water' : 'other';
  }

  function clampBoatX(x: number) {
    const edge = Math.max(0, viewWidth / 2 - 115);
    return THREE.MathUtils.clamp(x, -edge, edge);
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0 || !ready || pointer) return;
    const target = pick(event.clientX, event.clientY);
    const point = worldPoint(event.clientX, event.clientY);
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, worldX: point?.x ?? 0, boatX, dragging: false, target };
    canvas.setPointerCapture(event.pointerId);
    if (target === 'boat') {
      canvas.style.cursor = 'grabbing';
    }
  }

  function onPointerMove(event: PointerEvent) {
    if (!ready) return;
    if (pointer?.id === event.pointerId && pointer.target === 'boat') {
      const point = worldPoint(event.clientX, event.clientY);
      if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 5) pointer.dragging = true;
      if (point) boatTargetX = clampBoatX(pointer.boatX + point.x - pointer.worldX);
    } else if (!pointer) {
      const target = pick(event.clientX, event.clientY);
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
    else if (current.target === 'train' && tap) trainBoost = 3.5;
    else if (current.target === 'other' && tap) releaseBirds();
  }

  function onPointerCancel() {
    if (pointer && canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id);
    pointer = null;
    canvas.style.cursor = 'default';
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const aspect = width / height;
    viewWidth = aspect >= 1.6 ? 1600 : 1000 * aspect;
    const viewHeight = aspect >= 1.6 ? 1600 / aspect : 1000;
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
    backgroundMaterial.uniforms.uMoon!.value.set(((moonScreenX - rect.left) / width - .5) * viewWidth, moonRadius / width * viewWidth);
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
    const waterY = -220 + scroll * 4;
    const leftHeight = sampleWaterHeight(boatX - 76, waterY, time, waves, !reducedMotion);
    const rightHeight = sampleWaterHeight(boatX + 76, waterY, time, waves, !reducedMotion);
    [boatX, boatVelocityX] = springStep(boatX, boatVelocityX, boatTargetX, 22, 8, dt);
    [boatY, boatVelocityY] = springStep(boatY, boatVelocityY, waterY + (leftHeight + rightHeight) / 2, 19, 5.7, dt);
    const angle = Math.atan2(rightHeight - leftHeight, 152) - THREE.MathUtils.clamp(boatVelocityX * .00012, -.025, .025);
    [boatRoll, boatRollVelocity] = springStep(boatRoll, boatRollVelocity, angle, 22, 6, dt);
    trainBoost = Math.max(0, trainBoost - dt);
    if (!reducedMotion || trainBoost > 0) train.position.x += dt * (trainBoost > 0 ? 150 : 39);
    const trainBoundary = viewWidth / 2 + 160;
    if (train.position.x > trainBoundary) train.position.x = -trainBoundary;
    for (let i = waves.length - 1; i >= 0; i--) if (time - waves[i]!.born > WAVE_LIFETIME) waves.splice(i, 1);
  }

  function render() {
    camera.position.y = -scroll * 42;
    camera.updateMatrixWorld();
    background.position.y = -scroll * 29;
    viaduct.position.y = -95 - scroll * 14;
    train.position.y = -94 - scroll * 14;
    boat.position.set(boatX, boatY, 10);
    boat.rotation.z = boatRoll;
    reflection.position.set(boatX, -229 + scroll * 4 - (boatY + 220 - scroll * 4) * .3, 2);
    reflection.rotation.z = -boatRoll * .6;
    reflection.scale.x = 1 + Math.sin(time * 1.1) * (reducedMotion ? 0 : .008);
    shadow.position.set(boatX, -224 + scroll * 4, 3);
    backgroundMaterial.uniforms.uTime!.value = time;
    backgroundMaterial.uniforms.uNight!.value = night;
    backgroundMaterial.uniforms.uScroll!.value = scroll;
    fireflies.visible = night > .005;
    fireflies.position.y = -scroll * 12;
    fireflyMaterial.uniforms.uTime!.value = time;
    fireflyMaterial.uniforms.uNight!.value = night;
    fireflyMaterial.uniforms.uMotion!.value = reducedMotion ? 0 : 1;
    nightMaterials.forEach((colors, material) => material.color.lerpColors(colors.day, colors.night, night));
    for (let i = 0; i < MAX_WAVES; i++) {
      const wave = waves[i];
      if (wave) waveVectors[i]!.set(wave.x, wave.y, wave.born, wave.strength);
      else waveVectors[i]!.set(0, 0, -100, 0);
    }
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
      lotus.group.position.y = lotus.y + sampleWaterHeight(lotus.x, lotus.y, time, waves, !reducedMotion) * .4;
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
    backgroundMaterial.uniforms.uAmbient!.value = reducedMotion ? 0 : 1;
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
    setNight(enabled) { nightTarget = enabled ? 1 : 0; },
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
      canvas.removeEventListener('webglcontextlost', onContextLost);
      document.removeEventListener('visibilitychange', onVisibility);
      media.removeEventListener('change', onMotionChange);
      if (pointer && canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id);
      canvas.style.cursor = oldCursor;
      canvas.style.touchAction = oldTouchAction;
      disposeObject(scene);
      ownedTextures.forEach((owned) => owned.dispose());
      renderer.dispose();
    },
  };
}
