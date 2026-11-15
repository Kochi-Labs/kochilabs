import * as THREE from 'three';
import { riverContains } from './water-physics';

type BottleFrame = {
  time: number;
  night: number;
  reducedMotion: boolean;
  viewWidth: number;
  surfaceOffset: number;
  waterHeight(x: number, y: number): number;
};

/** A single corked bottle follows the same wave heights as the boat and coconuts. */
export function createMessageBottle(onAvailable?: (available: boolean) => void) {
  const group = new THREE.Group();
  group.name = 'Drifting glass message bottle';
  group.visible = false;
  const body = new THREE.Group();
  body.rotation.set(.28, .1, -.93);
  group.add(body);
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const fading: { material: THREE.Material; opacity: number }[] = [];
  function surface<T extends THREE.Material>(material: T): T {
    materials.add(material);
    material.transparent = true;
    fading.push({ material, opacity: material.opacity });
    return material;
  }
  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = body) {
    geometries.add(geometry);
    materials.add(material);
    const result = new THREE.Mesh(geometry, material);
    parent.add(result);
    return result;
  }
  const glass = surface(new THREE.MeshPhysicalMaterial({
    color: '#83b7a0', roughness: .09, metalness: .04, opacity: .37,
    clearcoat: 1, clearcoatRoughness: .07, side: THREE.FrontSide, depthWrite: false,
  }));
  const innerGlass = surface(new THREE.MeshPhysicalMaterial({
    color: '#386f57', roughness: .13, metalness: .02, opacity: .23,
    side: THREE.BackSide, depthWrite: false,
  }));
  const profile = [[0, -9], [2.8, -9], [3.9, -8.4], [4.3, -6.8], [4.3, 2.8], [4, 4.6], [2.8, 6], [1.65, 7.6], [1.65, 10.7], [2, 11], [2, 12], [1.35, 12], [1.3, 10.7]].map(([r, y]) => new THREE.Vector2(r!, y!));
  const bottleGeometry = new THREE.LatheGeometry(profile, 32);
  mesh(bottleGeometry, glass);
  mesh(bottleGeometry, innerGlass);
  const rimMaterial = surface(new THREE.MeshStandardMaterial({ color: '#558c70', roughness: .16, metalness: .08, opacity: .65 }));
  const lip = mesh(new THREE.TorusGeometry(1.72, .25, 8, 24), rimMaterial);
  lip.rotation.x = Math.PI / 2; lip.position.y = 11.8;
  const base = mesh(new THREE.TorusGeometry(3.55, .3, 8, 28), rimMaterial);
  base.rotation.x = Math.PI / 2; base.position.y = -8.3;

  const cork = surface(new THREE.MeshStandardMaterial({ color: '#a37f50', roughness: .97 }));
  cork.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBottleLocal;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBottleLocal=position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vBottleLocal;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float pore=fract(sin(dot(floor(vBottleLocal.xy*14.0),vec2(12.9898,78.233)))*43758.5453);
      diffuseColor.rgb*=mix(.64,1.15,smoothstep(.08,.48,pore));`);
  };
  cork.customProgramCacheKey = () => 'bottle-cork-pores-v1';
  mesh(new THREE.CylinderGeometry(1.42, 1.36, 3.1, 20), cork).position.y = 12.5;
  const paper = surface(new THREE.MeshStandardMaterial({ color: '#ddc48b', roughness: .94 }));
  paper.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBottleLocal;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBottleLocal=position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vBottleLocal;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb*=.97+sin(vBottleLocal.y*72.0+sin(vBottleLocal.x*1.8))*.035;');
  };
  paper.customProgramCacheKey = () => 'bottle-leaf-fibres-v1';
  const roll = mesh(new THREE.CylinderGeometry(2.15, 2.3, 10.6, 24), paper);
  roll.position.set(.15, -1.1, .2); roll.rotation.z = .07;
  const ink = surface(new THREE.MeshBasicMaterial({ color: '#6c532d', opacity: .65, depthWrite: false }));
  const edge = mesh(new THREE.PlaneGeometry(3.4, 9.7), paper);
  edge.position.set(.2, -1.1, 2.32); edge.rotation.z = .07;
  for (let i = 0; i < 4; i++) {
    const stroke = mesh(new THREE.PlaneGeometry(2.4 - (i % 3) * .23, .16), ink);
    stroke.position.set(.05 + i * .06, 1.4 - i * 1.6, 2.4);
    stroke.rotation.z = .06;
  }
  const rolledEdge = mesh(new THREE.TorusGeometry(1.65, .17, 5, 24), ink);
  rolledEdge.rotation.x = Math.PI / 2; rolledEdge.position.set(-.2, 4.2, .2);
  const glint = surface(new THREE.MeshBasicMaterial({ color: '#eefdf0', opacity: .72, depthWrite: false }));
  const shine = mesh(new THREE.CylinderGeometry(.13, .22, 10, 8), glint);
  shine.position.set(-2.8, -1.4, 3.15); shine.rotation.z = -.035;
  const neckShine = mesh(new THREE.CylinderGeometry(.09, .12, 3.8, 6), glint);
  neckShine.position.set(-.9, 9.1, 1.4);
  const contactMaterial = surface(new THREE.MeshBasicMaterial({ color: '#214e43', opacity: .19, depthWrite: false }));
  const contact = mesh(new THREE.CircleGeometry(1, 24), contactMaterial, group);
  contact.scale.set(11, 2.2, 1); contact.position.set(0, -5.2, -2);
  const reflectionMaterial = surface(new THREE.MeshBasicMaterial({ color: '#abc4a5', opacity: .16, depthWrite: false }));
  const reflection = mesh(new THREE.CircleGeometry(1, 24), reflectionMaterial, group);
  reflection.scale.set(6, 4.8, 1); reflection.position.set(1, -9.4, -3);
  const hit = mesh(new THREE.PlaneGeometry(50, 44), new THREE.MeshBasicMaterial({ visible: false }), group);
  hit.position.z = 12;

  let active = false, destroyed = false, born = 0, nextArrival = 3, latestTime = 0;
  const dayPaper = new THREE.Color('#ddc48b'), nightPaper = new THREE.Color('#a7b1a6');
  const dayGlint = new THREE.Color('#eefdf0'), nightGlint = new THREE.Color('#b8d4f0');
  function setActive(value: boolean) {
    if (active === value) return;
    active = value; group.visible = value; onAvailable?.(value);
  }
  return {
    group,
    get available() { return active; },
    update({ time, night, reducedMotion, viewWidth, surfaceOffset, waterHeight }: BottleFrame) {
      if (destroyed || !Number.isFinite(time)) return;
      latestTime = time;
      if (!active && time >= nextArrival) { born = time; setActive(true); }
      if (!active) return;
      const age = time - born;
      if (age >= 60) { nextArrival = time + 20; setActive(false); return; }
      const travel = reducedMotion ? .28 : THREE.MathUtils.smoothstep(age, 0, 60);
      const edge = Math.min(350, Math.max(1, viewWidth) * .33);
      const x = -edge + travel * Math.min(205, Math.max(1, viewWidth) * .22);
      const baseY = -247 + surfaceOffset;
      if (!riverContains(x / 1720 + .5, (baseY - surfaceOffset) / 1075 + .5)) {
        nextArrival = time + 20; setActive(false); return;
      }
      const left = waterHeight(x - 9, baseY), right = waterHeight(x + 9, baseY);
      group.position.set(x, baseY + (left + right) * .5 + 3, 18);
      group.rotation.z = Math.atan2(right - left, 18);
      body.rotation.y = reducedMotion ? .1 : Math.sin(time * .55) * .13;
      const fade = reducedMotion ? 1 : THREE.MathUtils.smoothstep(age, 0, 1.5) * (1 - THREE.MathUtils.smoothstep(age, 57, 60));
      fading.forEach(entry => { entry.material.opacity = entry.opacity * fade; });
      const darkness = THREE.MathUtils.clamp(night, 0, 1);
      paper.color.lerpColors(dayPaper, nightPaper, darkness);
      glint.color.lerpColors(dayGlint, nightGlint, darkness);
      reflection.scale.y = 4.8 + Math.abs(right - left) * .4;
    },
    hitTest(raycaster: THREE.Raycaster) { return active && raycaster.intersectObject(hit).length > 0; },
    take() {
      if (!active || destroyed) return false;
      nextArrival = latestTime + 25;
      setActive(false);
      return true;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true; setActive(false); group.removeFromParent();
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
    },
  };
}
