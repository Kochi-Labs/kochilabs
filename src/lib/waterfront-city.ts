import * as THREE from 'three';

type Point = [number, number, number];
type Placement = { matrix: THREE.Matrix4; color: THREE.Color };

// World-scale concrete joints and salt streaks retain their scale on both a pier and a high-rise.
function weatherConcrete(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 concretePosition;
        varying vec3 concreteNormal;
        varying vec3 blockPosition;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        concretePosition = (instanceMatrix * vec4(position, 1.)).xyz;
        concreteNormal = normal;
        blockPosition = position;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 concretePosition;
        varying vec3 concreteNormal;
        varying vec3 blockPosition;
        float aggregateHash(vec2 cell) {
          vec3 p = fract(vec3(cell.xyx) * .1031);
          p += dot(p, p.yzx + 33.33);
          return fract((p.x + p.y) * p.z);
        }
        float aggregate(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3. - 2. * f);
          return mix(mix(aggregateHash(i), aggregateHash(i+vec2(1,0)),f.x),
                     mix(aggregateHash(i+vec2(0,1)), aggregateHash(i+vec2(1)),f.x),f.y);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 facade = vec2(abs(concreteNormal.x)>.5 ? concretePosition.z : concretePosition.x, concretePosition.y);
        if(abs(concreteNormal.y)>.5) facade = concretePosition.xz;
        float streak = aggregate(facade * vec2(7.5,.85));
        float mottling = aggregate(facade * 1.8);
        float cement = .72 + .26 * mottling + .13 * streak;
        // Expansion joints between concrete formwork panels, softened at a distance.
        vec2 joints = abs(fract(facade/vec2(1.32,.78)+.5)-.5);
        vec2 seam = 1.-smoothstep(vec2(.008), max(fwidth(facade),vec2(.02)),joints);
        float occlusion = mix(.58,1.,smoothstep(-.5,.11,blockPosition.y));
        diffuseColor.rgb *= cement * occlusion * (1. - .14 * max(seam.x,seam.y));
        float patina = (1.-smoothstep(-2.8,1.8,concretePosition.y)) * (.15+.26*mottling);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.52,.83,.70), patina);
      `,
      );
  };
}

// The frame, sills, blind and interior belong to each pane rather than repeating one texture across a tower.
function roomGlazing(): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ color: '#ffebcd', toneMapped: false });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 roomUv;
        varying vec3 roomChoice;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        roomUv=uv;
        vec3 anchor=instanceMatrix[3].xyz;
        vec3 seed = fract(anchor * vec3(.301,.579,.793));
        roomChoice = fract(vec3(dot(seed,vec3(17.1,3.3,8.2)), dot(seed,vec3(5.3,12.2,21.3)), dot(seed,vec3(19.19,7.35,2.83))));
      `,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 roomUv;
        varying vec3 roomChoice;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 p = roomUv;
        vec2 edge = min(p, 1.-p);
        vec2 aa = max(fwidth(p), vec2(.012));
        float frame = smoothstep(.026, .026+aa.x, edge.x) * smoothstep(.033,.033+aa.y,edge.y);
        float post = smoothstep(.012, .012+aa.x, abs(p.x-.35-.3*roomChoice.y));
        float lintel = smoothstep(.013, .013+aa.y, abs(p.y-.76));
        float ceiling = .52 + .38*smoothstep(.18,.95,p.y);
        float sideWall = .54+.46*smoothstep(.03,.55,abs(p.x-roomChoice.x*.22));
        float blind = smoothstep(.70-roomChoice.y*.5,.74-roomChoice.y*.5,p.y) * step(.42,roomChoice.x);
        float slats = .65+.15*cos(52.*p.y)*max(0.,1.-5.*aa.y);
        float lampGlow = exp(-4.*length((p-vec2(.22+.51*roomChoice.x,.72))*vec2(1.2,1.9)));
        float furnitureHeight = .09+.18*step(.42,fract(p.x*2.7+roomChoice.z));
        float interior = (ceiling * sideWall + lampGlow*.70) * mix(1.,slats*.64,blind);
        interior *= .45+.55*smoothstep(furnitureHeight,furnitureHeight+aa.y,p.y);
        diffuseColor.rgb *= (.72+.6*roomChoice.z) * mix(.18,interior,frame*post*lintel);
        diffuseColor.rgb += vec3(.024,.042,.054) * (.4+.6*smoothstep(.2,.9,p.x+p.y*.22));
      `,
      );
  };
  return material;
}

export function createWaterfrontCity() {
  const group = new THREE.Group();
  group.name = 'Submerged Kochi waterfront';
  const targets: THREE.Object3D[] = [];
  const actions = new Map<THREE.Object3D, () => string>();
  const box = new THREE.BoxGeometry();
  const round = new THREE.CylinderGeometry(0.5, 0.5, 1, 9);
  const painted = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0.16 });
  weatherConcrete(painted);
  const glass = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.53 });
  const lamp = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
  const up = new THREE.Vector3(0, 1, 0);
  const identity = new THREE.Quaternion();

  // Stationary city details share batches, including all railings, slab edges and piles.
  const batches = new Map<THREE.Object3D, Map<THREE.BufferGeometry, Map<THREE.Material, Placement[]>>>();
  function part(
    parent: THREE.Object3D,
    at: Point,
    size: Point,
    color: string,
    geometry: THREE.BufferGeometry = box,
    material: THREE.Material = painted,
    rotation = identity,
  ) {
    let types = batches.get(parent);
    if (!types) batches.set(parent, (types = new Map()));
    let materials = types.get(geometry);
    if (!materials) types.set(geometry, (materials = new Map()));
    let instances = materials.get(material);
    if (!instances) materials.set(material, (instances = []));
    instances.push({
      matrix: new THREE.Matrix4().compose(new THREE.Vector3(...at), rotation, new THREE.Vector3(...size)),
      color: new THREE.Color(color),
    });
  }
  function strut(parent: THREE.Object3D, start: Point, end: Point, thickness: number, color: string) {
    const a = new THREE.Vector3(...start),
      b = new THREE.Vector3(...end);
    const direction = b.clone().sub(a);
    const center = a.lerp(b, 0.5);
    part(
      parent,
      [center.x, center.y, center.z],
      [thickness, direction.length(), thickness],
      color,
      box,
      painted,
      new THREE.Quaternion().setFromUnitVectors(up, direction.normalize()),
    );
  }
  function target(parent: THREE.Object3D, name: string, at: Point, size: Point, action: () => string) {
    const proxy = new THREE.Mesh(box, hitMaterial);
    proxy.name = name;
    proxy.position.set(...at);
    proxy.scale.set(...size);
    parent.add(proxy);
    targets.push(proxy);
    actions.set(proxy, action);
    return proxy;
  }
  function signage(text: string, at: Point, width: number, height: number) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#123e4b';
    ctx.fillRect(0, 0, 512, 80);
    ctx.fillStyle = '#73dbbc';
    ctx.fillRect(0, 65, 512, 6);
    ctx.fillStyle = '#f9e4b5';
    ctx.font = '600 46px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 36);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: texture }),
    );
    mesh.position.set(...at);
    group.add(mesh);
  }

  const base = -3;
  let now = 0;
  const brightening: { material: THREE.MeshBasicMaterial; until: number }[] = [];
  const lit = ['#ffd394', '#ffb273', '#f4dfb7', '#d9d9b5', '#ffcb84', '#dca979', '#f0d2ba'];
  const concrete = ['#718993', '#8097a1', '#788a93', '#9aa8a7', '#68838f'];
  let towerNumber = 0;
  function building(x: number, z: number, w: number, d: number, floors: number, office: boolean, name: string) {
    const seed = towerNumber++;
    const wall = concrete[seed % concrete.length]!;
    const floor = office ? 0.87 : 0.77;
    const ground = base + 0.34;
    const height = floor * floors;
    const glow = roomGlazing();
    const state = { material: glow, until: -100 };
    brightening.push(state);
    const south = z + d / 2,
      east = x + w / 2,
      west = x - w / 2;
    part(group, [x, base + 0.15, z], [w + 0.65, 0.32, d + 0.65], '#718486');
    part(
      group,
      [x, ground + height / 2, z],
      [w, height, d],
      office ? '#385b70' : wall,
      box,
      office ? glass : painted,
    );
    const cols = Math.max(3, Math.round(w / 0.9)),
      sideCols = Math.max(3, Math.round(d / 1.05));
    for (let f = 0; f < floors; f++) {
      const y = ground + f * floor;
      const stripe = f % 4 === 3 ? '#a6aaa0' : '#77959a';
      if (!office) {
        // The projecting concrete slab and open silver guardrail leave the doors visibly recessed.
        part(group, [x, y + 0.035, z + 0.12], [w + 0.3, 0.09, d + 0.5], stripe);
        part(group, [x, y + 0.26, south + 0.36], [w + 0.12, 0.044, 0.045], '#adc0bc');
        part(group, [east + 0.12, y + 0.26, z], [0.04, 0.042, d + 0.45], '#adc0bc');
      } else {
        part(group, [x, y + 0.055, z], [w + 0.08, 0.095, d + 0.08], f % 5 === 0 ? '#b3bbb0' : '#477886');
      }
      for (let c = 0; c < cols; c++) {
        const wx = x - w / 2 + (w * (c + 0.5)) / cols;
        const tint = lit[(seed * 3 + c * 5 + f * 4 + Math.floor((c * f) / 3)) % lit.length]!;
        const paneW = (w / cols) * (office ? 0.83 : 0.59),
          paneH = floor * (office ? 0.66 : 0.59);
        part(group, [wx, y + floor * 0.53, south + 0.018], [paneW, paneH, 0.025], tint, box, glow);
        if (!office) {
          part(group, [wx + 0.08, y + floor * 0.53, south + 0.041], [0.032, paneH, 0.038], '#384f56');
          part(group, [wx - (w / cols) * 0.44, y + 0.14, south + 0.36], [0.042, 0.24, 0.042], '#8ba5a2');
          if ((c + f) % 5 === 0)
            part(group, [wx + paneW * 0.38, y + 0.15, south + 0.16], [0.19, 0.16, 0.19], '#70848b');
        }
      }
      for (let c = 0; c < sideCols; c++) {
        const wz = z - d / 2 + (d * (c + 0.5)) / sideCols;
        const tw = lit[(seed + f * 3 + c * 5) % lit.length]!;
        for (const sx of [west - 0.018, east + 0.018]) {
          part(group, [sx, y + floor * 0.52, wz], [0.027, floor * 0.51, (d / sideCols) * 0.63], tw, box, glow);
        }
      }
    }
    const roof = ground + height;
    part(group, [x, roof + 0.05, z], [w + 0.2, 0.14, d + 0.2], '#99a9aa');
    part(group, [x - w * 0.12, roof + 0.34, z - 0.21], [w * 0.5, 0.57, d * 0.48], office ? '#466a78' : '#7d8b8c');
    if (office) {
      // Glass corner tower, façade fins and a setback penthouse distinct from the apartment blocks.
      for (let c = 0; c <= cols; c++) {
        part(group, [west + (w * c) / cols, ground + height / 2, south + 0.08], [0.08, height, 0.18], '#84a3a5');
      }
      part(group, [x - w * 0.12, roof + 0.64, z - 0.21], [w * 0.53, 0.08, d * 0.51], '#bad1c7');
      part(group, [east - 0.32, roof + 0.76, z - 0.22], [0.06, 1.4, 0.06], '#acbebd', round);
      part(group, [east - 0.32, roof + 1.46, z - 0.22], [0.095, 0.075, 0.095], '#ff8d64', round, lamp);
    } else {
      for (const sx of [x - w * 0.25, x + w * 0.22]) {
        part(group, [sx, roof + 0.43, z + d * 0.18], [0.52, 0.75, 0.52], '#53686c', round);
        part(group, [sx, roof + 0.82, z + d * 0.18], [0.55, 0.07, 0.55], '#738888', round);
      }
      part(group, [west + 0.22, ground + height / 2, south + 0.08], [0.19, height, 0.31], '#9baba6');
    }
    // Alternate wings, deep sunshades and roof terraces break the outline of the nearer towers.
    let crownHeight = 0;
    if (seed < 7) {
      if (office) {
        const atriumX = x + w * 0.27;
        part(
          group,
          [atriumX, ground + height * 0.51, south + 0.17],
          [w * 0.29, height * 1.02, 0.46],
          '#366d77',
          box,
          glass,
        );
        for (let f = 0; f < floors; f++) {
          const bandY = ground + floor * (f + 0.5);
          part(
            group,
            [atriumX, bandY, south + 0.405],
            [w * 0.255, floor * 0.68, 0.021],
            lit[(f + seed) % lit.length]!,
            box,
            glow,
          );
        }
        // Angled stainless bracing on a forward glass bay distinctly reads as a glazed atrium.
        for (let f = 0; f < floors; f += 3) {
          const lower = ground + floor * f,
            upper = Math.min(roof, lower + 3 * floor);
          const dir = f % 2 === 0 ? 1 : -1;
          strut(
            group,
            [atriumX - w * 0.143 * dir, lower, south + 0.47],
            [atriumX + w * 0.143 * dir, upper, south + 0.47],
            0.082,
            '#b3b8a9',
          );
        }
        crownHeight = seed === 2 ? 2.7 : 1.8;
        const cx = x - w * 0.13;
        part(
          group,
          [cx, roof + crownHeight * 0.49, z - 0.1],
          [w * 0.7, crownHeight, d * 0.69],
          '#355c69',
          box,
          glass,
        );
        for (let j = 0; j < 3; j++) {
          const cw = w * (0.62 - j * 0.08);
          part(
            group,
            [cx, roof + 0.34 + j * crownHeight * 0.3, z + d * 0.32],
            [cw, crownHeight * 0.17, 0.03],
            lit[(seed + j * 3) % lit.length]!,
            box,
            glow,
          );
          part(group, [cx, roof + 0.14 + j * crownHeight * 0.3, z - 0.1], [w * 0.74, 0.09, d * 0.75], '#889ca0');
        }
        part(group, [cx - w * 0.09, roof + crownHeight + 0.24, z - 0.29], [w * 0.46, 0.47, d * 0.48], '#647c80');
        part(group, [cx, roof + crownHeight + 0.1, z - 0.1], [w * 0.72, 0.12, d * 0.72], '#9caeaf');
      } else {
        const wingX = x - w * 0.2;
        // A receding corner stack and alternating terracotta screens give the residential skyline depth.
        const span = w * 0.58;
        const projection = 0.47;
        for (let f = 0; f < floors; f++) {
          const y = ground + f * floor;
          const offset = (Math.floor(f / 3) % 2) * 0.27;
          part(group, [wingX + offset, y + 0.035, south + projection], [span, 0.105, 0.53], '#a59e8c');
          part(
            group,
            [wingX + offset, y + 0.26, south + projection + 0.244],
            [span, 0.18, 0.047],
            '#56787b',
            box,
            glass,
          );
          part(
            group,
            [wingX + offset, y + 0.37, south + projection + 0.244],
            [span + 0.03, 0.039, 0.047],
            '#bcc1ab',
          );
          const screenX = wingX + offset + span * 0.35;
          if (f % 4 !== 0)
            for (let fin = 0; fin < 5; fin++) {
              part(
                group,
                [screenX + fin * 0.093, y + floor * 0.5, south + projection + 0.11],
                [0.046, floor * 0.87, 0.16],
                '#af7d62',
              );
            }
          if (f % 4 === 3) {
            part(group, [wingX - 0.22, y + 0.17, south + projection], [0.77, 0.28, 0.28], '#7b8171');
            part(group, [wingX - 0.22, y + 0.33, south + projection], [0.68, 0.09, 0.25], '#4e6f68');
          }
        }
        crownHeight = seed === 0 ? 2.35 : 1.15;
        part(group, [wingX, roof + crownHeight * 0.47, z - 0.14], [w * 0.57, crownHeight, d * 0.69], '#809899');
        for (let j = 0; j < 3; j++) {
          const ax = wingX - w * 0.19 + j * w * 0.18;
          part(
            group,
            [ax, roof + crownHeight * 0.59, z + d * 0.345 - 0.12],
            [w * 0.15, crownHeight * 0.45, 0.035],
            lit[(j + seed * 3) % lit.length]!,
            box,
            glow,
          );
        }
        part(group, [wingX, roof + crownHeight, z - 0.04], [w * 0.63, 0.14, d * 0.79], '#b8b6a4');
        for (let rib = 0; rib < 7; rib++) {
          const px = wingX - w * 0.25 + rib * w * 0.083;
          part(group, [px, roof + crownHeight + 0.33, z - 0.17], [0.055, 0.065, d * 0.57], '#99a7a0');
        }
        for (const dx of [-1, 1])
          for (const dz of [-1, 1]) {
            part(
              group,
              [wingX + dx * w * 0.25, roof + crownHeight + 0.18, z - 0.17 + dz * d * 0.26],
              [0.055, 0.34, 0.055],
              '#99a7a0',
            );
          }
      }
    }
    return target(
      group,
      name,
      [x, ground + (height + crownHeight) * 0.5, z],
      [w + 0.23, height + crownHeight + 0.38, d + 0.27],
      () => {
        state.until = now + 5;
        return name + ' · the windows brighten.';
      },
    );
  }

  // Uneven blocks step up behind the concourse; a clear channel remains on the right.
  const apartments = building(-8, -19, 5.5, 4.9, 17, false, 'Marine Drive apartments');
  building(-13.0, -22.8, 3.8, 4.4, 13, true, 'Harbour Point offices');
  building(-3.3, -25.6, 4.8, 4.6, 14, true, 'Waterfront Exchange');
  building(2.1, -28.3, 3.8, 4.2, 10, false, 'Canal View apartments');
  building(-16.8, -14.9, 5.0, 4, 8, false, 'Island Quay apartments');
  building(-3.7, -14.6, 3.4, 3, 5, false, 'Jetty Road flats');
  building(8.3, -29.8, 4.4, 3.8, 6, true, 'Ferry Road offices');
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 8; i++) {
      const n = i + row * 8;
      building(
        -30 + i * 7 + (row ? 2.4 : 0),
        -38 - row * 11 - (i % 3) * 1.3,
        3.4 + (n % 3) * 0.6,
        3.8 + (n % 2) * 0.9,
        6 + ((n * 7) % 11),
        n % 3 === 0,
        'Harbour district, block ' + (n + 1),
      );
    }
  }

  // Waterfront road with lane paint, slender lamps, seawall coping and promenade kerbs.
  part(group, [-4, base + 0.17, -10.6], [43, 0.28, 3.25], '#3e535c');
  for (const z of [-12.1, -9.1]) part(group, [-4, base + 0.35, z], [43, 0.16, 0.24], '#a0aaa1');
  for (let x = -25; x <= 17; x += 2.7) {
    part(group, [x, base + 0.321, -10.6], [1, 0.017, 0.057], '#c1b59b');
  }
  for (let x = -23; x <= 17; x += 4.8) {
    part(group, [x, base + 1.04, -9.12], [0.049, 1.7, 0.049], '#86a3aa', round);
    part(group, [x + 0.15, base + 1.89, -9.12], [0.35, 0.052, 0.08], '#b0bcb8');
    part(group, [x + 0.26, base + 1.85, -9.12], [0.15, 0.055, 0.09], '#ffd586', box, lamp);
  }

  // Delivery vans and compact cars provide a familiar street-scale reference.
  const wheelDirection = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  for (let i = 0; i < 12; i++) {
    const x = -22 + i * 3.18,
      z = -10.6 + (i % 3 === 0 ? -0.61 : 0.61),
      road = base + 0.33;
    const van = i % 4 === 0;
    const length = van ? 1.27 : 1.04;
    part(group, [x, road + 0.15, z], [length, 0.19, 0.43], ['#aa795f', '#c4b6a2', '#607784', '#7f9c98'][i % 4]!);
    part(
      group,
      [x - 0.055, road + (van ? 0.37 : 0.31), z],
      [van ? 0.92 : 0.56, van ? 0.32 : 0.2, 0.39],
      '#4b6974',
      box,
      glass,
    );
    part(group, [x - 0.055, road + (van ? 0.54 : 0.42), z], [van ? 0.89 : 0.52, 0.035, 0.39], '#a8b2aa');
    for (const end of [-1, 1]) {
      part(
        group,
        [x + length * 0.33 * end, road + 0.097, z + 0.211],
        [0.196, 0.07, 0.196],
        '#38444a',
        round,
        painted,
        wheelDirection,
      );
    }
    part(group, [x + length * 0.5, road + 0.185, z + 0.123], [0.021, 0.044, 0.094], '#ffdaa0', box, lamp);
    part(group, [x - length * 0.5, road + 0.188, z + 0.123], [0.021, 0.05, 0.08], '#e66e56', box, lamp);
  }

  // Cast-concrete viaduct with flared capitals, fascia and steel running rails.
  const railZ = -7.3,
    deckY = 0.22;
  part(group, [-4, deckY, railZ], [44, 0.48, 1.53], '#899c9c');
  for (const offset of [-0.71, 0.71]) part(group, [-4, deckY + 0.35, railZ + offset], [44, 0.3, 0.11], '#b1bcb3');
  for (const offset of [-0.36, 0.36])
    part(group, [-4, deckY + 0.31, railZ + offset], [44, 0.09, 0.065], '#aebcc1');
  for (let x = -25; x <= 17; x += 4.5) {
    part(group, [x, (base + deckY) / 2, railZ], [0.56, deckY - base, 0.72], '#81979a');
    part(group, [x, deckY - 0.44, railZ], [1.38, 0.42, 1.13], '#95a6a3');
    for (const offset of [-1, 1]) {
      strut(
        group,
        [x, deckY - 1.17, railZ + 0.27 * offset],
        [x, deckY - 0.25, railZ + 0.68 * offset],
        0.23,
        '#8ca1a3',
      );
    }
    part(group, [x, base + 0.13, railZ], [1.08, 0.3, 1.28], '#667e80');
  }
  const stationX = -9.2;
  part(group, [stationX, deckY + 0.47, railZ - 1.03], [7.7, 0.28, 1.03], '#a6aaa1');
  part(group, [stationX, deckY + 0.61, railZ - 0.57], [7.55, 0.035, 0.095], '#eed48b');
  for (let i = 0; i < 7; i++) {
    const x = stationX - 3.42 + i * 1.14;
    part(group, [x, deckY + 1.52, railZ - 1.35], [0.1, 1.85, 0.1], '#aababa');
  }
  const canopy = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true, 0, Math.PI);
  // Cylinder is open at the gables: its long axis runs along the station platform.
  const vaultMaterial = new THREE.MeshStandardMaterial({
    color: '#79a6a9',
    side: THREE.DoubleSide,
    metalness: 0.35,
    roughness: 0.48,
  });
  const canopyMesh = new THREE.Mesh(canopy, vaultMaterial);
  canopyMesh.rotation.z = Math.PI / 2;
  canopyMesh.position.set(stationX, deckY + 2.05, railZ - 0.75);
  canopyMesh.scale.set(0.61, 8.1, 1.27);
  group.add(canopyMesh);
  for (let bay = 0; bay <= 8; bay++) {
    const x = stationX - 3.88 + bay * 0.97,
      roofY = deckY + 2.05,
      mid = railZ - 0.75;
    for (let side = 0; side < 5; side++) {
      const a = (side * Math.PI) / 5,
        b = ((side + 1) * Math.PI) / 5;
      strut(
        group,
        [x, roofY + 0.635 * Math.sin(a), mid + 1.288 * Math.cos(a)],
        [x, roofY + 0.635 * Math.sin(b), mid + 1.288 * Math.cos(b)],
        0.035,
        '#a6bab7',
      );
    }
  }
  for (let stair = 0; stair < 15; stair++) {
    const y = base + 0.13 + stair * 0.234;
    part(group, [stationX + 4.98 - stair * 0.12, y, railZ - 1.17], [0.25, 0.2, 0.66], '#adb0a3');
  }
  for (let i = 0; i < 5; i++)
    part(group, [stationX - 3 + i * 1.48, deckY + 2.13, railZ - 0.7], [0.75, 0.05, 0.1], '#ffe4ab', box, lamp);
  signage('KOCHI METRO', [stationX, deckY + 0.2, railZ + 0.81], 3.18, 0.47);

  const train = new THREE.Group();
  group.add(train);
  const parked = -8.4;
  train.position.set(parked, deckY + 0.49, railZ);
  for (let c = -1; c <= 1; c++) {
    const x = c * 1.84;
    part(train, [x, 0.39, 0], [1.76, 0.74, 0.81], '#c4ced0');
    part(train, [x, 0.6, 0.41], [1.66, 0.32, 0.026], '#233e51', box, glass);
    part(train, [x, 0.16, 0.424], [1.71, 0.17, 0.026], '#199b98');
    part(train, [x, 0.75, 0], [1.72, 0.11, 0.83], '#6a858d');
    part(train, [x, 0.83, 0], [0.65, 0.09, 0.4], '#899697');
    for (let w = 0; w < 5; w++)
      part(
        train,
        [x - 0.67 + w * 0.335, 0.584, 0.438],
        [0.233, 0.182, 0.025],
        w === 1 || w === 4 ? '#c7e0de' : '#fdd59b',
        box,
        lamp,
      );
    for (const t of [-0.55, 0.55]) part(train, [x + t, 0.02, 0], [0.3, 0.14, 0.6], '#33454d');
  }
  let trainStart = -100;
  const depart = () => {
    if (now - trainStart > 12) trainStart = now;
    return 'Kochi Metro · train departing.';
  };
  const metroStation = target(
    group,
    'Metro station',
    [stationX, deckY + 1.4, railZ - 0.8],
    [8.2, 3, 2.45],
    depart,
  );
  target(train, 'Metro train', [0, 0.4, 0], [5.48, 0.91, 0.9], depart);
  target(group, 'Metro viaduct', [-4, deckY, railZ], [44, 0.66, 1.61], depart);

  // Floating passenger pontoon, gangway and low, wide electric commuter ferry.
  const quayX = 7.8,
    quayZ = -14;
  part(group, [quayX, base + 0.65, quayZ], [7.9, 1.18, 3.05], '#798b8b');
  part(group, [quayX, base + 1.92, quayZ - 0.38], [5.75, 1.6, 1.56], '#567b83', box, glass);
  for (let i = 0; i < 10; i++) {
    const x = quayX - 2.5 + i * 0.56;
    part(group, [x, base + 2.08, quayZ + 0.43], [0.4, 0.66, 0.04], '#ffca85', box, lamp);
    part(group, [x - 0.25, base + 2, quayZ + 0.61], [0.065, 1.48, 0.08], '#99ada8');
  }
  part(group, [quayX, base + 2.82, quayZ], [6.48, 0.15, 2.11], '#7bb3b3');
  signage('WATER METRO', [quayX, base + 2.72, quayZ + 1.08], 2.3, 0.36);
  part(group, [quayX, base + 0.56, quayZ + 2.14], [6.42, 0.33, 1.02], '#a29175');
  const ferry = new THREE.Group();
  group.add(ferry);
  ferry.position.set(quayX, base + 0.4, quayZ + 3.14);
  part(ferry, [0, 0.16, 0], [3.56, 0.31, 1.07], '#1f7887');
  part(ferry, [0, 0.42, 0], [3.31, 0.32, 1.02], '#c2d3cf');
  part(ferry, [-0.05, 0.75, 0], [2.85, 0.49, 0.86], '#3d6978', box, glass);
  for (let i = 0; i < 7; i++)
    part(ferry, [-1.23 + i * 0.39, 0.75, 0.44], [0.28, 0.33, 0.035], '#fbd7a0', box, lamp);
  part(ferry, [-0.05, 1.04, 0], [3.1, 0.14, 1.11], '#b2c7c4');
  let ferryStart = -100;
  const sail = () => {
    if (now - ferryStart > 14) ferryStart = now;
    return 'Water Metro · ferry leaving the pontoon.';
  };
  const ferryTerminal = target(group, 'Water Metro terminal', [quayX, base + 1.5, quayZ], [8, 3.05, 3.25], sail);
  target(ferry, 'Electric ferry', [0, 0.59, 0], [3.6, 1.16, 1.19], sail);

  const craneX = -14.5,
    craneZ = -3;
  const metal = '#d07950',
    pale = '#e3b28c';
  for (const dx of [-1.07, 1.07])
    for (const dz of [-0.72, 0.72]) {
      strut(group, [craneX + dx, base, craneZ + dz], [craneX + dx * 0.68, 4.24, craneZ + dz * 0.83], 0.17, metal);
      part(group, [craneX + dx, base + 0.22, craneZ + dz], [0.52, 0.4, 0.53], '#667b7c');
    }
  for (const dz of [-0.7, 0.7]) {
    strut(group, [craneX - 1.0, base + 0.23, craneZ + dz], [craneX + 0.79, 2.75, craneZ + dz], 0.09, pale);
    strut(group, [craneX + 1.0, base + 0.23, craneZ + dz], [craneX - 0.79, 2.75, craneZ + dz], 0.09, pale);
  }
  // Chord-and-diagonal gantry, access walk and ladders, sized against the containers below.
  for (const side of [-0.68, 0.68]) {
    const z = craneZ + side;
    part(group, [craneX + 1.3, 4.15, z], [6.4, 0.1, 0.11], metal);
    part(group, [craneX + 1.3, 4.76, z], [6.4, 0.105, 0.11], pale);
    for (let bay = 0; bay < 10; bay++) {
      const left = craneX - 1.9 + bay * 0.64;
      strut(group, [left, 4.15, z], [left + 0.64, 4.76, z], 0.07, metal);
      part(group, [left, 4.45, z], [0.055, 0.6, 0.055], metal);
    }
  }
  part(group, [craneX + 1.3, 4.11, craneZ], [6.4, 0.09, 1.47], '#a08173');
  part(group, [craneX - 1.31, 4.64, craneZ], [0.96, 0.8, 0.86], '#bc8e71');
  part(group, [craneX - 1.31, 4.76, craneZ + 0.45], [0.79, 0.37, 0.044], '#f7c788', box, lamp);
  for (const side of [-0.14, 0.14]) {
    part(group, [craneX - 1.01 + side, 0.92, craneZ + 0.75], [0.04, 7.84, 0.04], pale);
  }
  for (let rung = 0; rung < 24; rung++) {
    part(group, [craneX - 1.01, base + 0.19 + rung * 0.3, craneZ + 0.75], [0.31, 0.035, 0.04], pale);
  }
  part(group, [craneX - 0.6, 5.35, craneZ], [0.28, 2.26, 0.34], metal);
  for (const dx of [-1.6, 4.4])
    for (const dz of [-0.53, 0.53]) {
      strut(group, [craneX - 0.6, 6.48, craneZ], [craneX + dx, 4.33, craneZ + dz], 0.058, '#a9b8b8');
    }
  const hoist = new THREE.Group(),
    cargo = new THREE.Group();
  group.add(hoist);
  hoist.add(cargo);
  hoist.position.set(craneX + 3, 4.05, craneZ);
  part(hoist, [0, -0.04, 0], [0.77, 0.21, 1.06], '#81969a');
  const cables = new THREE.Group();
  hoist.add(cables);
  for (const dz of [-0.26, 0.26]) part(cables, [0, -0.5, dz], [0.031, 1, 0.031], '#9aadae');
  part(cargo, [0, -0.18, 0], [1.57, 0.71, 0.7], '#c18155');
  const containerColors = ['#a56351', '#4b8188', '#a28e63', '#557c8e'];
  for (let n = 0; n < 14; n++) {
    const x = craneX - 2.6 + (n % 5) * 1.83,
      z = craneZ - 1.9 - Math.floor(n / 5) * 0.81;
    const y = base + 0.42 + (n > 9 ? 0.74 : 0);
    part(group, [x, y, z], [1.72, 0.73, 0.73], containerColors[n % 4]!);
    for (let rib = 0; rib < 6; rib++)
      part(group, [x - 0.73 + rib * 0.28, y, z + 0.375], [0.035, 0.63, 0.024], '#879b96');
  }
  let craneStart = -100;
  const lift = () => {
    if (now - craneStart > 9) craneStart = now;
    return 'Container terminal · gantry shifting a container.';
  };
  const containerCrane = target(group, 'Container crane', [craneX, 1.4, craneZ], [2.3, 8.8, 1.75], lift);
  target(group, 'Container crane jib', [craneX + 1.3, 4.3, craneZ], [6.5, 0.55, 1.52], lift);
  target(group, 'Container yard', [craneX + 1, base + 0.69, craneZ - 2.68], [10, 1.6, 2.6], lift);

  for (const [owner, geometries] of batches)
    for (const [geo, materials] of geometries)
      for (const [material, instances] of materials) {
        const mesh = new THREE.InstancedMesh(geo, material, instances.length);
        instances.forEach((instance, i) => {
          mesh.setMatrixAt(i, instance.matrix);
          mesh.setColorAt(i, instance.color);
        });
        mesh.computeBoundingSphere();
        owner.add(mesh);
      }
  // A smooth round trip means clicking again never teleports a moving vehicle.
  const excursion = (elapsed: number, duration: number) =>
    elapsed >= 0 && elapsed < duration ? 0.5 - 0.5 * Math.cos((elapsed / duration) * Math.PI * 2) : 0;
  return {
    group,
    targets,
    stops: [
      {
        label: 'Marine Drive',
        position: new THREE.Vector3(0.5, 5.5, -5.8),
        lookAt: new THREE.Vector3(-8, 4, -19),
        target: apartments,
      },
      {
        label: 'Kochi Metro',
        position: new THREE.Vector3(-4.2, 3.4, 2.2),
        lookAt: new THREE.Vector3(stationX, 1.3, railZ),
        target: metroStation,
      },
      {
        label: 'Water Metro',
        position: new THREE.Vector3(11.8, 2, -4.4),
        lookAt: new THREE.Vector3(quayX, -0.85, quayZ + 1.3),
        target: ferryTerminal,
      },
      {
        label: 'Container port',
        position: new THREE.Vector3(-7.4, 3.0, 5.9),
        lookAt: new THREE.Vector3(craneX + 1.2, 1.55, craneZ),
        target: containerCrane,
      },
    ],
    interact(object: THREE.Object3D) {
      return actions.get(object)?.() ?? '';
    },
    update(time: number) {
      now = time;
      for (const item of brightening) {
        if (item.until < -90) continue;
        const remaining = item.until - time;
        const strength = THREE.MathUtils.clamp(remaining, 0, 1);
        item.material.color.setRGB(1 + 1.6 * strength, 0.83 + 1.3 * strength, 0.61 + 1.14 * strength);
        if (remaining <= 0) item.until = -100;
      }
      train.position.x = parked + 14.6 * excursion(time - trainStart, 12);
      const crossing = excursion(time - ferryStart, 14);
      ferry.position.x = quayX + 5.2 * crossing;
      ferry.position.z = quayZ + 3.14 + 1.6 * crossing;
      ferry.position.y = base + 0.4 + Math.sin(time * 0.83) * 0.035;
      const loading = excursion(time - craneStart, 9);
      hoist.position.x = craneX + 3 - 2.8 * loading;
      cargo.position.y = -1.5 + 0.65 * Math.sin(loading * Math.PI);
      cables.scale.y = -cargo.position.y;
    },
  };
}
