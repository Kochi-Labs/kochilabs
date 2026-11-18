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

  const targets = [...city.targets, ...reef.targets];
  const cityObjects = new Set(city.targets);
  const ray = new THREE.Raycaster(),
    cursor = new THREE.Vector2();
  const view = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const look = new THREE.Vector3();
  const splash = new THREE.Vector3();
  const controls = new AbortController();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let active = false, depth = 0, pan = 0, time = 0, previous = 0, frame = 0;
  let firstFrame = true;
  const size = () => {
    const { width, height } = canvas.getBoundingClientRect();
    renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(size);
  observer.observe(canvas);
  size();

  function interactAt(x: number, y: number) {
    cursor.set(x, y);
    ray.setFromCamera(cursor, camera);
    const hit = ray.intersectObjects(targets, false)[0];
    if (hit) {
      reef.disturb(hit.point);
      report(cityObjects.has(hit.object) ? city.interact(hit.object) : reef.interact(hit.object));
    } else {
      reef.disturb(ray.ray.at(11, splash));
    }
  }
  const signal = { signal: controls.signal };
  canvas.addEventListener('click', event => {
    if (!active || document.body.dataset.submerged !== 'true') return;
    const rect = canvas.getBoundingClientRect();
    interactAt(2 * (event.clientX - rect.left) / rect.width - 1, 1 - 2 * (event.clientY - rect.top) / rect.height);
  }, signal);
  canvas.addEventListener('keydown', event => {
    if (!active || event.key !== 'Enter' || event.repeat) return;
    event.preventDefault();
    const stop = city.stops[Math.round(pan * (city.stops.length - 1))];
    report(city.interact(stop.target));
  }, signal);

  function draw(timestamp: number) {
    if (!active || document.hidden) return;
    const dt = previous ? Math.min(0.05, (timestamp - previous) / 1000) : 0;
    previous = timestamp;
    time += dt;
    const reduced = motion.matches;
    const approach = reduced ? 1 : depth;
    const westwardTravel = camera.aspect < 0.9 ? 23 : 14;
    view.set(5.2 - 2.2 * (1 - approach) - westwardTravel * pan, 5.5 + 7 * (1 - approach), 12.5 + 13 * (1 - approach));
    aim.set((camera.aspect < 0.9 ? -6 : -2) - westwardTravel * pan, 4.6 + (1 - approach) * 2, -18);
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
    setState(on: boolean, progress: number, story: number) {
      pan = THREE.MathUtils.clamp(story, 0, 1);
      depth = THREE.MathUtils.clamp(progress, 0, 1);
      if (on === active) return;
      active = on;
      firstFrame = true;
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
