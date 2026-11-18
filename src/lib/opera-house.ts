import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Sydney's overlapping ceramic shells, built along the X axis of the quay. */
export function createOperaHouse(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Sydney Opera House';
  const solid: THREE.BufferGeometry[] = [];
  const glazing: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);

  function paint(geometry: THREE.BufferGeometry, tint: string, batch = solid) {
    const color = new THREE.Color(tint);
    const colors = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.deleteAttribute('uv');
    batch.push(geometry);
  }

  function slab(x: number, y: number, z: number, width: number, height: number, depth: number, tint: string) {
    paint(new THREE.BoxGeometry(width, height, depth).translate(x, y, z), tint);
  }

  function strut(a: THREE.Vector3, b: THREE.Vector3, radius: number, tint: string) {
    const axis = b.clone().sub(a);
    if (axis.lengthSq() < .000001) return;
    const bar = new THREE.CylinderGeometry(radius, radius, axis.length(), 5);
    bar.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, axis.normalize()));
    bar.translate((a.x+b.x)/2, (a.y+b.y)/2, (a.z+b.z)/2);
    paint(bar, tint);
  }

  // With each step recessed, the social terraces read all the way around the point.
  slab(0,.10,0,9.8,.20,4.85,'#616d6a');
  for (let i = 0; i < 6; i++) {
    slab(-i*.04,.245+i*.09,0,9.6-i*.22,.09,4.68-i*.12,i%2 ? '#ad9277' : '#b59f87');
  }

  const deck = .74;
  function shell(root: number, z: number, length: number, rise: number, halfSpan: number) {
    const point = (u: number, angle: number) => {
      const radius = Math.sin(u*Math.PI/2);
      const arch = Math.cos(angle);
      return new THREE.Vector3(
        root + length * (u*.44+radius*.56*arch),
        deck + .10 + rise * radius * arch,
        z + halfSpan * radius * Math.sin(angle)
      );
    };
    const positions: number[] = [], indices: number[] = [];
    const rows = 12, ribs = 16;
    for (let i = 0; i <= rows; i++) {
      for (let j = 0; j <= ribs; j++) {
        const p = point(Math.max(.002,i/rows), Math.PI*(j/ribs-.5));
        positions.push(p.x,p.y,p.z);
        if (i && j) {
          const d = i*(ribs+1)+j, a = d-ribs-2;
          if (length > 0) indices.push(a,a+1,d,a,d,d-1);
          else indices.push(a,d,a+1,a,d-1,d);
        }
      }
    }
    const surface = new THREE.BufferGeometry();
    surface.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    surface.setIndex(indices);
    surface.computeVertexNormals();
    paint(surface,'#eae5ce');

    // Warm sloped curtain wall set just inside the shell lip, divided into panes.
    const glass: number[] = [], face: number[] = [];
    for (let j = 0; j <= ribs; j++) {
      const angle = Math.PI*(j/ribs-.5);
      const lip = point(1,angle);
      const sill = new THREE.Vector3(root+length*.39, deck+.08, lip.z);
      const insetLip = lip.clone().add(new THREE.Vector3(-length*.018,-.045,0));
      glass.push(sill.x,sill.y,sill.z,insetLip.x,insetLip.y,insetLip.z);
      if (j) {
        const a = j*2-2;
        face.push(a,a+1,a+3,a,a+3,a+2);
        strut(point(1,angle-Math.PI/ribs),lip,.027,'#e0dcc6');
      }
      if (j%2===0 && j>0 && j<ribs) strut(sill,insetLip,.018,'#63584d');
      // Fine raised concrete seams converge at the foot of each vault.
      if (j%2 === 0) {
        for (let i = 1; i <= 6; i++)
          strut(point((i-1)/6, angle),point(i/6,angle),.016,'#c7c7b7');
      }
    }
    const panes = new THREE.BufferGeometry();
    panes.setAttribute('position',new THREE.Float32BufferAttribute(glass,3));
    panes.setIndex(face);
    panes.computeVertexNormals();
    paint(panes,'#e4aa71',glazing);
  }

  // Two offset performance halls and the Bennelong pavilion on the harbour side.
  shell(-3.55,-.81,2.50,2.20,1.04);
  shell(-2.34,-.81,2.70,3.02,1.10);
  shell(-.98,-.81,2.83,3.77,1.14);
  shell(3.18,-.81,-1.83,2.20,.97);
  shell(-2.70,1.07,2.04,1.74,.82);
  shell(-1.67,1.07,2.19,2.35,.87);
  shell(-.50,1.07,2.24,2.90,.88);
  shell(2.75,1.07,-1.50,1.77,.74);
  shell(4.17,.75,-1.20,1.06,.49);

  function finish(parts: THREE.BufferGeometry[], material: THREE.Material) {
    const geometry = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  finish(solid, new THREE.MeshStandardMaterial({
    vertexColors:true, roughness:.64, metalness:.12, side:THREE.DoubleSide
  }));
  finish(glazing, new THREE.MeshStandardMaterial({
    vertexColors:true, color:'#d6b59b', emissive:'#ac622e', emissiveIntensity:.60,
    roughness:.22, metalness:.35, side:THREE.DoubleSide
  }));
  return group;
}
