import * as THREE from 'three';
import { createWaterfrontCity } from './waterfront-city';
import { createReefLife } from './reef-life';
import { createSubmergedWater } from './submerged-water';

export function createUnderwaterExplorer(canvas: HTMLCanvasElement, report: (message: string) => void) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0c3052');
  scene.fog = new THREE.FogExp2('#0c3052', 0.02);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.12, 180);
  const city = createWaterfrontCity(),
    reef = createReefLife(),
    water = createSubmergedWater();
  scene.add(water.group, city.group, reef.group);
  scene.add(new THREE.HemisphereLight(0xaddff8, 0x152f55, 1.04));
  const sun = new THREE.DirectionalLight(0xb8e8fc, 2.15);
  sun.position.set(-19, 36, 14);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  sun.target.position.set(-6, 0, -15);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -39, right: 39, top: 32, bottom: -32, far: 108 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.normalBias = 0.025;
  city.group.traverse((object) => {
    if (object instanceof THREE.Mesh && object.parent === city.group && object.material.visible) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  scene.add(sun, sun.target);
  const back = new THREE.DirectionalLight(0x54a2cc, 0.74);
  back.position.set(10, 14, -38);
  scene.add(back);

  const nearLimit = new THREE.Vector3(-27, -0.8, -39),
    farLimit = new THREE.Vector3(24, 17, 27);
  const targets = [...city.targets, ...reef.targets];
  const cityObjects = new Set(city.targets);
  const ray = new THREE.Raycaster(),
    cursor = new THREE.Vector2();
  const view = new THREE.Vector3(),
    aim = new THREE.Vector3(),
    direction = new THREE.Vector3();
  const offset = new THREE.Vector3(),
    right = new THREE.Vector3(),
    proposed = new THREE.Vector3();
  const look = new THREE.Vector3(),
    rotation = new THREE.Euler(0, 0, 0, 'YXZ');
  const controls = new AbortController(),
    motion = matchMedia('(prefers-reduced-motion: reduce)');
  const keys = new Set<string>();
  const obstacles = city.targets
    .filter((target) => /offices|apartments|exchange|flats|tower/i.test(target.name))
    .map((target) => new THREE.Box3().setFromObject(target).expandByScalar(0.5));
  let active = false,
    depth = 0,
    stop = -1,
    time = 0,
    previous = 0,
    frame = 0;
  let yaw = 0,
    pitch = 0,
    firstFrame = true;
  let drag:
    { id: number; x: number; y: number; startX: number; startY: number; moved: boolean } | undefined;
  const size = () => {
    const { width, height } = canvas.getBoundingClientRect();
    renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(size);
  observer.observe(canvas);
  size();

  function visit(index: number) {
    stop = index >= 0 && index < city.stops.length ? index : -1;
    yaw = pitch = 0;
    offset.set(0, 0, 0);
    keys.clear();
  }
  function activate() {
    const district = city.stops[stop];
    if (district) report(city.interact(district.target));
  }
  function pointAt(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    cursor.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((e.clientY - rect.top) / rect.height) * 2,
    );
    ray.setFromCamera(cursor, camera);
    return ray.intersectObjects(targets, false)[0];
  }
  function tap(e: PointerEvent) {
    const hit = pointAt(e);
    if (hit) {
      reef.disturb(hit.point);
      report(cityObjects.has(hit.object) ? city.interact(hit.object) : reef.interact(hit.object));
    } else reef.disturb(ray.ray.at(11, proposed));
  }
  const signal = { signal: controls.signal };
  canvas.addEventListener(
    'pointerdown',
    (e) => {
      if (!e.isPrimary || e.button !== 0 || document.body.dataset.submerged !== 'true') return;
      canvas.focus({ preventScroll: true });
      drag = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      };
      canvas.setPointerCapture(e.pointerId);
    },
    signal,
  );
  canvas.addEventListener(
    'pointermove',
    (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 5) drag.moved = true;
      if (drag.moved) {
        yaw = THREE.MathUtils.clamp(yaw - (e.clientX - drag.x) * 0.004, -1.45, 1.45);
        pitch = THREE.MathUtils.clamp(pitch + (e.clientY - drag.y) * 0.0028, -0.58, 0.55);
        canvas.style.cursor = 'grabbing';
      }
      drag.x = e.clientX;
      drag.y = e.clientY;
    },
    signal,
  );
  canvas.addEventListener(
    'pointerup',
    (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved) tap(e);
      drag = undefined;
      canvas.style.cursor = '';
    },
    signal,
  );
  canvas.addEventListener(
    'lostpointercapture',
    () => {
      drag = undefined;
      canvas.style.cursor = '';
    },
    signal,
  );
  const navigationKeys = ['w', 'a', 's', 'd', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'];
  canvas.addEventListener(
    'keydown',
    (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const key = e.key.toLowerCase();
      if (navigationKeys.includes(key)) {
        keys.add(key);
        e.preventDefault();
      }
      if (key === 'enter') {
        activate();
        e.preventDefault();
      }
    },
    signal,
  );
  canvas.addEventListener(
    'keyup',
    (e) => {
      keys.delete(e.key.toLowerCase());
    },
    signal,
  );
  canvas.addEventListener('blur', () => keys.clear(), signal);

  function draw(timestamp: number) {
    if (!active || document.hidden) return;
    const dt = previous ? Math.min(0.05, (timestamp - previous) / 1000) : 0;
    previous = timestamp;
    time += dt;
    const reduced = motion.matches;
    const district = city.stops[stop];
    if (district) {
      view.copy(district.position);
      aim.copy(district.lookAt);
    } else {
      const approach = reduced ? 1 : depth;
      view.set(5.2 - 2.2 * (1 - approach), 5.5 + 7 * (1 - approach), 12.5 + 13 * (1 - approach));
      aim.set(camera.aspect < 0.9 ? -6 : -2, 4.6 + (1 - approach) * 2, -18);
    }
    yaw += dt * ((keys.has('arrowleft') ? 1 : 0) - (keys.has('arrowright') ? 1 : 0));
    pitch = THREE.MathUtils.clamp(
      pitch + dt * ((keys.has('arrowup') ? 0.65 : 0) - (keys.has('arrowdown') ? 0.65 : 0)),
      -0.75,
      0.7,
    );
    direction.subVectors(aim, view).normalize();
    rotation.set(Math.asin(direction.y) + pitch, Math.atan2(-direction.x, -direction.z) + yaw, 0, 'YXZ');
    direction.set(0, 0, -1).applyEuler(rotation);
    right.crossVectors(direction, camera.up).normalize();
    if (keys.size) {
      proposed
        .copy(view)
        .add(offset)
        .addScaledVector(direction, dt * 6 * (Number(keys.has('w')) - Number(keys.has('s'))))
        .addScaledVector(right, dt * 6 * (Number(keys.has('d')) - Number(keys.has('a'))));
      proposed.clamp(nearLimit, farLimit);
      if (!obstacles.some((box) => box.containsPoint(proposed))) offset.subVectors(proposed, view);
    }
    view.add(offset);
    aim.copy(view).addScaledVector(direction, 18);
    const blend = firstFrame || reduced ? 1 : 1 - Math.exp(-dt * 3.4);
    camera.position.lerp(view, blend);
    look.lerp(aim, blend);
    camera.lookAt(look);
    firstFrame = false;
    city.update(time);
    reef.update(time, dt, reduced);
    water.update(reduced ? 0 : time);
    renderer.render(scene, camera);
    frame = requestAnimationFrame(draw);
  }
  function sync() {
    cancelAnimationFrame(frame);
    previous = 0;
    if (!document.hidden && active) frame = requestAnimationFrame(draw);
  }
  document.addEventListener('visibilitychange', sync, signal);
  return {
    stops: city.stops.map((s) => s.label),
    visit,
    activate,
    setState(on: boolean, progress: number) {
      depth = THREE.MathUtils.clamp(progress, 0, 1);
      if (on === active) return;
      active = on;
      firstFrame = true;
      if (!on) visit(-1);
      sync();
    },
    destroy() {
      active = false;
      cancelAnimationFrame(frame);
      controls.abort();
      observer.disconnect();
      const geometries = new Set<THREE.BufferGeometry>(),
        materials = new Set<THREE.Material>(),
        textures = new Set<THREE.Texture>();
      scene.traverse((object) => {
        if (
          object instanceof THREE.Light &&
          'shadow' in object &&
          object.shadow instanceof THREE.LightShadow
        )
          object.shadow.dispose();
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Points)) return;
        geometries.add(object.geometry);
        for (const mat of Array.isArray(object.material) ? object.material : [object.material])
          materials.add(mat);
        if (object instanceof THREE.InstancedMesh) object.dispose();
      });
      for (const mat of materials) {
        for (const v of Object.values(mat)) if (v instanceof THREE.Texture) textures.add(v);
        mat.dispose();
      }
      for (const g of geometries) g.dispose();
      for (const tex of textures) tex.dispose();
      renderer.dispose();
    },
  };
}
