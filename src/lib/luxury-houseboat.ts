import * as THREE from 'three';
import { createHouseboat } from './scene-models';

/** Preserve the original kettuvallam silhouette, with lit, tactile materials. */
export function createLuxuryHouseboat() {
  const group = createHouseboat();
  group.name = 'Traditional Kerala kettuvallam';
  const lighting = new THREE.Group();
  lighting.name = 'Houseboat daylight and cabin lighting';
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const originals = new Set<THREE.Material>();
  const replacements = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  const windows: THREE.MeshStandardMaterial[] = [];

  function surfaceDetail(material: THREE.MeshStandardMaterial, woven: boolean) {
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBoatLocal;');
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvBoatLocal=position;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vBoatLocal;');
      const texture = woven
        ? 'float grain=sin(vBoatLocal.x*4.3)*sin((vBoatLocal.y+vBoatLocal.z)*4.5)*.075+sin(vBoatLocal.x*.47)*.025;'
        : 'float grain=sin(vBoatLocal.y*5.8+vBoatLocal.z*.7+sin(vBoatLocal.x*.095)*1.8)*.055+sin(vBoatLocal.y*11.7+vBoatLocal.x*.02)*.02;';
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n${texture}\ndiffuseColor.rgb*=.97+grain;`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal=normalize(normal-vec3(dFdx(grain),dFdy(grain),0.0)*.6);');
    };
    material.customProgramCacheKey = () => `traditional-boat-${woven ? 'woven' : 'wood'}-1`;
  }

  // Reuse every part of the earlier design: curved roof, arched windows,
  // small veranda, upswept canoe hull and coir fenders.
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    const convert = (original: THREE.Material) => {
      originals.add(original);
      const cached = replacements.get(original);
      if (cached) return cached;
      const source = original as THREE.MeshBasicMaterial;
      const isWindow = Boolean(source.userData.nightGlow);
      const darkWood = source.color.getHexString() === '514638';
      const material = new THREE.MeshStandardMaterial({
        color: source.color, vertexColors: source.vertexColors,
        roughness: isWindow ? .18 : darkWood ? .48 : .86,
        metalness: isWindow ? .15 : 0,
        side: source.side,
      });
      if (isWindow) {
        material.emissive.set('#ffd393');
        material.emissiveIntensity = 0;
        windows.push(material);
      } else surfaceDetail(material, !darkWood);
      materials.add(material);
      replacements.set(original, material);
      return material;
    };
    object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
  });
  originals.forEach(material => material.dispose());

  // Fine planking follows the old hull's rise instead of changing its outline.
  const seams = new THREE.MeshStandardMaterial({ color: '#322b21', roughness: .82 });
  materials.add(seams);
  for (const y of [-6, -1, 4]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-94, y + 9, 25.2), new THREE.Vector3(-73, y, 25.2),
      new THREE.Vector3(0, y, 25.2), new THREE.Vector3(73, y + .5, 25.2),
      new THREE.Vector3(98, y + 12, 25.2),
    ]);
    const geometry = new THREE.TubeGeometry(curve, 30, .18, 4, false);
    geometries.add(geometry);
    group.add(new THREE.Mesh(geometry, seams));
  }
  const lampMaterial = new THREE.MeshStandardMaterial({ color: '#e2c58a', roughness: .66, emissive: '#ffd18b', emissiveIntensity: .12 });
  materials.add(lampMaterial);
  const lampGeometry = new THREE.SphereGeometry(1.6, 10, 8);
  geometries.add(lampGeometry);
  const verandaLamp = new THREE.Mesh(lampGeometry, lampMaterial);
  verandaLamp.scale.set(1, 1.5, 1);
  verandaLamp.position.set(-70, 46, 21.5);
  group.add(verandaLamp);

  const hemi = new THREE.HemisphereLight('#e9f2ec', '#3a443b', 1.7);
  const sun = new THREE.DirectionalLight('#fff1d7', 2.1);
  sun.position.set(-180, 300, 240);
  const rim = new THREE.DirectionalLight('#b9d5e6', .6);
  rim.position.set(200, 80, -160);
  const cabinLight = new THREE.PointLight('#ffd193', 0, 180, 1.2);
  cabinLight.position.set(-52, 38, 50);
  lighting.add(hemi, sun, sun.target, rim, rim.target, cabinLight);
  const dayWindow = new THREE.Color('#355f5a');
  const nightWindow = new THREE.Color('#8d6c3d');
  let destroyed = false;

  return {
    group, lighting,
    update(_time: number, night: number, _reducedMotion: boolean) {
      if (destroyed) return;
      const n = THREE.MathUtils.clamp(night, 0, 1);
      hemi.intensity = THREE.MathUtils.lerp(1.7, .3, n);
      sun.intensity = THREE.MathUtils.lerp(2.1, .16, n);
      rim.intensity = THREE.MathUtils.lerp(.6, .3, n);
      cabinLight.intensity = n * 90;
      windows.forEach(material => {
        material.color.copy(dayWindow).lerp(nightWindow, n);
        material.emissiveIntensity = n * .95;
      });
      lampMaterial.emissiveIntensity = THREE.MathUtils.lerp(.12, 2, n);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      group.removeFromParent(); lighting.removeFromParent();
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
    },
  };
}
