import * as THREE from 'three';

type Vec = [number, number, number];

/** Shore-mounted cheenavala: a timber fulcrum, balanced boom, four bowed
 * bamboo arms, suspended square net, coir lines, and stone counterweights. */
export function createChineseFishingNets() {
  const group = new THREE.Group();
  group.name = 'Chinese fishing nets along the backwaters';
  group.userData.ownsNightPalette = true;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Map<THREE.Material, { day: THREE.Color; night: THREE.Color }>();
  const rigs: { root: THREE.Group; boom: THREE.Group; phase: number; raisedAt: number; ropes: THREE.LineSegments; ropePositions: Float32Array }[] = [];
  let clock = 0, disposed = false;
  const v = (p: Vec) => new THREE.Vector3(...p);
  function paint(hex: string, opacity = 1) {
    const material = new THREE.MeshBasicMaterial({ color: hex, side: THREE.DoubleSide, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
    const day = material.color.clone();
    materials.set(material, { day, night: day.clone().multiply(new THREE.Color('#6e86a7')).multiplyScalar(.55) });
    return material;
  }
  function linePaint(hex: string, opacity: number) {
    const material = new THREE.LineBasicMaterial({ color: hex, transparent: true, opacity, depthWrite: false });
    const day = material.color.clone();
    materials.set(material, { day, night: day.clone().multiply(new THREE.Color('#8396b5')).multiplyScalar(.65) });
    return material;
  }
  function geometry<T extends THREE.BufferGeometry>(item: T) { geometries.add(item); return item; }
  const wood = paint('#705337');
  const woodLight = paint('#ad8757');
  const bamboo = paint('#b69b66');
  const bambooHighlight = paint('#ddc58b');
  const coir = paint('#87704d');
  const stone = paint('#777265');
  const netLine = linePaint('#56685b', .51);
  const ropeLine = linePaint('#8a7958', .8);
  const netFill = paint('#8caa92', .055);
  const waterShadow = paint('#244b41', .11);

  function mark<T extends THREE.Object3D>(object: T, index: number): T {
    object.userData.fishingNet = true;
    object.userData.fishingNetIndex = index;
    return object;
  }
  function rod(parent: THREE.Group, a: Vec, b: Vec, radius: number, material: THREE.Material, index: number) {
    const start = v(a), end = v(b), delta = end.clone().sub(start);
    const mesh = mark(new THREE.Mesh(geometry(new THREE.CylinderGeometry(radius * .78, radius, delta.length(), 6)), material), index);
    mesh.position.copy(start).add(end).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    parent.add(mesh);
    return mesh;
  }
  function curve(parent: THREE.Group, points: Vec[], radius: number, material: THREE.Material, index: number) {
    const path = new THREE.CatmullRomCurve3(points.map(v));
    const mesh = mark(new THREE.Mesh(geometry(new THREE.TubeGeometry(path, 18, radius, 4, false)), material), index);
    parent.add(mesh);
    return mesh;
  }
  const netPoint = (u: number, w: number) => new THREE.Vector3(
    96 + (u - .5) * 83 + (w - .5) * 40,
    -77 + (u - .5) * 20 - (w - .5) * 25 - Math.sin(Math.PI * u) * Math.sin(Math.PI * w) * 16,
    3 + (w - .5) * 22,
  );

  for (let index = 0; index < 2; index++) {
    const root = mark(new THREE.Group(), index);
    root.name = index ? 'Right-bank fishing net' : 'Left-bank fishing net';
    const boom = mark(new THREE.Group(), index);
    boom.position.set(0, 49, 2);
    root.add(boom);
    group.add(root);
    // Small shore platform on piles; a dark contact footprint anchors it.
    const shadow = mark(new THREE.Mesh(geometry(new THREE.CircleGeometry(1, 24)), waterShadow), index);
    shadow.scale.set(44, 5, 1); shadow.position.set(7, -13, -1); root.add(shadow);
    for (const x of [-28, -12, 5, 22]) {
      rod(root, [x, -13, 0], [x + 1, 8, 0], 1.8, wood, index);
      rod(root, [x, -11, -13], [x, 9, -13], 1.5, wood, index);
    }
    for (let y = 0; y < 6; y++) rod(root, [-34, y * 1.6, y * -2.5], [31, y * 1.6, y * -2.5], 1.55, y % 2 ? woodLight : wood, index);
    // Strong asymmetric A-frame and cross-lashed fulcrum.
    rod(root, [-26, 5, 1], [0, 52, 1], 2.9, wood, index);
    rod(root, [25, 5, 1], [0, 52, 1], 2.7, woodLight, index);
    rod(root, [-5, 7, -17], [0, 52, 1], 2.2, wood, index);
    rod(root, [-17, 22, 2], [16, 22, 2], 1.25, bamboo, index);
    rod(root, [-5, 51, -5], [5, 51, 9], 2.3, woodLight, index);
    for (let i = 0; i < 4; i++) rod(root, [-4, 45 + i * 1.9, 4.4], [4, 45 + i * 1.9, 4.4], .5, coir, index);

    // A long lever with a weighted landward tail. Bamboo arms bow to the
    // four corners of the square net rather than forming a solid triangle.
    rod(boom, [-47, -21, 0], [76, 17, 0], 1.95, wood, index);
    rod(boom, [-44, -19, 1.5], [76, 18, 1.5], .55, bambooHighlight, index);
    const corners = [netPoint(0, 0), netPoint(1, 0), netPoint(1, 1), netPoint(0, 1)];
    corners.forEach((point, corner) => {
      curve(boom, [[40, 6, 0], [82, 14, point.z * .45], [point.x, point.y + 25, point.z], [point.x, point.y, point.z]], corner % 2 ? .8 : 1.05, bamboo, index);
      rod(boom, [point.x, point.y, point.z], [76, 17, 0], .28, coir, index);
    });
    for (let i = 0; i < 4; i++) {
      const x = -43 + i * 9;
      rod(boom, [x, -20 + i * 2.8, 0], [x - 2, -43 + i * 2.8, 1], .45, coir, index);
      const weight = mark(new THREE.Mesh(geometry(new THREE.DodecahedronGeometry(3.5 - i * .28, 0)), stone), index);
      weight.scale.set(1, 1.3, .7); weight.position.set(x - 2, -44 + i * 2.8, 1); boom.add(weight);
    }

    const positions: number[] = [], netPositions: number[] = [], netIndices: number[] = [];
    const steps = 16;
    // Thin crossed mesh lines, sagging at the centre of an actual square net.
    for (let a = 0; a <= steps; a++) {
      for (let b = 0; b < steps; b++) {
        positions.push(...netPoint(a / steps, b / steps).toArray(), ...netPoint(a / steps, (b + 1) / steps).toArray());
        positions.push(...netPoint(b / steps, a / steps).toArray(), ...netPoint((b + 1) / steps, a / steps).toArray());
      }
    }
    for (let a = 0; a <= steps; a++) for (let b = 0; b <= steps; b++) netPositions.push(...netPoint(a / steps, b / steps).toArray());
    for (let a = 0; a < steps; a++) for (let b = 0; b < steps; b++) {
      const i = a * (steps + 1) + b;
      netIndices.push(i, i + 1, i + steps + 1, i + 1, i + steps + 2, i + steps + 1);
    }
    const web = geometry(new THREE.BufferGeometry());
    web.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    boom.add(mark(new THREE.LineSegments(web, netLine), index));
    const cloth = geometry(new THREE.BufferGeometry());
    cloth.setAttribute('position', new THREE.Float32BufferAttribute(netPositions, 3)); cloth.setIndex(netIndices);
    cloth.computeVertexNormals();
    boom.add(mark(new THREE.Mesh(cloth, netFill), index));
    for (let c = 0; c < 4; c++) {
      const edge: Vec[] = Array.from({ length: 9 }, (_, j) => {
        const t = j / 8;
        const p = c === 0 ? netPoint(t, 0) : c === 1 ? netPoint(1, t) : c === 2 ? netPoint(1 - t, 1) : netPoint(0, 1 - t);
        return p.toArray() as Vec;
      });
      curve(boom, edge, .38, coir, index);
    }
    // The operating lines run from the moving lever down to the fixed deck.
    const ropePositions = new Float32Array(12);
    const ropeGeometry = geometry(new THREE.BufferGeometry()); ropeGeometry.setAttribute('position', new THREE.BufferAttribute(ropePositions, 3));
    const ropes = mark(new THREE.LineSegments(ropeGeometry, ropeLine), index); ropes.frustumCulled = false; root.add(ropes);
    rigs.push({ root, boom, phase: index * 2.1, raisedAt: -100, ropes, ropePositions });
  }

  function resize(viewWidth: number) {
    const width = Math.max(240, Number.isFinite(viewWidth) ? viewWidth : 1600);
    const scale = THREE.MathUtils.clamp(width / 1250, .58, .94);
    const anchor = Math.min(574, Math.max(115, width / 2 - 62));
    rigs.forEach(({ root }, index) => {
      root.position.set(index ? anchor : -anchor, index ? -173 : -181, 4);
      root.scale.set(index ? -scale * .89 : scale, index ? scale * .89 : scale, scale);
    });
  }
  function update(time: number, night: number, reducedMotion: boolean) {
    if (disposed) return;
    clock = time;
    const dark = THREE.MathUtils.clamp(night, 0, 1);
    for (const [material, colors] of materials) {
      (material as THREE.MeshBasicMaterial | THREE.LineBasicMaterial).color.copy(colors.day).lerp(colors.night, dark);
    }
    for (const rig of rigs) {
      const age = time - rig.raisedAt;
      const lift = age >= 0 && age < 8 ? Math.sin(Math.PI * age / 8) ** 2 : 0;
      const idle = reducedMotion ? 0 : Math.sin(time * .22 + rig.phase) * .012;
      rig.boom.rotation.z = -.045 + idle + lift * (reducedMotion ? .07 : .2);
      rig.boom.updateMatrix();
      const endpoints = [new THREE.Vector3(-40, -20, 1), new THREE.Vector3(36, 5, 1)];
      const anchors = [new THREE.Vector3(-25, 9, 3), new THREE.Vector3(14, 9, 3)];
      for (let i = 0; i < 2; i++) {
        endpoints[i]!.applyMatrix4(rig.boom.matrix).toArray(rig.ropePositions, i * 6);
        anchors[i]!.toArray(rig.ropePositions, i * 6 + 3);
      }
      rig.ropes.geometry.attributes.position!.needsUpdate = true;
    }
  }
  resize(1600); update(0, 0, false);
  return {
    group, resize, update,
    lift(index = 0) { if (!disposed) rigs[Math.max(0, Math.min(1, Math.round(index)))]!.raisedAt = clock; },
    destroy() {
      if (disposed) return;
      disposed = true; group.removeFromParent();
      geometries.forEach(item => item.dispose()); materials.forEach((_, item) => item.dispose());
      geometries.clear(); materials.clear(); group.clear();
    },
  };
}
