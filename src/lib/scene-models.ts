import * as THREE from 'three';

// The scene uses design pixels. +Y is up, +Z faces the viewer.
// Flat colors keep the little diorama legible against the painted landscape.
const paint = (color: string) => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
const palette = {
  timber: '#514638', timberLight: '#756044', timberEdge: '#a18753',
  bamboo: '#c5a367', bambooLight: '#e4c98a', bambooShade: '#a68851',
  glass: '#355f5a', glassLight: '#72968a', cream: '#f2ead0',
  aqua: '#4d9f9c', aquaLight: '#86c0b3', ochre: '#d5ad56',
};

function box(group: THREE.Group, size: [number, number, number], position: [number, number, number], material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  group.add(mesh);
  return mesh;
}

function extrusion(group: THREE.Group, shape: THREE.Shape, depth: number, z: number, material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: false, curveSegments: 10,
  }), material);
  mesh.position.z = z;
  group.add(mesh);
  return mesh;
}

function stroke(group: THREE.Group, points: THREE.Vector3[], radius: number, material: THREE.Material, smooth = true) {
  const curve = smooth ? new THREE.CatmullRomCurve3(points) : new THREE.LineCurve3(points[0], points[1]);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, smooth ? Math.max(12, points.length * 2) : 1, radius, 4, false), material);
  group.add(mesh);
  return mesh;
}

function arch(x: number, y: number, width: number, height: number) {
  const shape = new THREE.Shape();
  shape.moveTo(x - width / 2, y);
  shape.lineTo(x + width / 2, y);
  shape.lineTo(x + width / 2, y + height - width / 2);
  shape.absarc(x, y + height - width / 2, width / 2, 0, Math.PI, false);
  shape.lineTo(x - width / 2, y);
  return shape;
}

function roundedRect(x: number, y: number, width: number, height: number, radius: number) {
  const shape = new THREE.Shape();
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

export function createHouseboat(): THREE.Group {
  const boat = new THREE.Group();
  boat.name = 'Kerala kettuvallam';
  const timber = paint(palette.timber);
  const edge = paint(palette.timberEdge);
  const bamboo = paint(palette.bamboo);
  const light = paint(palette.bambooLight);
  const shade = paint(palette.bambooShade);
  const darkWindow = paint(palette.glass);
  darkWindow.userData.nightGlow = true;

  // A long canoe hull with the upward-sweeping bow and stern of a kettuvallam.
  const hull = new THREE.Shape();
  hull.moveTo(-111, 20);
  hull.bezierCurveTo(-106, -1, -94, -10, -73, -10);
  hull.lineTo(75, -10);
  hull.bezierCurveTo(96, -9, 106, 3, 111, 23);
  hull.lineTo(102, 20);
  hull.quadraticCurveTo(96, 12, 83, 11);
  hull.lineTo(-82, 11);
  hull.quadraticCurveTo(-98, 12, -104, 21);
  hull.closePath();
  extrusion(boat, hull, 49, -24.5, timber);
  const rim = [new THREE.Vector3(-108, 19, 26), new THREE.Vector3(-84, 11, 26), new THREE.Vector3(0, 10, 26), new THREE.Vector3(85, 12, 26), new THREE.Vector3(108, 22, 26)];
  stroke(boat, rim, 1.1, edge);
  stroke(boat, [new THREE.Vector3(-96, 1, 25.4), new THREE.Vector3(-75, -5, 25.4), new THREE.Vector3(73, -5, 25.4), new THREE.Vector3(99, 7, 25.4)], .45, paint('#95805b'));
  box(boat, [184, 3, 51], [0, 13, 0], edge);

  // The open veranda on the left balances the enclosed bamboo cabin.
  box(boat, [132, 39, 43], [14, 35, -1], bamboo);
  box(boat, [129, 2.2, 1.2], [14, 17.3, 21.1], light);
  const slats = new THREE.InstancedMesh(new THREE.BoxGeometry(.65, 36, .7), shade, 43);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < 43; i++) {
    matrix.makeTranslation(-49 + i * 3, 35.5, 21.1);
    slats.setMatrixAt(i, matrix);
  }
  slats.instanceMatrix.needsUpdate = true;
  boat.add(slats);
  for (const x of [-31, 0, 31, 62]) {
    extrusion(boat, arch(x, 20, 20, 32), 1.5, 21.6, shade);
    extrusion(boat, arch(x, 21, 15.5, 28), .9, 23.2, darkWindow);
    box(boat, [1.4, 25, 1], [x, 34, 24.3], light);
    box(boat, [14.6, 1.2, 1], [x, 31, 24.3], shade);
    box(boat, [3.3, 18, .5], [x - 4.4, 33, 24], paint('#537a6b'));
  }

  // A real barrel roof, curved across the depth; alternating panels suggest woven palm.
  const roofPositions: number[] = [];
  const roofColors: number[] = [];
  const roofPalette = [new THREE.Color('#d9b97a'), new THREE.Color('#ddbe80'), new THREE.Color('#d2ae6d')];
  const xSegments = 16;
  const arcSegments = 12;
  // The longitudinal bow matters as much as the barrel section: from the almost
  // straight-on camera, a constant-height barrel reads as a rectangular box.
  // Dip the rounded ends and lift the middle, keeping the cabin below the eaves.
  const point = (x: number, a: number) => {
    const end = (x + 4) / 84;
    const arch = Math.sqrt(Math.max(.2, 1 - end * end * .8));
    const lift = Math.sin(a);
    return new THREE.Vector3(
      x - end * lift * 5,
      55 - end * end * 3 + lift * 29 * arch,
      Math.cos(a) * 28,
    );
  };
  for (let ix = 0; ix < xSegments; ix++) {
    const x0 = -88 + ix * 10.5;
    const x1 = x0 + 10.5;
    for (let j = 0; j < arcSegments; j++) {
      const a = j * Math.PI / arcSegments;
      const b = (j + 1) * Math.PI / arcSegments;
      const corners = [point(x0, a), point(x1, a), point(x1, b), point(x0, a), point(x1, b), point(x0, b)];
      const color = roofPalette[(ix + (j > 7 ? 2 : 0)) % roofPalette.length];
      for (const p of corners) { roofPositions.push(p.x, p.y, p.z); roofColors.push(color.r, color.g, color.b); }
    }
  }
  const roofGeometry = new THREE.BufferGeometry();
  roofGeometry.setAttribute('position', new THREE.Float32BufferAttribute(roofPositions, 3));
  roofGeometry.setAttribute('color', new THREE.Float32BufferAttribute(roofColors, 3));
  roofGeometry.computeVertexNormals();
  boat.add(new THREE.Mesh(roofGeometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  for (let x = -88; x <= 80; x += 21) {
    const points = Array.from({ length: 13 }, (_, i) => point(x, i * Math.PI / 12));
    stroke(boat, points, .65, shade);
  }
  stroke(boat, Array.from({ length: 17 }, (_, i) => point(-88 + i * 10.5, 0)), 1.4, light);
  // Woven horizontal courses on the front of the rounded canopy.
  for (const angle of [.17, .33, .5, .68, .88, 1.12]) {
    const course = Array.from({ length: 17 }, (_, i) => {
      const p = point(-88 + i * 10.5, angle);
      p.z += .25;
      return p;
    });
    stroke(boat, course, .3, light);
  }
  for (const x of [-84, -56]) box(boat, [2, 40, 2], [x, 33.5, 22.5], timber);
  box(boat, [25, 5, 14], [-70, 22, 1], paint('#9b8159'));
  box(boat, [27, 2, 16], [-70, 25.5, 1], light);
  for (const x of [-98, -83, -68, -53, 86, 100]) box(boat, [1.6, 14, 1.8], [x, 21, 26.2], edge);
  stroke(boat, [new THREE.Vector3(-101, 28, 27), new THREE.Vector3(-51, 28, 27)], .85, light, false);
  stroke(boat, [new THREE.Vector3(82, 28, 27), new THREE.Vector3(102, 28, 27)], .85, light, false);
  for (const x of [-58, 47, 86]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.1, 1.1, 5, 12), paint('#dfc88f'));
    ring.position.set(x, 9, 27.8);
    boat.add(ring);
    box(boat, [.7, 7, .8], [x, 16, 27.5], light);
  }
  return boat;
}

export function createMetro(): THREE.Group {
  const train = new THREE.Group();
  train.name = 'Kochi inspired metro';
  const cream = paint(palette.cream);
  const teal = paint(palette.aqua);
  const glass = paint('#345e63');
  glass.userData.nightGlow = true;
  const trim = paint('#6e8b80');
  const gold = paint(palette.ochre);
  const undercarriage = paint('#526260');
  for (let index = 0; index < 3; index++) {
    const car = new THREE.Group();
    car.position.x = (index - 1) * 101;
    train.add(car);
    extrusion(car, roundedRect(-48, 5, 96, 23, 5), 20, -10, cream);
    extrusion(car, roundedRect(-47.8, 5, 95.6, 8.5, 3.2), .6, 10.1, teal);
    box(car, [87, 1.1, .8], [0, 13.5, 10.5], gold);
    box(car, [80, 2, 13], [0, 28, -.5], paint('#c3d0bd'));
    box(car, [84, 2.8, 15], [0, 4.3, -.5], undercarriage);
    for (const x of [-27, 27]) {
      box(car, [16, 3.5, 15], [x, 3, 0], undercarriage);
      for (const offset of [-4.8, 4.8]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 2, 10), undercarriage);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(x + offset, 2.5, 9.5);
        car.add(wheel);
      }
    }
    for (const x of [-33, -18, 18, 33]) {
      extrusion(car, roundedRect(x - 5.7, 16, 11.4, 8.8, 1.2), .65, 10.2, glass);
      box(car, [7.8, .7, .3], [x - .4, 23.5, 11], paint('#8bb7b0'));
    }
    extrusion(car, roundedRect(-7.5, 7.2, 15, 18.1, .6), .4, 10.8, trim);
    extrusion(car, roundedRect(-6.7, 7.8, 13.4, 16.8, .3), .4, 11.3, paint('#d4e0cc'));
    box(car, [.65, 16.8, .5], [0, 16.2, 12], trim);
    box(car, [4.8, 7.8, .5], [-3.5, 19.7, 12], glass);
    box(car, [4.8, 7.8, .5], [3.5, 19.7, 12], glass);
    if (index !== 1) {
      const outer = index === 0 ? -1 : 1;
      extrusion(car, roundedRect(outer < 0 ? -47 : 40.2, 15.8, 6.8, 8.5, 1.7), .9, 10.4, glass);
      box(car, [3.6, 1.8, .7], [outer * 44, 10.5, 11.4], paint('#f8eb9d'));
    }
    // Tiny wayfinding stripe and abstract metro emblem, without fabricated text.
    box(car, [7, .7, .6], [-25, 9.3, 11.1], cream);
    const emblem = new THREE.Mesh(new THREE.CircleGeometry(1.1, 12), cream);
    emblem.position.set(-31, 9.3, 11.5);
    car.add(emblem);
  }
  for (const x of [-50.5, 50.5]) {
    box(train, [6, 17.5, 15], [x, 15.5, 0], paint('#6f7b70'));
    for (const dx of [-1.6, 0, 1.6]) box(train, [.55, 16.5, .8], [x + dx, 15.5, 8.1], paint('#9da897'));
  }
  return train;
}

export function createViaduct(): THREE.Group {
  const bridge = new THREE.Group();
  bridge.name = 'Elevated metro viaduct';
  const concrete = paint('#d4ceb4');
  const shade = paint('#a5b29d');
  const sunlit = paint('#ede4c5');
  box(bridge, [2000, 8, 30], [0, -4, 0], concrete);
  box(bridge, [2000, 2, 3], [0, -1, 16], sunlit);
  box(bridge, [2000, 1.3, 2], [0, 1, 8], paint('#6f8075'));
  box(bridge, [2000, 1.3, 2], [0, 1, -8], paint('#829083'));
  box(bridge, [2000, 1.2, .8], [0, -8.2, 15.3], shade);
  for (let x = -960; x <= 960; x += 160) {
    box(bridge, [13, 55, 17], [x, -42.5, -1], concrete);
    box(bridge, [3.5, 55, 1], [x + 4.7, -42.5, 8], shade);
    const capital = new THREE.Shape();
    capital.moveTo(-20, -8);
    capital.lineTo(20, -8);
    capital.lineTo(7, -19);
    capital.lineTo(-7, -19);
    capital.closePath();
    const cap = extrusion(bridge, capital, 21, -11, concrete);
    cap.position.x = x;
    box(bridge, [23, 3, 23], [x, -68.5, -1], shade);
  }
  return bridge;
}

export function createLotus(): THREE.Group {
  const lotus = new THREE.Group();
  lotus.name = 'Floating lotus';
  const leaf = new THREE.Shape();
  leaf.moveTo(.2, .1);
  leaf.lineTo(6.8, 1.7);
  leaf.bezierCurveTo(5.1, 4.8, -4.5, 4.3, -6.5, 1);
  leaf.bezierCurveTo(-9, -3.3, 2.8, -5.6, 7, -1.2);
  leaf.closePath();
  extrusion(lotus, leaf, .5, 0, paint('#5b8966'));
  stroke(lotus, [new THREE.Vector3(-5, -.6, .7), new THREE.Vector3(0, .2, .7)], .17, paint('#96ae71'), false);
  stroke(lotus, [new THREE.Vector3(-1.5, -2.8, .7), new THREE.Vector3(0, .2, .7)], .14, paint('#96ae71'), false);
  for (const [x, tilt, color] of [[1.5, -.55, '#d9968e'], [4.5, .55, '#e4a79c'], [3, 0, '#f0c4a9']] as const) {
    const petal = new THREE.Shape();
    petal.moveTo(0, 0);
    petal.bezierCurveTo(-3.2, 3, -1, 5.5, 0, 7);
    petal.bezierCurveTo(1, 5.5, 3.2, 3, 0, 0);
    const mesh = extrusion(lotus, petal, .4, 1, paint(color));
    mesh.position.x = x;
    mesh.position.y = 0;
    mesh.rotation.z = tilt;
  }
  return lotus;
}
