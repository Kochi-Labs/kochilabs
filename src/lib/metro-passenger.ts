import * as THREE from 'three';

/** A fixed-size, replayable little dragon performance attached to the moving metro. */
export function createMetroPassenger(train: THREE.Group) {
  const carriage = train.children
    .filter((child): child is THREE.Group => child instanceof THREE.Group)
    .sort((a, b) => a.position.x - b.position.x)[0];
  if (!carriage) throw new Error('A metro carriage is required for its passenger.');
  const group = new THREE.Group();
  group.name = 'The last metro passenger';
  group.visible = false;
  train.add(group);
  const dragon = new THREE.Group();
  dragon.name = 'Flying dragon';
  group.add(dragon);
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.MeshBasicMaterial>();
  const colors: { material: THREE.MeshBasicMaterial; day: THREE.Color; night: THREE.Color }[] = [];
  function paint(color: string, glow = false) {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    materials.add(material);
    colors.push({ material, day: material.color.clone(), night: material.color.clone().multiply(new THREE.Color(glow ? '#fff0d4' : '#cbd5bc')) });
    return material;
  }
  const skin = paint('#84b977');
  const shade = paint('#517c68');
  const belly = paint('#f3d797');
  const ink = paint('#25453d');
  const wingMembrane = paint('#d7a15f');
  const orange = paint('#f79236', true);
  const yellow = paint('#ffe5a0', true);
  const dragonMaterials = [skin, shade, belly, ink, wingMembrane];
  function shape(points: number[][], material: THREE.MeshBasicMaterial, parent: THREE.Group, z = 0) {
    const outline = new THREE.Shape();
    points.forEach(([x, y], index) => index ? outline.lineTo(x!, y!) : outline.moveTo(x!, y!));
    outline.closePath();
    const geometry = new THREE.ShapeGeometry(outline);
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = z;
    parent.add(mesh);
    return mesh;
  }
  function curved(outline: THREE.Shape, material: THREE.MeshBasicMaterial, parent: THREE.Group, z = 0) {
    const geometry = new THREE.ShapeGeometry(outline, 7);
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = z;
    parent.add(mesh);
    return mesh;
  }

  const wing = new THREE.Group();
  wing.position.set(-1, 5.5, -.1);
  dragon.add(wing);
  shape([[0, 0], [-3, 8], [-8.4, 11.8], [-7.6, 6.5], [-11, 5.3], [-7.4, 3.5], [-8.5, .8], [-4.5, 1.3], [-3, -1]], shade, wing);
  shape([[-.7, .6], [-3.5, 7], [-7.2, 9.6], [-6.5, 5.8], [-9.2, 5.2], [-6.2, 3.3], [-6.8, 1.6], [-4, 2]], wingMembrane, wing, .02);
  shape([[-3.3, 6.8], [-2.9, 6.7], [-.3, .1], [-.8, .1]], belly, wing, .03);

  const body = new THREE.Shape();
  body.moveTo(-2.1, 1);
  body.bezierCurveTo(-7, -.5, -10, 2, -9.4, 5);
  body.bezierCurveTo(-7.7, 1.7, -5, 4, -3.3, 4.5);
  body.bezierCurveTo(-3, 6.2, -2, 7, -1.8, 9.2);
  body.bezierCurveTo(-1.7, 11.6, 1.2, 12.3, 3.3, 10.3);
  body.lineTo(6.8, 9.1);
  body.quadraticCurveTo(7.6, 7.4, 5.9, 7.1);
  body.lineTo(2.2, 7.1);
  body.bezierCurveTo(1.7, 5.2, 3, 3, 1.7, 1);
  body.quadraticCurveTo(0, -.5, -2.1, 1);
  curved(body, skin, dragon);
  const tummy = new THREE.Shape();
  tummy.moveTo(.2, 7); tummy.bezierCurveTo(1.1, 5.4, 2.2, 2.7, .6, 1.2);
  tummy.bezierCurveTo(-2.5, .2, -1.8, 4.2, .2, 7);
  curved(tummy, belly, dragon, .03);
  shape([[-1.2, 10.6], [-2.2, 13], [.1, 11.1]], belly, dragon, .04);
  shape([[-3.1, 5.2], [-5, 6.2], [-4.1, 3.7]], belly, dragon, .04);
  shape([[-2.8, 1.6], [-3.6, -.4], [-.7, -.4], [-.8, .4]], shade, dragon, .03);
  shape([[.4, 1.2], [.4, -.5], [3, -.5], [2.4, .4]], skin, dragon, .06);
  const eyeGeometry = new THREE.CircleGeometry(.48, 12);
  geometries.add(eyeGeometry);
  const eye = new THREE.Mesh(eyeGeometry, ink); eye.position.set(2.7, 10, .06); dragon.add(eye);
  shape([[4.7, 7.4], [6.9, 7.4], [6.7, 7.8], [4.7, 7.8]], ink, dragon, .06);
  const arm = new THREE.Group(); arm.position.set(1, 5, .08); dragon.add(arm);
  shape([[0, -.3], [1.2, -.25], [2.5, 1.8], [1.7, 2.3], [.7, .6], [0, .5]], skin, arm);
  shape([[1.7, 1.7], [1.8, 2.8], [2.3, 2.8], [2.6, 1.9]], belly, arm, .02);

  // Two softly tapered ribbons connect the mouth to the roofs; no particles accumulate.
  const fire = new THREE.Group(); fire.name = 'Dragon breath'; fire.position.z = 14; group.add(fire);
  const segments = 18;
  function ribbon(material: THREE.MeshBasicMaterial) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((segments + 1) * 2 * 3), 3));
    const indices: number[] = [];
    for (let i = 0; i < segments; i++) { const n = i * 2; indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); }
    geometry.setIndex(indices); geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false; fire.add(mesh); return mesh;
  }
  const outerBreath = ribbon(orange);
  const innerBreath = ribbon(yellow);
  innerBreath.position.z = .04;
  const roofFires: { group: THREE.Group; x: number; ignite: number; materials: THREE.MeshBasicMaterial[] }[] = [];
  for (const center of [0, 101]) {
    for (let index = 0; index < 5; index++) {
      const x = center - 34 + index * 17;
      const flames = new THREE.Group(); flames.position.set(x, 28.5, 14.5); group.add(flames);
      const outer = paint('#ed873b', true), inner = paint('#ffe5a0', true);
      const flame = new THREE.Shape();
      flame.moveTo(-6, 0); flame.bezierCurveTo(-12, 8, -2, 10, -1, 21);
      flame.bezierCurveTo(6, 16, 2, 10, 7, 7); flame.bezierCurveTo(11, 3, 5, -1, -6, 0);
      curved(flame, outer, flames);
      const core = new THREE.Shape(); core.moveTo(-3, 0); core.bezierCurveTo(-5, 5, 1, 7, 2, 12); core.bezierCurveTo(7, 7, 5, 2, 3, 0);
      curved(core, inner, flames, .04);
      roofFires.push({ group: flames, x, ignite: 3.25 + ((x + 34) / 169) * 3.35, materials: [outer, inner] });
    }
  }

  let clicks = 0;
  let revealed = false;
  let active = false;
  let elapsed = 0;
  let destroyed = false;
  const originX = carriage.position.x - 18;
  const smooth = (value: number) => { const t = THREE.MathUtils.clamp(value, 0, 1); return t * t * (3 - 2 * t); };
  function setRibbon(mesh: THREE.Mesh<THREE.BufferGeometry>, mouthX: number, mouthY: number, targetX: number, targetY: number, width: number, motion: boolean) {
    const positions = mesh.geometry.getAttribute('position');
    const dx = targetX - mouthX, dy = targetY - mouthY, length = Math.max(1, Math.hypot(dx, dy));
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const bend = Math.sin(t * Math.PI) * (motion ? Math.sin(t * 17 - elapsed * 9) * 1.6 : 0);
      const w = width * (.13 + .87 * Math.sin(t * Math.PI * .82));
      for (let side = 0; side < 2; side++) {
        const offset = bend + (side ? 1 : -1) * w;
        positions.setXYZ(i * 2 + side, mouthX + dx * t - dy / length * offset, mouthY + dy * t + dx / length * offset, 0);
      }
    }
    positions.needsUpdate = true;
  }

  return {
    group,
    get revealed() { return revealed; },
    get active() { return active; },
    get tapCount() { return clicks; },
    hitTest(object: THREE.Object3D) {
      let ancestor: THREE.Object3D | null = object;
      while (ancestor && ancestor !== train) {
        if (ancestor === carriage) return true;
        ancestor = ancestor.parent;
      }
      return false;
    },
    /** Three rear-carriage taps start each performance. Taps during it do not reset it. */
    tap() {
      if (destroyed || active) return false;
      clicks = Math.min(3, clicks + 1);
      if (clicks !== 3) return false;
      revealed = true; active = true; elapsed = 0; group.visible = true;
      dragon.position.set(originX, 16.6, 12); dragon.scale.setScalar(.48);
      wing.visible = false; fire.visible = false; roofFires.forEach((flame) => { flame.group.visible = false; });
      dragonMaterials.forEach((material) => { material.opacity = 1; });
      return true;
    },
    update(dt: number, night: number, reducedMotion: boolean) {
      if (destroyed) return;
      colors.forEach(({ material, day, night: afterDark }) => material.color.copy(day).lerp(afterDark, THREE.MathUtils.clamp(night, 0, 1)));
      if (!active) return;
      elapsed += THREE.MathUtils.clamp(dt, 0, .1);
      const t = elapsed;
      const duration = reducedMotion ? 7 : 11.5;
      if (t >= duration) {
        active = false; clicks = 0; group.visible = false; fire.visible = false;
        roofFires.forEach((flame) => { flame.group.visible = false; });
        return;
      }
      // Reduced motion presents the large dragon and warm roof flames without flight or flashing.
      const rise = reducedMotion ? 1 : smooth((t - .65) / 1.7);
      const depart = reducedMotion ? 0 : smooth((t - 8.5) / 3);
      const breathProgress = smooth((t - 3.1) / 3.7);
      const scale = THREE.MathUtils.lerp(.48, 4.05, rise) * (1 - depart * .35);
      dragon.scale.setScalar(scale);
      dragon.position.set(
        THREE.MathUtils.lerp(originX, -66, rise) + breathProgress * 18 + depart * 330,
        THREE.MathUtils.lerp(16.6, 49, rise) + Math.sin(rise * Math.PI) * 14 + depart * 100 + (reducedMotion ? 0 : Math.sin(t * 2) * 1.2 * rise),
        12,
      );
      wing.visible = rise > .03;
      wing.scale.y = reducedMotion ? .65 : .67 + Math.sin(t * 7) * .3;
      wing.rotation.z = reducedMotion ? 0 : Math.sin(t * 7) * .1;
      arm.rotation.z = reducedMotion ? -.2 : -.2 + Math.sin(t * 8) * .45 * (t < 3 ? 1 : .2);
      dragonMaterials.forEach((material) => { material.opacity = reducedMotion ? 1 - smooth((t - 6) / 1) : 1 - smooth((t - 10.5) / 1); });

      const breathStart = reducedMotion ? 1 : 3.1, breathEnd = reducedMotion ? 4.6 : 7.1;
      fire.visible = t >= breathStart && t < breathEnd;
      if (fire.visible) {
        const sweep = smooth((t - breathStart) / (breathEnd - breathStart));
        const mouthX = dragon.position.x + 6.7 * scale;
        const mouthY = dragon.position.y + 7.6 * scale;
        const reach = smooth((t - breathStart) / .4);
        const targetX = THREE.MathUtils.lerp(mouthX, -28 + sweep * 163, reach);
        const targetY = THREE.MathUtils.lerp(mouthY, 31, reach);
        const envelope = smooth((t - breathStart) / .25) * (1 - smooth((t - breathEnd + .45) / .45));
        orange.opacity = envelope * .9; yellow.opacity = envelope * .95;
        setRibbon(outerBreath, mouthX, mouthY, targetX, targetY, 8.5 * envelope, !reducedMotion);
        setRibbon(innerBreath, mouthX, mouthY, targetX, targetY, 3.5 * envelope, !reducedMotion);
      }
      for (const flame of roofFires) {
        const ignite = reducedMotion ? .9 + ((flame.x + 34) / 169) * 3.2 : flame.ignite;
        const grow = smooth((t - ignite) / .4);
        const fade = 1 - smooth((t - (reducedMotion ? 4.7 : 7.6)) / (reducedMotion ? 1.3 : 1.1));
        const life = grow * fade;
        flame.group.visible = life > .001;
        flame.group.scale.set(1, life * (reducedMotion ? .72 : .85 + Math.sin(t * 4 + flame.x) * .15), 1);
        flame.group.rotation.z = reducedMotion ? 0 : Math.sin(t * 2 + flame.x) * .07;
        flame.materials.forEach((material) => { material.opacity = life * .88; });
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true; active = false; group.removeFromParent();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    },
  };
}
