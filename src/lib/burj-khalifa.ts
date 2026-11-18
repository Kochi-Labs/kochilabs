import * as THREE from 'three';

type Point = [number, number];
interface Surface {
  positions: number[];
  uvs: number[];
  indices: number[];
}

function emptySurface(): Surface {
  return { positions: [], uvs: [], indices: [] };
}

function geometry(surface: Surface) {
  const shape = new THREE.BufferGeometry();
  shape.setAttribute('position', new THREE.Float32BufferAttribute(surface.positions, 3));
  shape.setAttribute('uv', new THREE.Float32BufferAttribute(surface.uvs, 2));
  shape.setIndex(surface.indices);
  shape.computeVertexNormals();
  shape.computeBoundingSphere();
  return shape;
}

// One continuous perimeter for all three wings. Rounded noses and re-entrant
// corners keep the buttressed Y plan visible as the camera moves past it.
function wingPlan(lengths: number[], radius: number): Point[] {
  const points: Point[] = [];
  for (let wing = 0; wing < 3; wing++) {
    const angle = (wing * 2 * Math.PI) / 3 - 0.35;
    const push = (along: number, across: number) => {
      points.push([
        Math.cos(angle) * along - Math.sin(angle) * across,
        Math.sin(angle) * along + Math.cos(angle) * across,
      ]);
    };
    push(radius * 0.87, -radius * 1.5);
    push(radius * 1.35, -radius);
    for (let edge = 0; edge <= 8; edge++) {
      const arc = -Math.PI / 2 + edge * Math.PI / 8;
      push(lengths[wing] - radius + radius * Math.cos(arc), radius * Math.sin(arc));
    }
    push(radius * 1.35, radius);
  }
  return points;
}

function wall(surface: Surface, plan: Point[], base: number, top: number, seed = 0) {
  let distance = seed;
  for (let i = 0; i < plan.length; i++) {
    const [x, z] = plan[i];
    const [nextX, nextZ] = plan[(i + 1) % plan.length];
    const index = surface.positions.length / 3;
    const end = distance + Math.hypot(nextX - x, nextZ - z);
    surface.positions.push(x, base, z, x, top, z, nextX, base, nextZ, nextX, top, nextZ);
    surface.uvs.push(distance, base / 1.2, distance, top / 1.2, end, base / 1.2, end, top / 1.2);
    surface.indices.push(index, index + 1, index + 2, index + 1, index + 3, index + 2);
    distance = end;
  }
}

function roof(surface: Surface, plan: Point[], y: number) {
  const center = surface.positions.length / 3;
  surface.positions.push(0, y, 0);
  surface.uvs.push(0, 0);
  for (const [x, z] of plan) {
    surface.positions.push(x, y, z);
    surface.uvs.push(x, z);
  }
  for (let i = 0; i < plan.length; i++) {
    surface.indices.push(center, center + 1 + (i + 1) % plan.length, center + 1 + i);
  }
}

function facadeMaps() {
  const size = 128;
  const glass = new Uint8Array(size * size * 4);
  const lights = new Uint8Array(glass.length);
  for (let y = 0; y < size; y++) {
    const floor = Math.floor(y / 16);
    const row = y % 16;
    for (let x = 0; x < size; x++) {
      const bay = Math.floor(x / 16);
      const column = x % 16;
      const frame = column === 0 || row < 2;
      const curtain = (Math.imul(bay + 47, floor + 93) % 19) * 1.4;
      const reflection = 14 * Math.sin((column / 16) * Math.PI) + 12 * row / 16;
      const i = (y * size + x) * 4;
      const value = frame ? 178 : 117 + reflection + curtain;
      glass[i] = value;
      glass[i + 1] = value + (frame ? 15 : 32);
      glass[i + 2] = value + (frame ? 21 : 50);
      glass[i + 3] = 255;
      const occupied = !frame && row > 4 && row < 14 && (bay * 13 + floor * 7 + bay * floor) % 7 < 2;
      lights[i] = occupied ? 179 : 39;
      lights[i + 1] = occupied ? 158 : 71;
      lights[i + 2] = occupied ? 112 : 89;
      lights[i + 3] = 255;
    }
  }
  function texture(data: Uint8Array) {
    const map = new THREE.DataTexture(data, size, size);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    map.needsUpdate = true;
    return map;
  }
  return { map: texture(glass), emissiveMap: texture(lights) };
}

export function createBurjKhalifa(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Burj Khalifa';
  const glazing = emptySurface();
  const terraces = emptySurface();
  const lengths = [3.42, 3.57, 3.73];
  let base = 0;
  for (let tier = 0; tier <= 18; tier++) {
    const radius = 0.62 - tier * 0.026;
    const plan = wingPlan(lengths, radius);
    const top = 1.05 + tier * 1.045;
    wall(glazing, plan, base, top - 0.048, tier * 0.15);
    wall(terraces, plan, top - 0.048, top);
    roof(terraces, plan, top);
    lengths[tier % 3] -= 0.485;
    base = top;
  }

  // The occupied tower gives way to the steel pinnacle in several telescoping sections.
  const crownProfile = [[0.37, base], [0.37, 20.75], [0.26, 20.75], [0.26, 21.54],
    [0.16, 21.54], [0.16, 22.35], [0.092, 22.35], [0.092, 23.12], [0.039, 23.12], [0.015, 26]];
  const crown = new THREE.LatheGeometry(crownProfile.map(([r, y]) => new THREE.Vector2(r, y)), 18);
  const metal = new THREE.MeshStandardMaterial({ color: '#bad1d5', emissive: '#233744', roughness: 0.33, metalness: 0.42 });
  const glass = new THREE.MeshStandardMaterial({
    ...facadeMaps(), roughness: 0.25, metalness: 0.30, emissive: 0xffffff, emissiveIntensity: 0.66,
  });
  const facade = new THREE.Mesh(geometry(glazing), glass);
  facade.name = 'Silver glass curtain walls';
  group.add(facade, new THREE.Mesh(geometry(terraces), metal), new THREE.Mesh(crown, metal));
  return group;
}
