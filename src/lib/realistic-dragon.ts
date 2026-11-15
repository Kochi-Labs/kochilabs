import * as THREE from 'three';

/** A lit, articulated dragon; all geometry stays bounded and belongs to this rig. */
export function createRealisticDragon() {
  const group = new THREE.Group();
  group.name = 'Sculpted bronze dragon';
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const keep = <T extends THREE.BufferGeometry>(g: T) => { geometries.add(g); return g; };
  const material = (color: string, roughness = .7, metalness = .12) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    materials.add(m); return m;
  };
  const skin = material('#716448', .72, .16);
  const ridge = material('#403e32', .77, .12);
  const belly = material('#aa9570', .76, .06);
  const horn = material('#d0bd90', .6, .08);
  const black = material('#171b17', .38, .02);
  const mouthInterior = material('#281a17', .87, 0);
  const membrane = material('#77543b', .9, .03);
  membrane.side = THREE.DoubleSide;
  const eye = material('#d6a43c', .24, .1);
  eye.emissive.set('#9b4c08'); eye.emissiveIntensity = .38;
  const throat = material('#b65816', .5, .08);
  throat.emissive.set('#ff7617'); throat.emissiveIntensity = 0;

  // Overlapping scale edges modulate the lit material, not a flat painted sprite.
  skin.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vScaleUv;');
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvScaleUv = uv;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vScaleUv;
      float scaleRelief(vec2 p) {
        vec2 q = p * vec2(23.0, 17.0);
        q.x += mod(floor(q.y), 2.0) * .5;
        vec2 f = fract(q) - .5;
        float edge = smoothstep(.34, .48, length(vec2(f.x, f.y * 1.25 + .12)));
        return edge * .16 + sin(q.x * 5.0 + q.y * 7.0) * .018;
      }`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\nfloat scaleDepth = scaleRelief(vScaleUv); diffuseColor.rgb *= .92 - scaleDepth;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(normal - vec3(dFdx(scaleDepth), dFdy(scaleDepth), 0.0) * 1.8);');
  };
  skin.customProgramCacheKey = () => 'dragon-scales-v1';

  const sphere = keep(new THREE.SphereGeometry(1, 20, 12));
  const smallSphere = keep(new THREE.SphereGeometry(1, 12, 8));
  const coneGeometry = keep(new THREE.ConeGeometry(1, 1, 9));
  function ellipsoid(parent: THREE.Object3D, mat: THREE.Material, position: number[], scale: number[], small = false) {
    const mesh = new THREE.Mesh(small ? smallSphere : sphere, mat);
    mesh.position.set(position[0]!, position[1]!, position[2]!);
    mesh.scale.set(scale[0]!, scale[1]!, scale[2]!); parent.add(mesh); return mesh;
  }
  function spike(parent: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, radius: number, mat: THREE.Material = horn) {
    const mesh = new THREE.Mesh(coneGeometry, mat);
    const direction = to.clone().sub(from);
    mesh.position.copy(from).addScaledVector(direction, .5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    mesh.scale.set(radius, direction.length(), radius); parent.add(mesh); return mesh;
  }
  function tendon(parent: THREE.Object3D, points: THREE.Vector3[], radius: number, mat: THREE.Material) {
    const geometry = keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 14, radius, 7, false));
    const mesh = new THREE.Mesh(geometry, mat); parent.add(mesh); return mesh;
  }
  /** A tapered curved volume with genuine normals and UVs for the scales. */
  function taper(parent: THREE.Object3D, points: THREE.Vector3[], radiusStart: number, radiusEnd: number, mat: THREE.Material, segments = 30) {
    const curve = new THREE.CatmullRomCurve3(points);
    const frames = curve.computeFrenetFrames(segments, false), vertices: number[] = [], uvs: number[] = [], indices: number[] = [];
    const sides = 12;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments, p = curve.getPoint(t), r = THREE.MathUtils.lerp(radiusStart, radiusEnd, t);
      for (let j = 0; j <= sides; j++) {
        const a = j / sides * Math.PI * 2;
        const q = p.clone().addScaledVector(frames.normals[i]!, Math.cos(a) * r).addScaledVector(frames.binormals[i]!, Math.sin(a) * r * .8);
        vertices.push(q.x, q.y, q.z); uvs.push(j / sides, t);
        if (i < segments && j < sides) { const n = i * (sides + 1) + j; indices.push(n, n + 1, n + sides + 1, n + 1, n + sides + 2, n + sides + 1); }
      }
    }
    const geometry = keep(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, mat); parent.add(mesh); return mesh;
  }
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const body = new THREE.Group(); group.add(body);
  ellipsoid(body, skin, [-2, 1, 0], [12, 7, 5.3]);
  ellipsoid(body, belly, [1, -2.1, 3.7], [8.2, 3.9, 1.6]);
  ellipsoid(body, skin, [7, 4, 0], [6.7, 6.2, 5]);
  taper(body, [V(7, 4, 0), V(11, 9, 0), V(15, 15, 0), V(21, 17, 0)], 4.8, 3.1, skin);
  // Segmented throat plates wrap the front of the neck.
  for (let i = 0; i < 7; i++) {
    const p = i / 6;
    const plate = ellipsoid(body, belly, [10 + p * 10, 5 + p * 10, 2.8], [2.3, .72, 1.1], true);
    plate.rotation.z = -.55;
  }
  const tail = new THREE.Group(); tail.position.set(-10, 0, 0); body.add(tail);
  taper(tail, [V(0, 0, 0), V(-10, -1, 0), V(-21, 3, -1), V(-31, 11, -2), V(-35, 16, -3)], 4.3, .18, skin, 40);
  for (let i = 0; i < 10; i++) {
    const x = -13 + i * 3.2, y = 6.5 + Math.sin(i / 9 * Math.PI) * 4;
    spike(body, V(x, y, 0), V(x - 2, y + 3.5 - i * .16, 0), 1.1 - i * .05, ridge);
  }
  for (let i = 0; i < 8; i++) {
    const x = -5 + i * 3;
    const y = i < 4 ? 7.6 : 9 + (i - 4) * 2;
    spike(body, V(x, y, -.1), V(x - 1.9, y + 3.3, -.1), .95, ridge);
  }

  const head = new THREE.Group(); head.position.set(21, 17, 0); body.add(head);
  ellipsoid(head, skin, [1.2, .8, 0], [6.4, 4, 3.8]);
  ellipsoid(head, skin, [6.2, -.3, 0], [5.8, 2.3, 2.9]);
  ellipsoid(head, ridge, [6.5, -.95, 2.6], [4.9, .5, .55], true);
  ellipsoid(head, black, [10.6, .2, 1.5], [.72, .52, .45], true);
  ellipsoid(head, black, [10.6, .2, -1.5], [.72, .52, .45], true);
  for (const side of [-1, 1]) {
    ellipsoid(head, ridge, [1.8, 2.1, side * 3.25], [2.4, 1.15, .75], true).rotation.z = -.2;
    ellipsoid(head, eye, [2.9, 1.6, side * 3.75], [1.03, .8, .28], true);
    ellipsoid(head, black, [3.1, 1.6, side * 3.97], [.17, .65, .12], true);
    spike(head, V(-.2, 3.8, side * 2.3), V(-6.2, 10, side * 4.8), 1.55);
    spike(head, V(-2.4, 1.4, side * 3.2), V(-7.2, 4.4, side * 6.1), 1.15, ridge);
  }
  const jaw = new THREE.Group(); jaw.position.set(-1, -1.6, 0); head.add(jaw);
  ellipsoid(jaw, skin, [6.2, -.7, 0], [6.7, 1.5, 2.7]);
  ellipsoid(jaw, mouthInterior, [6.6, .25, 0], [5.8, .38, 2.2]);
  ellipsoid(head, mouthInterior, [6.1, -1.7, 0], [5.2, .55, 2.3]);
  ellipsoid(head, throat, [2.1, -1.8, 1], [1.9, 1.4, 1.9], true);
  for (let i = 0; i < 6; i++) for (const side of [-1, 1]) {
    const x = 2.6 + i * 1.43;
    spike(head, V(x, -1.4, side * 2), V(x - .25, -3.05 + i * .09, side * 2), .33);
    spike(jaw, V(x + 1, .2, side * 1.9), V(x + .7, 1.3, side * 1.9), .26);
  }
  const mouth = new THREE.Object3D(); mouth.name = 'Dragon mouth fire source'; mouth.position.set(12, -2, 1); head.add(mouth);

  const legs: THREE.Group[] = [];
  for (const [x, side] of [[-8, -1], [5, -1], [-8, 1], [5, 1]]) {
    const leg = new THREE.Group(); leg.position.set(x!, -2, side! * 3.5); body.add(leg); legs.push(leg);
    ellipsoid(leg, skin, [0, -2, 0], [3.2, 4.5, 2.3]);
    tendon(leg, [V(0, -2, 0), V(3, -6, .4), V(1.7, -9, 1)], 1.3, skin);
    ellipsoid(leg, skin, [3, -9, 1], [2.4, 1, 1.7], true);
    for (let i = 0; i < 3; i++) spike(leg, V(4, -9, i * 1.1), V(6.1, -9.8, i * 1.1), .38);
  }

  const wings: { root: THREE.Group; side: number }[] = [];
  for (const side of [-1, 1]) {
    const root = new THREE.Group(); root.position.set(0, 5.5, side * 3.5); body.add(root);
    // Different depth and tilt give two clearly separate wings, with sculpted
    // ribs pulling on a scalloped, slightly cupped membrane.
    const span = side > 0 ? 1 : .83;
    const tips = [V(-8, 30, side * 9), V(-23, 43, side * 12), V(-36, 29, side * 17), V(-33, 13, side * 19), V(-24, 2, side * 14)];
    const elbow = V(-6, 15, side * 6), wrist = V(-10, 26, side * 8);
    tendon(root, [V(0, 0, 0), elbow, wrist, tips[1]!], 1.1, skin);
    for (let i = 1; i < tips.length; i++) tendon(root, [wrist, wrist.clone().lerp(tips[i]!, .5).add(V(0, 1.5, 0)), tips[i]!], .45, horn);
    for (let i = 0; i < tips.length - 1; i++) {
      const a = tips[i]!, b = tips[i + 1]!, positions: number[] = [], uvs: number[] = [], indices: number[] = [];
      const rows = 9, cols = 10;
      for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
        const u = c / cols, v = r / rows;
        const edge = a.clone().lerp(b, u).lerp(wrist, Math.sin(u * Math.PI) * .22);
        const p = wrist.clone().lerp(edge, v);
        p.z += Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * side * 3;
        positions.push(p.x, p.y, p.z); uvs.push(u, v);
        if (r < rows && c < cols) { const n = r * (cols + 1) + c; indices.push(n, n + 1, n + cols + 1, n + 1, n + cols + 2, n + cols + 1); }
      }
      const geometry = keep(new THREE.BufferGeometry()); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
      root.add(new THREE.Mesh(geometry, membrane));
    }
    // The broad inner patagium joins the wing fingers back to the flank.
    const inner = keep(new THREE.BufferGeometry());
    inner.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0, -10, 26, side * 8, -17, 10, side * 10,
      0, 0, 0, -17, 10, side * 10, -24, 2, side * 14,
      0, 0, 0, -24, 2, side * 14, -9, -2, side * 2,
    ], 3));
    inner.computeVertexNormals(); root.add(new THREE.Mesh(inner, membrane));
    root.scale.setScalar(span); root.rotation.y = side > 0 ? -.24 : .5;
    wings.push({ root, side });
  }
  const ambient = new THREE.HemisphereLight('#e4edff', '#32291d', 2.5); group.add(ambient);
  const key = new THREE.DirectionalLight('#fff0cf', 3.3); key.position.set(-30, 65, 100); group.add(key); group.add(key.target);
  const rim = new THREE.DirectionalLight('#a2b9db', 1.5); rim.position.set(15, 25, -80); group.add(rim); group.add(rim.target);
  const flameLight = new THREE.PointLight('#ff8c2e', 0, 80, 1.5); flameLight.position.set(30, 16, 12); group.add(flameLight);
  let destroyed = false;
  return {
    group, mouth,
    update(time: number, flight: number, breathing: number, night: number, reducedMotion: boolean) {
      if (destroyed) return;
      const t = Number.isFinite(time) ? time : 0, f = THREE.MathUtils.clamp(flight, 0, 1), b = THREE.MathUtils.clamp(breathing, 0, 1), n = THREE.MathUtils.clamp(night, 0, 1);
      for (const { root, side } of wings) {
        root.rotation.x = reducedMotion ? side * .2 : side * (.18 + Math.sin(t * 4.1) * .45 * f);
        root.rotation.z = reducedMotion ? .1 : .1 + Math.sin(t * 4.1) * .24 * f;
      }
      tail.rotation.y = reducedMotion ? 0 : Math.sin(t * 1.8) * .13 * f;
      tail.rotation.z = reducedMotion ? 0 : Math.sin(t * 1.5) * .055 * f;
      jaw.rotation.z = -.06 - b * .38;
      head.rotation.z = -b * .12;
      legs.forEach((leg, i) => { leg.rotation.z = .2 + f * .48 + (reducedMotion ? 0 : Math.sin(t * 2 + i) * .065 * f); });
      throat.emissiveIntensity = b * 2.8;
      flameLight.intensity = b * 75;
      ambient.intensity = THREE.MathUtils.lerp(2.5, .9, n);
      key.intensity = THREE.MathUtils.lerp(3.3, 1.5, n);
      rim.intensity = THREE.MathUtils.lerp(1.5, 2.2, n);
    },
    destroy() { if (destroyed) return; destroyed = true; group.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); group.clear(); },
  };
}
