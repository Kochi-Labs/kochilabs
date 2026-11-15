import * as THREE from 'three';

/** The train travels right, so its leftmost carriage is the last one. */
export function createMetroPassenger(train: THREE.Group) {
  const carriage = train.children
    .filter((child): child is THREE.Group => child instanceof THREE.Group)
    .sort((a, b) => a.position.x - b.position.x)[0];
  if (!carriage) throw new Error('A metro carriage is required for its passenger.');

  const group = new THREE.Group();
  group.name = 'The last metro passenger';
  // This is the rear carriage's second window: x=-18, y=16..24.8.
  group.position.set(-18, 16.35, 11.65);
  group.visible = false;
  carriage.add(group);
  const geometry = new Set<THREE.BufferGeometry>();
  const skin = new THREE.MeshBasicMaterial({ color: '#d2df87', depthWrite: false });
  const belly = new THREE.MeshBasicMaterial({ color: '#f2e5a3', depthWrite: false });
  const ink = new THREE.MeshBasicMaterial({ color: '#233d38', depthWrite: false });
  const colors = [skin, belly, ink].map((material) => ({
    material,
    day: material.color.clone(),
    // A softly lit passenger remains legible against the warm night window.
    night: material.color.clone().multiply(new THREE.Color('#d5c795')),
  }));

  function shape(points: number[][], material: THREE.MeshBasicMaterial, parent: THREE.Group = group, z = 0) {
    const outline = new THREE.Shape();
    points.forEach(([x, y], index) => index ? outline.lineTo(x!, y!) : outline.moveTo(x!, y!));
    outline.closePath();
    const meshGeometry = new THREE.ShapeGeometry(outline);
    geometry.add(meshGeometry);
    const mesh = new THREE.Mesh(meshGeometry, material);
    mesh.position.z = z;
    parent.add(mesh);
    return mesh;
  }

  // A tiny, recognisable T-rex profile, entirely contained by the painted window.
  shape([[-1.5, .3], [1.7, .3], [1.7, 2.5], [1, 3.7], [1, 4.5], [3.7, 4.5], [3.7, 6.2],
    [2.7, 7.7], [-.7, 7.7], [-1.5, 6.7], [-1.5, 4], [-2.4, 2.7], [-4.6, 3.8], [-3.8, 1.6], [-1.5, 1]], skin);
  shape([[-.8, .5], [.9, .5], [.9, 2.5], [.1, 3.5], [-.8, 2.3]], belly, group, .02);
  shape([[2, 6.4], [2.65, 6.4], [2.65, 7.05], [2, 7.05]], ink, group, .04);
  shape([[2.45, 4.8], [3.75, 4.8], [3.75, 5.05], [2.45, 5.05]], ink, group, .04);

  const arm = new THREE.Group();
  arm.position.set(1.1, 3.05, .08);
  group.add(arm);
  shape([[0, -.3], [1.1, -.25], [2, 1.45], [1.4, 1.95], [.55, .55], [0, .45]], skin, arm);
  shape([[1.35, 1.55], [1.55, 2.35], [1.95, 2.35], [2.05, 1.6]], belly, arm, .02);

  let clicks = 0;
  let revealed = false;
  let reveal = 0;
  let waveTime = 0;
  let destroyed = false;

  return {
    group,
    get revealed() { return revealed; },
    get tapCount() { return clicks; },
    /** Pass the actual raycast mesh; other carriages never count toward the secret. */
    hitTest(object: THREE.Object3D) {
      let ancestor: THREE.Object3D | null = object;
      while (ancestor && ancestor !== train) {
        if (ancestor === carriage) return true;
        ancestor = ancestor.parent;
      }
      return false;
    },
    /** Returns true only when the third tap discovers the passenger. */
    tap() {
      if (destroyed) return false;
      clicks = Math.min(3, clicks + 1);
      waveTime = 0;
      if (clicks === 3 && !revealed) {
        revealed = true;
        group.visible = true;
        return true;
      }
      return false;
    },
    update(dt: number, night: number, reducedMotion: boolean) {
      if (destroyed) return;
      const step = THREE.MathUtils.clamp(dt, 0, .1);
      colors.forEach(({ material, day, night: afterDark }) => material.color.copy(day).lerp(afterDark, THREE.MathUtils.clamp(night, 0, 1)));
      if (!revealed) return;
      reveal = reducedMotion ? 1 : Math.min(1, reveal + step * 4.5);
      // Reveal upward from the sill without drawing outside the window.
      group.scale.y = reveal * reveal * (3 - 2 * reveal);
      waveTime += step;
      const envelope = waveTime < 5 ? 1 : .35;
      arm.rotation.z = reducedMotion ? -.25 : -.25 + Math.sin(waveTime * 8) * .48 * envelope;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      group.removeFromParent();
      geometry.forEach((item) => item.dispose());
      colors.forEach(({ material }) => material.dispose());
    },
  };
}
