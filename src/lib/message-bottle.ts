import * as THREE from 'three';
import { riverContains } from './water-physics';

const NOTES = [
  'Good things take their own sweet time.',
  'A little curiosity brought you here.',
  'Somewhere between the palms and the tide, a new idea is growing.',
  'Let the little things surprise you.',
] as const;

type BottleFrame = {
  time: number;
  night: number;
  reducedMotion: boolean;
  viewWidth: number;
  surfaceOffset: number;
  waterHeight(x: number, y: number): number;
};

/** One reusable, corked glass bottle. Its paper stays dry until a visitor opens it. */
export function createMessageBottle(onAvailable?: (available: boolean) => void) {
  const group = new THREE.Group();
  group.name = 'message-in-a-bottle';
  group.visible = false;
  const body = new THREE.Group();
  body.rotation.z = -.93;
  body.rotation.x = .28;
  group.add(body);
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const fading: { material: THREE.Material & { opacity: number }; opacity: number }[] = [];
  const material = <T extends THREE.Material>(value: T) => {
    materials.add(value);
    value.transparent = true;
    fading.push({ material: value, opacity: value.opacity });
    return value;
  };
  const glass = material(new THREE.MeshPhysicalMaterial({
    color: '#9cc8ab', roughness: .12, metalness: .04, transparent: true, opacity: .48,
    clearcoat: 1, clearcoatRoughness: .12, side: THREE.DoubleSide, depthWrite: false,
  }));
  const cork = material(new THREE.MeshStandardMaterial({ color: '#90724b', roughness: .95 }));
  const paper = material(new THREE.MeshStandardMaterial({ color: '#f9e6b9', roughness: .94 }));
  const ink = material(new THREE.MeshBasicMaterial({ color: '#80664c', opacity: .58 }));
  const glint = material(new THREE.MeshBasicMaterial({ color: '#f0fff5', opacity: .7, depthWrite: false }));
  function mesh(geometry: THREE.BufferGeometry, surface: THREE.Material, parent: THREE.Object3D = body) {
    geometries.add(geometry);
    const result = new THREE.Mesh(geometry, surface);
    parent.add(result);
    return result;
  }
  const profile = [new THREE.Vector2(0, -9), new THREE.Vector2(3.2, -9), new THREE.Vector2(4, -8), new THREE.Vector2(4.2, -6), new THREE.Vector2(4.2, 3), new THREE.Vector2(3.8, 5), new THREE.Vector2(1.7, 7), new THREE.Vector2(1.7, 11), new THREE.Vector2(2, 11.4), new THREE.Vector2(2, 12), new THREE.Vector2(1.3, 12)];
  mesh(new THREE.LatheGeometry(profile, 20), glass);
  mesh(new THREE.CylinderGeometry(1.35, 1.45, 3.2, 12), cork).position.y = 12;
  const roll = mesh(new THREE.CylinderGeometry(2.3, 2.3, 10, 16), paper);
  roll.position.y = -1;
  // A loose paper edge and three small pen strokes remain visible through the glass.
  const edge = mesh(new THREE.PlaneGeometry(3.7, 9), paper);
  edge.position.set(0, -1, 2.3);
  for (let i = 0; i < 3; i++) {
    const stroke = mesh(new THREE.PlaneGeometry(2.5 - i * .25, .18), ink);
    stroke.position.set(0, .9 - i * 1.5, 2.39);
    stroke.rotation.z = .08;
  }
  const shine = mesh(new THREE.CylinderGeometry(.18, .12, 9.5, 6), glint);
  shine.position.set(-2.8, -1.7, 3);
  const rim = mesh(new THREE.TorusGeometry(1.75, .26, 5, 16), glint);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 11.9;
  const contactMat = material(new THREE.MeshBasicMaterial({ color: '#224e47', opacity: .19, depthWrite: false }));
  const contact = mesh(new THREE.CircleGeometry(1, 24), contactMat, group);
  contact.scale.set(11, 2.1, 1);
  contact.position.set(0, -5.1, -2);
  const reflectionMat = material(new THREE.MeshBasicMaterial({ color: '#aac7a4', opacity: .17, depthWrite: false }));
  const reflection = mesh(new THREE.CircleGeometry(1, 20), reflectionMat, group);
  reflection.scale.set(6, 5, 1);
  reflection.position.set(1, -9.5, -3);
  const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
  materials.add(hitMaterial);
  const hit = mesh(new THREE.PlaneGeometry(50, 44), hitMaterial, group);
  hit.position.z = 12;

  let active = false;
  let born = 0;
  let nextArrival = 9;
  let noteIndex = 0;
  let destroyed = false;
  let latestTime = 0;
  const dayPaper = new THREE.Color('#f9e6b9');
  const nightPaper = new THREE.Color('#9baaa9');
  const dayGlint = new THREE.Color('#f0fff5');
  const nightGlint = new THREE.Color('#b5cbe9');
  const setActive = (value: boolean) => {
    if (active === value) return;
    active = value;
    group.visible = value;
    onAvailable?.(value);
  };

  return {
    group,
    get available() { return active; },
    update({ time, night, reducedMotion, viewWidth, surfaceOffset, waterHeight }: BottleFrame) {
      if (destroyed) return;
      latestTime = time;
      if (!active && time >= nextArrival) {
        born = time;
        nextArrival = time + 64 + (noteIndex % 3) * 5;
        setActive(true);
      }
      if (!active) return;
      const age = time - born;
      if (age >= 43) { setActive(false); return; }
      const travel = reducedMotion ? .28 : THREE.MathUtils.smoothstep(age, 0, 43);
      const edge = Math.min(350, viewWidth * .33);
      const x = -edge + travel * Math.min(205, viewWidth * .22);
      const baseY = -247 + surfaceOffset;
      if (!riverContains(x / 1720 + .5, (baseY - surfaceOffset) / 1075 + .5)) {
        setActive(false);
        return;
      }
      const left = waterHeight(x - 9, baseY);
      const right = waterHeight(x + 9, baseY);
      group.position.set(x, baseY + (left + right) * .5 + 3, 18);
      group.rotation.z = Math.atan2(right - left, 18);
      body.rotation.y = reducedMotion ? .1 : Math.sin(time * .55) * .13;
      const fade = reducedMotion ? 1 : THREE.MathUtils.smoothstep(age, 0, 2) * (1 - THREE.MathUtils.smoothstep(age, 39, 43));
      fading.forEach(entry => { entry.material.opacity = entry.opacity * fade; });
      paper.color.lerpColors(dayPaper, nightPaper, night);
      glint.color.lerpColors(dayGlint, nightGlint, night);
      reflection.scale.y = 4.8 + Math.abs(right - left) * .4;
    },
    hitTest(raycaster: THREE.Raycaster) { return active && raycaster.intersectObject(hit).length > 0; },
    take() {
      if (!active || destroyed) return null;
      const note = NOTES[noteIndex++ % NOTES.length]!;
      setActive(false);
      nextArrival = Math.max(nextArrival, latestTime + 35);
      return note;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      setActive(false);
      group.removeFromParent();
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(surface => surface.dispose());
    },
  };
}
