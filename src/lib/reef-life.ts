import * as THREE from 'three';

type ReefSchool = {
  count: number;
  center: THREE.Vector3;
  radiusX: number;
  radiusZ: number;
  speed: number;
  startAngle: number;
  size: number;
  color: string;
};

const schools: ReefSchool[] = [
  { count: 22, center: new THREE.Vector3(-4, 7, -13), radiusX: 9, radiusZ: 3, speed: .16, startAngle: 2.1, size: .60, color: '#8acbd0' },
  { count: 13, center: new THREE.Vector3(0, 1.3, -3), radiusX: 8, radiusZ: 1.8, speed: -.19, startAngle: -.92, size: .80, color: '#f4ce79' },
  { count: 11, center: new THREE.Vector3(-5, 3.5, 2), radiusX: 5, radiusZ: 2.3, speed: .22, startAngle: 1.48, size: .62, color: '#72bad2' },
];

// Organic variation with a stable seafloor layout each time the visitor returns.
function seed(i: number) {
  const n = Math.sin(i * 127.1 + 91.7) * 43758.5453;
  return n - Math.floor(n);
}

function fishBody() {
  const outline = [
    [-.48, .025], [-.39, .063], [-.26, .16], [-.08, .236],
    [.12, .245], [.29, .19], [.41, .105], [.465, .035], [.475, 0],
  ];
  const geometry = new THREE.LatheGeometry(outline.map(([x, radius]) => new THREE.Vector2(radius, x)), 14);
  geometry.rotateZ(-Math.PI / 2);
  geometry.scale(1, 1, .55);
  const vertices = geometry.getAttribute('position');
  const colors: number[] = [];
  const flank = new THREE.Color(), back = new THREE.Color('#326475'), belly = new THREE.Color('#e0efdc');
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), y = vertices.getY(i);
    flank.copy(belly).lerp(back, THREE.MathUtils.smoothstep(y, -.14, .21));
    if (x > .11 && x < .14) flank.multiplyScalar(.72);
    colors.push(flank.r, flank.g, flank.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

function forkedTail() {
  const shape = new THREE.Shape();
  shape.moveTo(.015, .04);
  shape.quadraticCurveTo(-.10, .09, -.28, .20);
  shape.quadraticCurveTo(-.25, .09, -.17, 0);
  shape.quadraticCurveTo(-.24, -.08, -.27, -.17);
  shape.quadraticCurveTo(-.10, -.09, .015, -.04);
  shape.closePath();
  return new THREE.ShapeGeometry(shape, 5);
}

const up = new THREE.Vector3(0, 1, 0);

export function createReefLife() {
  const group = new THREE.Group();
  group.name = 'Living reef';
  const targets: THREE.Object3D[] = [];
  const model = new THREE.Object3D(), part = new THREE.Object3D();
  model.rotation.order = 'YXZ';
  model.add(part);
  const point = new THREE.Vector3(), direction = new THREE.Vector3();
  const total = schools.reduce((sum, school) => sum + school.count, 0);
  const bodies = new THREE.InstancedMesh(fishBody(), new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: .4, metalness: .13, side: THREE.DoubleSide,
  }), total);
  const tails = new THREE.InstancedMesh(forkedTail(), new THREE.MeshStandardMaterial({
    color: '#becab6', emissive: '#122327', side: THREE.DoubleSide, roughness: .55, metalness: .08,
  }), total);
  const eyes = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ color: '#0c2939' }), total * 2);
  for (const mesh of [bodies, tails, eyes]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  bodies.name = 'Reef fish';
  targets.push(bodies);
  const fish = schools.flatMap((school, schoolIndex) =>
    Array.from({ length: school.count }, (_, i) => {
      const id = i + 41 * schoolIndex;
      const size = school.size * (.65 + seed(id + 1) * .7);
      return {
        school, size, phase: seed(id + 34) * Math.PI * 2,
        along: (seed(id + 17) - .5) * 4, above: (seed(id + 9) - .5) * 1.2, behind: (seed(id + 14) - .5) * 2,
        position: new THREE.Vector3(), offset: new THREE.Vector3(), velocity: new THREE.Vector3(),
      };
    })
  );
  const tint = new THREE.Color();
  fish.forEach((f, i) => {
    tint.set(f.school.color).multiplyScalar(.78 + seed(i) * .36);
    bodies.setColorAt(i, tint);
    tails.setColorAt(i, tint);
  });

  const branchShape = new THREE.CylinderGeometry(.55, 1, 1, 7);
  const tipShape = new THREE.IcosahedronGeometry(1, 1);
  const spongeShape = new THREE.LatheGeometry([
    new THREE.Vector2(.045, 0), new THREE.Vector2(.105, .28), new THREE.Vector2(.14, .75),
    new THREE.Vector2(.19, .97), new THREE.Vector2(.20, 1), new THREE.Vector2(.14, 1.015),
    new THREE.Vector2(.105, .93), new THREE.Vector2(.055, .52), new THREE.Vector2(0, .48),
  ], 12);
  const gardens = [
    { x: -8.7, z: 2.5, scale: 1.22, hue: '#ba645f' }, { x: 7.8, z: 1.7, scale: 1.38, hue: '#ac736b' },
    { x: -6.1, z: -3, scale: .72, hue: '#a288a0' }, { x: 4.5, z: -4.5, scale: .83, hue: '#d48757' },
    { x: -13, z: -9, scale: 1.05, hue: '#a98d7b' }, { x: 12.8, z: -10, scale: .88, hue: '#b16788' },
  ].map((site, index) => {
    const root = new THREE.Group();
    root.position.set(site.x, -3, site.z);
    root.scale.setScalar(site.scale);
    const material = new THREE.MeshStandardMaterial({ color: site.hue, roughness: .92, emissive: site.hue, emissiveIntensity: .12 });
    const tipMaterial = new THREE.MeshStandardMaterial({ color: '#f4a780', emissive: '#ffc895', emissiveIntensity: .23, roughness: .75 });
    const branches: THREE.Matrix4[] = [], tips: THREE.Matrix4[] = [];
    const matrix = new THREE.Object3D();
    function branch(start: THREE.Vector3, angle: number, depth: number, length: number, key: number) {
      const axis = new THREE.Vector3(Math.sin(angle), Math.cos(angle), .28 * (seed(key) - .5)).normalize();
      const end = start.clone().addScaledVector(axis, length);
      const radius = .035 + .033 * depth;
      matrix.position.copy(start).lerp(end, .5);
      matrix.quaternion.setFromUnitVectors(up, axis);
      matrix.scale.set(radius, length, radius);
      matrix.updateMatrix();
      branches.push(matrix.matrix.clone());
      if (depth > 0) {
        branch(end, angle - .25 - seed(key + 7) * .43, depth - 1, length * (.64 + seed(key + 1) * .16), key * 2 + 1);
        branch(end, angle + .24 + seed(key + 9) * .41, depth - 1, length * (.63 + seed(key + 3) * .18), key * 2 + 2);
      } else {
        matrix.position.copy(end);
        matrix.scale.set(.048, .072, .048);
        matrix.updateMatrix();
        tips.push(matrix.matrix.clone());
      }
    }
    for (let fan = 0; fan < 5; fan++) {
      const key = index * 6 + fan + 1;
      branch(new THREE.Vector3((fan - 2) * .61, 0, (seed(key + 8) - .5) * .9), (seed(key) - .5) * .8, 4, .55 + seed(key + 4) * .64, key);
    }
    const wood = new THREE.InstancedMesh(branchShape, material, branches.length);
    const polyps = new THREE.InstancedMesh(tipShape, tipMaterial, tips.length);
    branches.forEach((m, i) => wood.setMatrixAt(i, m));
    tips.forEach((m, i) => polyps.setMatrixAt(i, m));
    const tubes = new THREE.InstancedMesh(spongeShape, material, 8);
    for (let i = 0; i < tubes.count; i++) {
      const key = index * 32 + i;
      matrix.position.set((seed(key + 1) - .5) * 2.6, .02, .4 + seed(key + 5) * .24);
      matrix.rotation.set(seed(key + 2) * .18, seed(key + 7) * 3, (seed(key + 9) - .5) * .6);
      const height = .64 + seed(key + 3);
      matrix.scale.setScalar(height);
      matrix.updateMatrix();
      tubes.setMatrixAt(i, matrix.matrix);
    }
    for (const mesh of [wood, polyps, tubes]) {
      mesh.userData.reefGarden = index;
      mesh.name = 'Living coral';
      targets.push(mesh);
      root.add(mesh);
    }
    group.add(root);
    return { material, tipMaterial, glow: 0 };
  });

  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshPhongMaterial({
    color: '#78bbcf', emissive: '#173749', specular: '#efffff', shininess: 85, transparent: true, opacity: .30, depthWrite: false,
  }), 52);
  bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bubbles.frustumCulled = false;
  group.add(bubbles);
  const vents = [[-7.2, 3], [7.5, 1], [-5, -7], [3, -12]];
  const particles = Array.from({ length: bubbles.count }, (_, i) => {
    const [x, z] = vents[i % vents.length]!;
    return { x: x + (seed(i + 23) - .5) * 1.2, z: z + (seed(i + 4) - .5) * .7,
      size: .025 + seed(i + 2) * .075, phase: seed(i + 17) * 12 };
  });

  function update(time: number, dt: number, reducedMotion: boolean) {
    const t = reducedMotion ? 0 : time;
    const step = Math.min(Math.max(dt, 0), .08);
    fish.forEach((f, i) => {
      const s = f.school;
      const angle = s.startAngle + s.speed * t + f.along * .05 + f.phase * .027;
      direction.set(-s.radiusX * Math.sin(angle) * s.speed, 0, s.radiusZ * Math.cos(angle) * s.speed).normalize();
      f.offset.addScaledVector(f.velocity, step).multiplyScalar(Math.exp(-1.05 * step));
      f.velocity.multiplyScalar(Math.exp(-2.2 * step));
      f.position.set(
        s.center.x + s.radiusX * Math.cos(angle) + direction.x * f.along + direction.z * f.behind,
        s.center.y + f.above + .22 * Math.sin(t * .72 + f.phase),
        s.center.z + s.radiusZ * Math.sin(angle) + direction.z * f.along - direction.x * f.behind,
      ).add(f.offset);
      direction.addScaledVector(f.velocity, .4);
      model.position.copy(f.position);
      model.scale.setScalar(f.size);
      model.rotation.set(.07 * Math.cos(t * 1.4 + f.phase), -Math.atan2(direction.z, direction.x), .05 * Math.cos(t * .72 + f.phase));
      model.updateMatrixWorld();
      bodies.setMatrixAt(i, model.matrixWorld);
      part.position.set(-.47, .01, 0);
      part.rotation.set(0, .46 * Math.sin(t * 7.2 + f.phase), 0);
      part.scale.setScalar(1);
      part.updateWorldMatrix(false, false);
      tails.setMatrixAt(i, part.matrixWorld);
      part.rotation.set(0, 0, 0);
      part.scale.set(.041, .041, .019);
      for (let side = 0; side < 2; side++) {
        part.position.set(.27, .085, (side ? 1 : -1) * .09);
        part.updateWorldMatrix(false, false);
        eyes.setMatrixAt(i * 2 + side, part.matrixWorld);
      }
    });
    for (const mesh of [bodies, tails, eyes]) mesh.instanceMatrix.needsUpdate = true;
    bodies.computeBoundingSphere();

    particles.forEach((particle, i) => {
      const height = (particle.phase + t * (.39 + particle.size)) % 12;
      model.position.set(particle.x + .15 * Math.sin(height * 1.3 + i), -2.8 + height, particle.z + .07 * Math.cos(height + i));
      model.scale.setScalar(particle.size * (.68 + .32 * height / 12) * Math.min(1, height * 4, (12 - height) * 3));
      model.rotation.set(0, 0, 0);
      model.updateMatrix();
      bubbles.setMatrixAt(i, model.matrix);
    });
    bubbles.instanceMatrix.needsUpdate = true;
    for (const garden of gardens) {
      garden.glow *= Math.exp(-.55 * step);
      garden.material.emissiveIntensity = .12 + garden.glow * .7;
      garden.tipMaterial.emissiveIntensity = .23 + garden.glow * 2;
    }
  }

  function disturb(at: THREE.Vector3) {
    fish.forEach((f, i) => {
      point.copy(f.position).sub(at);
      const distance = point.length();
      if (distance >= 4) return;
      if (distance < .12) point.set(seed(i) - .5, .3, seed(i + 15) - .5);
      f.velocity.addScaledVector(point.normalize(), (1 - distance / 4) * 5.2).clampLength(0, 8);
    });
  }

  function interact(target: THREE.Object3D) {
    if (target === bodies) return 'A school of reef fish scatters.';
    const garden = gardens[target.userData.reefGarden];
    if (!garden) return '';
    garden.glow = 1;
    return 'The coral polyps light up.';
  }

  update(0, 0, false);
  return { group, targets, update, disturb, interact };
}
