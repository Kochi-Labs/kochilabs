import * as THREE from 'three';

type Point = [number, number, number];
type Member = { transform: THREE.Matrix4; color: string };

// Each cross section gives the height, pier-center offset and half-width of a pier.
const sections: Point[] = [
  [0.22, 3.02, 0.32],
  [1.2, 2.64, 0.29],
  [2.15, 2.25, 0.26],
  [3.12, 1.91, 0.23],
  [4.05, 1.62, 0.2],
  [5.12, 1.31, 0.18],
  [6.21, 1.08, 0.15],
  [7.42, 0.85, 0.105],
  [8.62, 0.7, 0.086],
  [9.9, 0.57, 0.074],
  [11.2, 0.46, 0.062],
  [12.55, 0.37, 0.056],
  [13.84, 0.28, 0.047],
  [14.86, 0.23, 0.043],
];

export function createEiffelTower(): THREE.Group {
  const tower = new THREE.Group();
  tower.name = 'Eiffel Tower';
  const iron: Member[] = [];
  const lights: Member[] = [];
  const bronze = '#957456',
    dark = '#705b49',
    edge = '#c49a70',
    stone = '#aaa79a';
  const box = new THREE.BoxGeometry();
  const pose = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const direction = new THREE.Vector3();

  function block(center: Point, size: Point, color: string, batch = iron) {
    pose.position.set(...center);
    pose.quaternion.identity();
    pose.scale.set(...size);
    pose.updateMatrix();
    batch.push({ transform: pose.matrix.clone(), color });
  }

  function strut(start: Point, end: Point, width: number, color = bronze) {
    direction.set(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
    const length = direction.length();
    pose.position.set((start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2);
    pose.quaternion.setFromUnitVectors(up, direction.normalize());
    pose.scale.set(width, length, width);
    pose.updateMatrix();
    iron.push({ transform: pose.matrix.clone(), color });
  }

  // Build four open box-girder piers. Both exterior faces have diagonal lacing.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      block([sx * 3.02, 0.12, sz * 3.02], [1.0, 0.24, 1.0], stone);
      const corners = (section: Point): Point[] => {
        const [y, offset, radius] = section;
        return [
          [1, 1],
          [-1, 1],
          [-1, -1],
          [1, -1],
        ].map(([dx, dz]) => [sx * (offset + dx * radius), y, sz * (offset + dz * radius)]);
      };
      for (let i = 1; i < sections.length; i++) {
        const lower = corners(sections[i - 1]),
          upper = corners(sections[i]);
        const gauge = Math.max(0.029, sections[i - 1][2] * 0.45);
        for (let k = 0; k < 4; k++) {
          strut(lower[k], upper[k], gauge, k === 0 ? edge : bronze);
          strut(upper[k], upper[(k + 1) % 4], gauge * 0.8, dark);
        }
        for (const adjacent of [1, 3]) {
          strut(lower[0], upper[adjacent], gauge * 0.58);
          strut(lower[adjacent], upper[0], gauge * 0.58);
        }
      }
    }

  const face = (side: number, u: number, y: number, depth: number): Point =>
    side < 2 ? [u, y, side === 0 ? depth : -depth] : [side === 2 ? depth : -depth, y, u];

  for (let side = 0; side < 4; side++) {
    // The lower arch follows the receding face of the sloped piers.
    const arch = (u: number): Point => {
      const y = 0.78 + 1.98 * Math.sqrt(Math.max(0, 1 - u * u));
      return face(side, 2.54 * u, y, 3.12 - 0.36 * y);
    };
    for (let i = 0; i < 18; i++) {
      const u = i / 9 - 1;
      strut(arch(u), arch(u + 1 / 9), 0.095, edge);
      if (i >= 3 && i <= 15 && i % 2 === 1) strut(arch(u), face(side, 2.54 * u, 3.08, 2.12), 0.053, dark);
    }

    // Large open X bays over the second deck taper into the summit lantern.
    for (let i = 7; i < sections.length; i++) {
      const [bottom, a] = sections[i - 1],
        [top, b] = sections[i];
      strut(face(side, -a, bottom, a), face(side, b, top, b), 0.056);
      strut(face(side, a, bottom, a), face(side, -b, top, b), 0.056);
      strut(face(side, -b, top, b), face(side, b, top, b), 0.063, edge);
    }
    // Front and side of the second-stage ironwork, with a tall open central bay.
    strut(face(side, -1.91, 3.24, 1.91), face(side, -0.36, 6.16, 1.08), 0.09);
    strut(face(side, 1.91, 3.24, 1.91), face(side, 0.36, 6.16, 1.08), 0.09);
  }

  for (const [y, half, bays] of [
    [3.14, 2.28, 14],
    [6.24, 1.43, 10],
    [14.95, 0.44, 5],
  ]) {
    block([0, y, 0], [half * 2, 0.115, half * 2], dark);
    block([0, y + 0.14, 0], [half * 2.04, 0.055, half * 2.04], edge);
    block([0, y + 0.2, 0], [half * 1.69, 0.16, half * 1.69], '#584f43');
    for (let side = 0; side < 4; side++) {
      strut(face(side, -half, y + 0.37, half), face(side, half, y + 0.37, half), 0.041, edge);
      for (let i = 0; i <= bays; i++) {
        const u = ((2 * i) / bays - 1) * half;
        strut(face(side, u, y + 0.13, half), face(side, u, y + 0.37, half), 0.03);
        if (i < bays)
          block(
            face(side, u + half / bays, y + 0.21, half * 0.85),
            side < 2 ? [half / bays, 0.058, 0.025] : [0.025, 0.058, half / bays],
            '#e7ac63',
            lights,
          );
      }
    }
  }

  block([0, 15.43, 0], [0.53, 0.47, 0.53], bronze);
  block([0, 15.7, 0], [0.65, 0.09, 0.65], edge);
  for (const x of [-0.24, 0.24])
    for (const z of [-0.24, 0.24]) {
      strut([x, 15.72, z], [x * 0.26, 16.61, z * 0.26], 0.055, bronze);
    }
  strut([0, 16.28, 0], [0, 17.58, 0], 0.084, edge);
  strut([0, 17.57, 0], [0, 17.94, 0], 0.038, edge);
  block([0, 17.96, 0], [0.065, 0.08, 0.065], '#ffe5af', lights);

  function mount(name: string, members: Member[], material: THREE.Material) {
    const mesh = new THREE.InstancedMesh(box, material, members.length);
    mesh.name = name;
    const color = new THREE.Color();
    members.forEach((member, index) => {
      mesh.setMatrixAt(index, member.transform);
      mesh.setColorAt(index, color.set(member.color));
    });
    mesh.computeBoundingSphere();
    tower.add(mesh);
  }
  mount(
    'Riveted iron piers and observation decks',
    iron,
    new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0.32 }),
  );
  mount('Gallery windows and summit beacon', lights, new THREE.MeshBasicMaterial({ toneMapped: false }));
  return tower;
}
