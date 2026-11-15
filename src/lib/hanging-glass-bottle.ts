import * as THREE from 'three';

/** A small lit glass object; the existing SVG rope remains its attachment. */
export function createHangingGlassBottle(button: HTMLButtonElement) {
  const canvas = document.createElement('canvas');
  canvas.className = 'bottle-glass-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' }); }
  catch { return () => {}; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .95;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-32, 32, 72, -72, .1, 500);
  camera.position.set(0, 72, 220);
  camera.lookAt(0, 72, 0);
  const bottle = new THREE.Group();
  scene.add(bottle);
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = bottle) {
    geometries.add(geometry); materials.add(material);
    const object = new THREE.Mesh(geometry, material);
    parent.add(object); return object;
  }
  function surface(kind: 'cork' | 'leaf') {
    const image = document.createElement('canvas'); image.width = 256; image.height = 256;
    const ctx = image.getContext('2d')!;
    ctx.fillStyle = kind === 'cork' ? '#ad8b5f' : '#d5bc79'; ctx.fillRect(0, 0, 256, 256);
    let seed = 91;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 1800; i++) {
      ctx.fillStyle = random() > .5 ? '#58412235' : '#fff1bd42';
      ctx.fillRect(random() * 256, random() * 256, kind === 'leaf' ? 20 + random() * 70 : 1 + random() * 3, .4 + random() * 1.8);
    }
    if (kind === 'leaf') {
      ctx.font = 'italic 15px serif'; ctx.fillStyle = '#584021';
      for (let i = 0; i < 5; i++) ctx.fillText(['Good things', 'take their own', 'sweet time.'][i % 3]!, 32, 50 + i * 33);
    }
    const texture = new THREE.CanvasTexture(image); texture.colorSpace = THREE.SRGBColorSpace;
    textures.add(texture); return texture;
  }
  const studio = document.createElement('canvas'); studio.width = 512; studio.height = 256;
  const ctx = studio.getContext('2d')!;
  const sky = ctx.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#e6efed'); sky.addColorStop(.5, '#779b92'); sky.addColorStop(1, '#233a31');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(72, 30, 22, 145); ctx.fillRect(340, 45, 65, 110);
  ctx.fillStyle = '#ffe4b0'; ctx.fillRect(180, 80, 12, 80);
  const environment = new THREE.CanvasTexture(studio); environment.mapping = THREE.EquirectangularReflectionMapping; environment.colorSpace = THREE.SRGBColorSpace;
  textures.add(environment);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentTarget = pmrem.fromEquirectangular(environment);
  scene.environment = environmentTarget.texture;
  pmrem.dispose();
  const profile = [[0, 7], [13, 7], [17, 9], [19, 14], [19, 54], [18, 62], [14, 68], [8, 76], [7, 82], [7, 95], [8, 96], [8, 100], [5.8, 100], [5.8, 94]].map(([r, y]) => new THREE.Vector2(r!, y!));
  const glass = new THREE.MeshPhysicalMaterial({ color: '#78a995', roughness: .075, metalness: .04, clearcoat: 1, clearcoatRoughness: .05, ior: 1.48, transparent: true, opacity: .36, envMapIntensity: .85, depthWrite: false, side: THREE.FrontSide });
  mesh(new THREE.LatheGeometry(profile, 48), glass);
  const innerGlass = new THREE.MeshPhysicalMaterial({ color: '#497c67', roughness: .12, metalness: .02, transparent: true, opacity: .22, envMapIntensity: .55, depthWrite: false, side: THREE.BackSide });
  mesh(new THREE.LatheGeometry(profile, 48), innerGlass);
  const bottom = mesh(new THREE.TorusGeometry(15.6, 2, 10, 48), glass); bottom.rotation.x = Math.PI / 2; bottom.position.y = 11;
  const lip = mesh(new THREE.TorusGeometry(7, 1.2, 10, 32), glass); lip.rotation.x = Math.PI / 2; lip.position.y = 98;
  const corkTexture = surface('cork');
  const cork = mesh(new THREE.CylinderGeometry(6.1, 5.9, 11, 28), new THREE.MeshStandardMaterial({ color: '#ac895b', map: corkTexture, bumpMap: corkTexture, bumpScale: .35, roughness: .95 })); cork.position.y = 103;
  const paperTexture = surface('leaf');
  const paper = mesh(new THREE.CylinderGeometry(5.6, 5.8, 46, 32), new THREE.MeshStandardMaterial({ map: paperTexture, bumpMap: paperTexture, bumpScale: .16, roughness: .91, color: '#be9e62' }));
  paper.position.set(1, 39, 1); paper.rotation.z = .16;
  const cut = mesh(new THREE.TorusGeometry(4.3, .42, 5, 28), new THREE.MeshStandardMaterial({ color: '#8b713e', roughness: 1 })); cut.rotation.x = Math.PI / 2; cut.position.set(-2.6, 61.8, 1);
  const light = new THREE.HemisphereLight('#f0f8ff', '#668a73', 2.4); scene.add(light);
  const key = new THREE.DirectionalLight('#fff1d6', 3); key.position.set(-70, 130, 100); scene.add(key);
  const edge = new THREE.DirectionalLight('#d3edff', 2.5); edge.position.set(65, 50, -80); scene.add(edge);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0, disposed = false, night = false;
  function render(time = 0) {
    if (disposed) return;
    bottle.rotation.y = motion.matches ? -.14 : -.14 + Math.sin(time * .0005) * .12;
    renderer.render(scene, camera);
    if (!document.hidden && !motion.matches) frame = requestAnimationFrame(render);
  }
  function refresh() {
    cancelAnimationFrame(frame);
    night = document.body.dataset.time === 'night';
    light.intensity = night ? 1.1 : 1.7; key.intensity = night ? 1.2 : 2.2;
    renderer.toneMappingExposure = night ? .8 : .95;
    render(performance.now());
  }
  function resize() {
    const bounds = button.getBoundingClientRect();
    renderer.setSize(Math.max(bounds.width, 1), Math.max(bounds.height, 1), false);
    refresh();
  }
  button.append(canvas); button.dataset.glass = 'ready';
  const observer = new ResizeObserver(resize); observer.observe(button);
  const nightObserver = new MutationObserver(refresh); nightObserver.observe(document.body, { attributes: true, attributeFilter: ['data-time'] });
  document.addEventListener('visibilitychange', refresh); motion.addEventListener('change', refresh);
  resize();
  return () => {
    disposed = true; cancelAnimationFrame(frame); observer.disconnect(); nightObserver.disconnect();
    document.removeEventListener('visibilitychange', refresh); motion.removeEventListener('change', refresh);
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
    environmentTarget.dispose(); renderer.dispose(); canvas.remove(); delete button.dataset.glass;
  };
}
