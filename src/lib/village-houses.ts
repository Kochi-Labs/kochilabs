import * as THREE from 'three';

type PixelWindow = readonly [x: number, y: number, width: number, height: number];
type PixelBounds = readonly [left: number, top: number, right: number, bottom: number];
export type HouseBounds = { u0: number; v0: number; u1: number; v1: number };
type HouseDefinition = { label: string; bounds: PixelBounds; windows: readonly PixelWindow[]; wood: string };
type VillagerRoute = readonly [doorX: number, doorY: number, shoreX: number, shoreY: number, height: number];

// Measured against the actual 1585 × 992 clean plate, before its 1.075 scene scale.
// Coordinates identify painted openings; the underlying roofs/walls stay untouched.
const SOURCE_WIDTH = 1585;
const SOURCE_HEIGHT = 992;
const scaleX = 1600 / SOURCE_WIDTH;
const scaleY = 1000 / SOURCE_HEIGHT;
const definitions: readonly HouseDefinition[] = [
  { label: 'Large cottage on the left bank', bounds: [207, 559, 384, 649], wood: '#6a5741', windows: [[252, 621, 8, 14], [289.5, 622, 8, 15], [347, 623, 7, 12]] },
  { label: 'Small cottage beneath the left palms', bounds: [558, 607, 626, 645], wood: '#697568', windows: [[578.5, 630.5, 4.2, 5.5], [605.5, 631, 3.8, 6]] },
  { label: 'Cottage behind the distant left palms', bounds: [686, 616, 716, 640], wood: '#617560', windows: [[696.5, 631, 2.2, 3.5]] },
  { label: 'Distant cottage with the low red roof', bounds: [737, 622, 766, 641], wood: '#76816b', windows: [[753, 634, 2.5, 3.4], [759, 635, 2, 2.8]] },
  { label: 'Tiny cottage at the bend in the water', bounds: [808, 627, 830, 641], wood: '#6b7b6c', windows: [[815.7, 635, 2.5, 3], [822.3, 635.5, 2, 3]] },
  { label: 'Little cottage on the far shore', bounds: [892, 625, 915, 641], wood: '#677e73', windows: [[899.5, 635, 2.6, 3.4], [907.5, 634.5, 2.3, 3.8]] },
  { label: 'Long cottage on the far shore', bounds: [973, 622, 1004, 641], wood: '#617b75', windows: [[979.5, 634.5, 2.2, 4.8], [985, 634.5, 2.4, 5], [990.5, 634, 2.2, 4.5]] },
  { label: 'Blue cottage in the distant village', bounds: [1036, 615, 1101, 642], wood: '#526f73', windows: [[1049.5, 632, 2.8, 5], [1057, 632, 3, 5.5], [1073.7, 630.5, 3.9, 5.8], [1086, 630.7, 3.4, 5.5]] },
  { label: 'Cottage tucked behind the leaning palm', bounds: [1108, 623, 1135, 641], wood: '#687d70', windows: [[1116.5, 635, 2.4, 3.6]] },
  { label: 'Distant white cottage on the right', bounds: [1173, 621, 1205, 641], wood: '#607b79', windows: [[1184.5, 632.8, 3.3, 4.5], [1190.5, 633, 3.1, 4.5]] },
  { label: 'Large cottage on the right bank', bounds: [1241, 601, 1335, 645], wood: '#536e6d', windows: [[1259.7, 626, 4.2, 6.3], [1283.2, 625.5, 3.2, 6], [1294.7, 625.2, 5.5, 7.6], [1312, 626.5, 4.4, 4.5]] },
  { label: 'Hidden cottage beneath the right trees', bounds: [1439, 612, 1480, 640], wood: '#678368', windows: [[1458, 628.2, 3.1, 3.9]] },
];

// Feet start at painted thresholds and stop on the local bank, never in water.
// Far-shore people are deliberately only 1–3 design pixels tall.
const villagerRoutes: readonly VillagerRoute[] = [
  [315.5, 635, 326, 648.5, 8], [592.5, 638, 598, 646, 3.4],
  [698, 636.5, 701, 640.5, 1.8], [755, 637, 760, 641, 1.5],
  [819, 638, 822, 641, 1.5], [904, 638, 907, 641, 1.6],
  [986, 638, 990, 641, 1.9], [1063, 636, 1067, 641, 2.8],
  [1118, 638, 1121, 641, 1.7], [1188, 638, 1192, 641, 2],
  [1275, 634, 1278, 645, 6.3], [1458, 633, 1463, 639, 2.1],
];

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const glowFragment = `
uniform float uAmount;
uniform float uNight;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - .5) * 2.0;
  float d = dot(p, p);
  float falloff = pow(max(0.0, 1.0 - d), 2.8);
  vec3 warm = mix(vec3(1.0, .52, .14), vec3(1.0, .62, .25), uNight);
  gl_FragColor = vec4(warm, falloff * uAmount * mix(.17, .48, uNight));
  #include <colorspace_fragment>
}`;

const windowFragment = `
uniform float uAmount;
uniform float uNight;
varying vec2 vUv;
void main() {
  float edge = smoothstep(0.0, .16, min(min(vUv.x, 1.0-vUv.x), min(vUv.y, 1.0-vUv.y)));
  vec3 amber = mix(vec3(.90, .32, .06), vec3(1.0, .83, .46), edge);
  amber *= mix(.88, 1.0, uNight);
  float curtain = .95 + .05 * sin(vUv.x * 31.4);
  gl_FragColor = vec4(amber * curtain, uAmount * .97);
  #include <colorspace_fragment>
}`;

type Opening = {
  left: THREE.Group;
  right: THREE.Group;
  glow: THREE.ShaderMaterial;
  light: THREE.ShaderMaterial;
};
type Villager = {
  group: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  materials: { material: THREE.MeshBasicMaterial; day: THREE.Color; night: THREE.Color }[];
  rim: THREE.MeshBasicMaterial;
  route: VillagerRoute;
  progress: number;
  phase: number;
};

function createVillager(route: VillagerRoute, index: number): Villager {
  const group = new THREE.Group();
  group.name = `Villager ${index + 1}`;
  group.visible = false;
  const height = route[4];
  const materials: Villager['materials'] = [];
  const material = (color: string, afterDark: string) => {
    const day = new THREE.Color(color);
    const result = new THREE.MeshBasicMaterial({ color: day, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    materials.push({ material: result, day, night: new THREE.Color(afterDark) });
    return result;
  };
  const clothing = material(index % 2 ? '#be9c70' : '#597f82', '#293d4d');
  const skin = material('#a87753', '#655343');
  const dark = material('#414b45', '#26323e');
  const torso = new THREE.Mesh(new THREE.PlaneGeometry(height * .27, height * .4), clothing);
  torso.position.set(0, height * .6, .12);
  group.add(torso);
  const head = new THREE.Mesh(new THREE.CircleGeometry(height * .105, 8), skin);
  head.position.set(0, height * .865, .14);
  group.add(head);

  function limb(x: number, y: number, length: number, width: number, paint: THREE.MeshBasicMaterial) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, .1);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, length), paint);
    mesh.position.y = -length / 2;
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  }
  const leftLeg = limb(-height * .075, height * .4, height * .4, height * .08, dark);
  const rightLeg = limb(height * .075, height * .4, height * .4, height * .08, dark);
  const leftArm = limb(-height * .17, height * .74, height * .32, height * .055, skin);
  const rightArm = limb(height * .17, height * .74, height * .32, height * .055, skin);
  const rim = new THREE.MeshBasicMaterial({ color: '#e6bc78', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const edge = new THREE.Mesh(new THREE.PlaneGeometry(height * .035, height * .36), rim);
  edge.position.set(-height * .12, height * .61, .15);
  group.add(edge);
  return { group, leftLeg, rightLeg, leftArm, rightArm, materials, rim, route, progress: 0, phase: 0 };
}

type HouseState = {
  open: boolean;
  amount: number;
  velocity: number;
  openings: Opening[];
  shutterMaterial: THREE.MeshBasicMaterial;
  detailMaterial: THREE.MeshBasicMaterial;
  dayColor: THREE.Color;
  villager: Villager;
};

export function createVillageHouses() {
  const group = new THREE.Group();
  group.name = 'Painted village window lights';
  // This subtree owns its day/night colors; scene-wide recoloring should skip it.
  group.userData.ownsNightColors = true;
  const states: HouseState[] = [];
  const nightWood = new THREE.Color('#273d4c');
  const nightTrim = new THREE.Color('#364b58');
  const dayTrim = new THREE.Color('#a39068');

  for (const [index, definition] of definitions.entries()) {
    const dayColor = new THREE.Color(definition.wood);
    const shutterMaterial = new THREE.MeshBasicMaterial({ color: dayColor, transparent: true, opacity: .9, side: THREE.DoubleSide });
    const detailMaterial = new THREE.MeshBasicMaterial({ color: dayTrim, transparent: true, opacity: .38, side: THREE.DoubleSide });
    const villager = createVillager(villagerRoutes[index]!, index);
    const state: HouseState = { open: false, amount: 0, velocity: 0, openings: [], shutterMaterial, detailMaterial, dayColor, villager };
    states.push(state);
    for (const [px, py, pixelWidth, pixelHeight] of definition.windows) {
      const width = pixelWidth * scaleX;
      const height = pixelHeight * scaleY;
      const opening = new THREE.Group();
      opening.position.set(px * scaleX - 800, 500 - py * scaleY, 0);
      group.add(opening);
      const uniforms = { uAmount: { value: 0 }, uNight: { value: 0 } };
      const glowMaterial = new THREE.ShaderMaterial({
        vertexShader, fragmentShader: glowFragment, uniforms,
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
      });
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(width * 5.2, height * 2.8), glowMaterial);
      glow.position.z = -.15;
      opening.add(glow);
      const lightMaterial = new THREE.ShaderMaterial({
        vertexShader, fragmentShader: windowFragment,
        uniforms: { uAmount: { value: 0 }, uNight: { value: 0 } },
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
      });
      const light = new THREE.Mesh(new THREE.PlaneGeometry(width, height), lightMaterial);
      light.position.z = .05;
      opening.add(light);
      const left = new THREE.Group();
      const right = new THREE.Group();
      left.position.set(-width / 2, 0, .3);
      right.position.set(width / 2, 0, .3);
      opening.add(left, right);
      for (const [hinge, direction] of [[left, 1], [right, -1]] as const) {
        const shutter = new THREE.Mesh(new THREE.PlaneGeometry(width / 2, height), shutterMaterial);
        shutter.position.x = direction * width / 4;
        hinge.add(shutter);
        // Only the larger, nearer shutters need visible plank and crossbar detail.
        if (pixelWidth >= 4) {
          const plank = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(.12, width * .022), height * .92), detailMaterial);
          plank.position.set(direction * width / 4, 0, .05);
          hinge.add(plank);
          for (const y of [-height * .29, height * .29]) {
            const bar = new THREE.Mesh(new THREE.PlaneGeometry(width * .43, Math.max(.14, height * .035)), detailMaterial);
            bar.position.set(direction * width / 4, y, .06);
            hinge.add(bar);
          }
        }
      }
      state.openings.push({ left, right, glow: glowMaterial, light: lightMaterial });
    }
  }
  // Preallocate one small person per cottage; repeated toggles cannot accumulate people.
  for (const state of states) group.add(state.villager.group);

  const bounds = definitions.map(({ bounds: [x0, y0, x1, y1] }) => ({
    u0: x0 / SOURCE_WIDTH, v0: 1 - y1 / SOURCE_HEIGHT,
    u1: x1 / SOURCE_WIDTH, v1: 1 - y0 / SOURCE_HEIGHT,
  }));

  function update(dt: number, night: number, reducedMotion: boolean) {
    const step = THREE.MathUtils.clamp(Number.isFinite(dt) ? dt : 0, 0, .05);
    const darkness = THREE.MathUtils.clamp(Number.isFinite(night) ? night : 0, 0, 1);
    for (const state of states) {
      const target = state.open ? 1 : 0;
      if (reducedMotion) { state.amount = target; state.velocity = 0; }
      else {
        // A critically damped hinge: no perpetual motion once the shutter settles.
        state.velocity += ((target - state.amount) * 90 - state.velocity * 19) * step;
        state.amount = THREE.MathUtils.clamp(state.amount + state.velocity * step, 0, 1);
        if (Math.abs(target - state.amount) < .0004 && Math.abs(state.velocity) < .004) {
          state.amount = target;
          state.velocity = 0;
        }
      }
      state.shutterMaterial.color.copy(state.dayColor).lerp(nightWood, darkness * .8);
      state.detailMaterial.color.copy(dayTrim).lerp(nightTrim, darkness);
      // Windows brighten as the hinged panels uncover the painted opening.
      const light = THREE.MathUtils.smoothstep(state.amount, .06, .8);
      for (const opening of state.openings) {
        opening.left.rotation.y = -state.amount * 2.25;
        opening.right.rotation.y = state.amount * 2.25;
        opening.glow.uniforms.uAmount!.value = light;
        opening.glow.uniforms.uNight!.value = darkness;
        opening.light.uniforms.uAmount!.value = light;
        opening.light.uniforms.uNight!.value = darkness;
      }

      const person = state.villager;
      const [doorX, doorY, shoreX, shoreY, height] = person.route;
      const destination = state.open && state.amount > .3 ? 1 : 0;
      const previous = person.progress;
      if (reducedMotion) person.progress = destination;
      else {
        const duration = height > 4 ? 5 : 3.3;
        person.progress = THREE.MathUtils.clamp(previous + Math.sign(destination - previous) * Math.min(Math.abs(destination - previous), step / duration), 0, 1);
      }
      const walking = !reducedMotion && Math.abs(person.progress - previous) > .000001;
      if (walking) person.phase += step * 8;
      const gait = walking ? Math.sin(person.phase) * .27 : 0;
      const bob = walking ? Math.abs(Math.sin(person.phase)) * height * .025 : 0;
      const fade = THREE.MathUtils.smoothstep(person.progress, 0, .09);
      person.group.visible = fade > .001;
      person.group.position.set(
        THREE.MathUtils.lerp(doorX, shoreX, person.progress) * scaleX - 800,
        500 - THREE.MathUtils.lerp(doorY, shoreY, person.progress) * scaleY + bob,
        1.1,
      );
      person.leftLeg.rotation.z = gait;
      person.rightLeg.rotation.z = -gait;
      person.leftArm.rotation.z = -.12 - gait * .7;
      person.rightArm.rotation.z = .12 + gait * .7;
      for (const appearance of person.materials) {
        appearance.material.color.lerpColors(appearance.day, appearance.night, darkness);
        appearance.material.opacity = fade;
      }
      person.rim.opacity = fade * (.12 + darkness * .5);
    }
  }

  return {
    group,
    labels: definitions.map((definition) => definition.label),
    bounds,
    hitTest(u: number, v: number): number | null {
      if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
      const index = bounds.findIndex((box) => u >= box.u0 && u <= box.u1 && v >= box.v0 && v <= box.v1);
      return index < 0 ? null : index;
    },
    toggle(index: number): boolean {
      const state = states[index];
      if (!state) return false;
      state.open = !state.open;
      return state.open;
    },
    update,
    destroy() {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        geometries.add(object.geometry);
        (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => materials.add(material));
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      group.clear();
    },
  };
}
