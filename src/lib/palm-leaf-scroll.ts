import * as THREE from 'three';

export type PalmLeafScroll = {
  open(text: string, lang: string): void;
  close(onComplete: () => void): void;
  destroy(): void;
};

/** A textured leaf whose two ends physically wind around growing spiral coils. */
export function createPalmLeafScroll(canvas: HTMLCanvasElement): PalmLeafScroll | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch { return null; }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-320, 320, 155, -155, .1, 1400);
  camera.position.set(0, 25, 700);
  camera.lookAt(0, 0, 0);
  const group = new THREE.Group();
  group.rotation.z = -.025;
  group.rotation.x = -.06;
  scene.add(group);

  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = 2048; textureCanvas.height = 640;
  const context = textureCanvas.getContext('2d');
  const blankCanvas = document.createElement('canvas');
  blankCanvas.width = 2048; blankCanvas.height = 640;
  const blank = blankCanvas.getContext('2d');
  if (!context || !blank) { renderer.dispose(); return null; }
  let seed = 8217;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const fill = blank.createLinearGradient(0, 0, 0, 640);
  fill.addColorStop(0, '#a18a4e'); fill.addColorStop(.08, '#c5b374');
  fill.addColorStop(.42, '#ddd09b'); fill.addColorStop(.79, '#cbb97a'); fill.addColorStop(1, '#a58a4c');
  blank.fillStyle = fill; blank.fillRect(0, 0, 2048, 640);
  // Long, imperfect fibres retain the character of dried palm instead of parchment.
  for (let i = 0; i < 1250; i++) {
    const y = random() * 640;
    blank.beginPath(); blank.moveTo(-20, y);
    blank.bezierCurveTo(560, y + (random() - .5) * 9, 1480, y + (random() - .5) * 13, 2070, y + (random() - .5) * 9);
    blank.strokeStyle = i % 4 === 0 ? `rgba(250,237,183,${.025 + random() * .12})` : `rgba(90,75,29,${.018 + random() * .085})`;
    blank.lineWidth = .3 + random() * 1.1; blank.stroke();
  }
  for (let i = 0; i < 65; i++) {
    const x = random() * 2048, y = random() * 640, radius = 8 + random() * 95;
    const stain = blank.createRadialGradient(x, y, 0, x, y, radius);
    stain.addColorStop(0, `rgba(83,61,20,${.015 + random() * .07})`);
    stain.addColorStop(1, 'rgba(83,61,20,0)');
    blank.fillStyle = stain; blank.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  for (let i = 0; i < 9000; i++) {
    blank.fillStyle = random() > .5 ? '#3026130d' : '#fff1bf12';
    blank.fillRect(random() * 2048, random() * 640, .4 + random() * 2, .3 + random());
  }
  // Tiny fissures and worn margins; binding holes are dark and slightly frayed.
  blank.strokeStyle = '#725c3038'; blank.lineWidth = 1;
  for (let i = 0; i < 38; i++) {
    const x = random() * 2048, y = random() > .5 ? 7 : 633;
    blank.beginPath(); blank.moveTo(x, y); blank.lineTo(x + 10 + random() * 80, y + (y < 20 ? 1 : -1) * (1 + random() * 5)); blank.stroke();
  }
  for (const x of [135, 1913]) {
    blank.beginPath(); blank.ellipse(x, 320, 12, 10, .12, 0, Math.PI * 2);
    blank.fillStyle = '#5b4726'; blank.fill();
    blank.strokeStyle = '#b09455'; blank.lineWidth = 4; blank.stroke();
    blank.beginPath(); blank.ellipse(x, 320, 6, 5, .12, 0, Math.PI * 2);
    blank.fillStyle = '#332819'; blank.fill();
  }
  const texture = new THREE.CanvasTexture(textureCanvas);
  const backTexture = new THREE.CanvasTexture(blankCanvas);
  texture.colorSpace = backTexture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = backTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const geometry = new THREE.PlaneGeometry(560, 175, 384, 10);
  const positions = geometry.attributes.position as THREE.BufferAttribute;
  const original = new Float32Array(positions.array);
  const front = new THREE.MeshStandardMaterial({ map: texture, roughness: .91, metalness: 0, side: THREE.FrontSide, color: '#fff7e4' });
  const back = new THREE.MeshStandardMaterial({ map: backTexture, roughness: .96, side: THREE.BackSide, color: '#dfcd91' });
  // Fine fibre normal perturbation remains visible in the moving edge highlights.
  for (const material of [front, back]) {
    material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(normal + vec3(0.0, sin(vMapUv.y * 2100.0) * .026, 0.0));');
    };
    material.customProgramCacheKey = () => 'palm-leaf-fibres-v1';
  }
  const leafFront = new THREE.Mesh(geometry, front);
  const leafBack = new THREE.Mesh(geometry, back);
  leafFront.castShadow = true; leafFront.receiveShadow = true;
  leafBack.castShadow = true; leafBack.receiveShadow = true;
  group.add(leafFront, leafBack);
  const rimGeometry = new THREE.BufferGeometry();
  const rimPoints = new Float32Array((385 * 2) * 3);
  const rimIndices: number[] = [];
  for (let i = 0; i < 384; i++) rimIndices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  rimGeometry.setAttribute('position', new THREE.BufferAttribute(rimPoints, 3));
  rimGeometry.setIndex(rimIndices);
  const rimMaterial = new THREE.MeshStandardMaterial({ color: '#9b7c3f', roughness: .93, side: THREE.DoubleSide });
  const upperRim = new THREE.Mesh(rimGeometry, rimMaterial);
  const lowerRim = new THREE.Mesh(rimGeometry.clone(), rimMaterial);
  group.add(upperRim, lowerRim);

  const shadowMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uWidth: { value: .1 }, uOpacity: { value: .25 } }, vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}', fragmentShader: 'varying vec2 vUv;uniform float uWidth,uOpacity;void main(){vec2 p=(vUv-.5)*2.;float a=exp(-pow(p.x/max(uWidth,.08),6.)-p.y*p.y*5.);gl_FragColor=vec4(.05,.04,.025,a*uOpacity);}' });
  const shadowGeometry = new THREE.PlaneGeometry(650, 210);
  const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
  shadow.position.set(0, -13, -25); scene.add(shadow);
  scene.add(new THREE.HemisphereLight('#fff7df', '#685432', 2.15));
  const key = new THREE.DirectionalLight('#fff4d4', 2.5); key.position.set(-220, 210, 420);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -330; key.shadow.camera.right = 330;
  key.shadow.camera.top = 150; key.shadow.camera.bottom = -150;
  key.shadow.camera.near = 100; key.shadow.camera.far = 900;
  key.shadow.bias = -.00015; key.shadow.normalBias = .12;
  scene.add(key);
  const edgeLight = new THREE.DirectionalLight('#dde8dc', .65); edgeLight.position.set(320, 30, 190); scene.add(edgeLight);

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let progress = 0, target = 0, from = 0, start = 0, duration = 0;
  let frame = 0, destroyed = false, closing: (() => void) | undefined;
  let textValue = '', langValue = 'en', generation = 0;
  const deformPoint = (x: number, y: number, amount: number) => {
    const halfFlat = THREE.MathUtils.lerp(23, 269, amount);
    const distance = Math.max(0, Math.abs(x) - halfFlat);
    const radius = 15 + (1 - amount) * 2;
    const angle = distance / radius;
    const spiral = radius + angle * .105;
    const sx = distance > 0 ? halfFlat + Math.sin(angle) * spiral : Math.abs(x);
    const z = distance > 0 ? radius - Math.cos(angle) * spiral : 0;
    const edgeWear = (Math.sin(x * .29) + Math.sin(x * .81) * .42 + Math.sin(x * 1.76) * .19) * .33;
    return [Math.sign(x) * sx, y + Math.sign(y) * edgeWear * Math.pow(Math.abs(y) / 87.5, 8), z + Math.cos(x * .012) * .65] as const;
  };
  function shape(amount: number) {
    for (let i = 0; i < positions.count; i++) {
      const p = deformPoint(original[i * 3]!, original[i * 3 + 1]!, amount);
      positions.setXYZ(i, ...p);
    }
    positions.needsUpdate = true; geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    for (const [rim, sign] of [[upperRim, 1], [lowerRim, -1]] as const) {
      const attribute = rim.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i <= 384; i++) {
        const p = deformPoint(-280 + i / 384 * 560, sign * 87.5, amount);
        attribute.setXYZ(i * 2, p[0], p[1], p[2]);
        attribute.setXYZ(i * 2 + 1, p[0], p[1], p[2] - .72);
      }
      attribute.needsUpdate = true; rim.geometry.computeVertexNormals(); rim.geometry.computeBoundingSphere();
    }
    group.rotation.y = (1 - amount) * -.035;
    shadowMaterial.uniforms.uWidth!.value = .12 + amount * .8;
    shadowMaterial.uniforms.uOpacity!.value = .2 + amount * .05;
  }
  function drawTexture() {
    context!.clearRect(0, 0, 2048, 640);
    context!.drawImage(blankCanvas, 0, 0);
    const isHindi = langValue === 'hi';
    const compact = canvas.clientWidth > 0 && canvas.clientWidth < 480;
    const size = isHindi ? (compact ? 154 : 100) : (compact ? 176 : 141);
    context!.font = `400 ${size}px ${isHindi ? '"Noto Serif Devanagari"' : '"Birthstone"'}, serif`;
    context!.textAlign = 'center'; context!.textBaseline = 'middle';
    const words = textValue.split(/\s+/), lines: string[] = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && context!.measureText(next).width > (compact ? 1450 : 1570)) { lines.push(line); line = word; }
      else line = next;
    }
    if (line) lines.push(line);
    const spacing = compact ? (isHindi ? 175 : 190) : (isHindi ? 150 : 160);
    for (let i = 0; i < lines.length; i++) {
      const y = 318 + (i - (lines.length - 1) / 2) * spacing;
      context!.fillStyle = '#e1cd943b'; context!.fillText(lines[i]!, 1025, y + 1);
      context!.fillStyle = '#45351e'; context!.fillText(lines[i]!, 1024, y);
    }
    texture.needsUpdate = true;
  }
  function render() { if (!destroyed) renderer.render(scene, camera); }
  function resize() {
    if (destroyed) return;
    const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    const visibleWidth = 620;
    const visibleHeight = visibleWidth * height / width;
    camera.left = -visibleWidth / 2; camera.right = visibleWidth / 2;
    camera.top = visibleHeight / 2; camera.bottom = -visibleHeight / 2;
    camera.updateProjectionMatrix();
    if (textValue) drawTexture();
    render();
  }
  function tick(now: number) {
    if (destroyed) return;
    const t = Math.min(1, (now - start) / duration);
    const eased = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    progress = THREE.MathUtils.lerp(from, target, eased);
    shape(progress); render();
    if (t < 1) frame = requestAnimationFrame(tick);
    else { frame = 0; const done = closing; closing = undefined; done?.(); }
  }
  function animate(value: number, done?: () => void) {
    cancelAnimationFrame(frame); frame = 0; closing = done; from = progress; target = value;
    if (motion.matches) { progress = value; shape(progress); render(); closing = undefined; done?.(); return; }
    start = performance.now(); duration = value === 1 ? 1450 : 780;
    frame = requestAnimationFrame(tick);
  }
  function motionChanged() { if (motion.matches && frame) animate(target, closing); }
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  motion.addEventListener('change', motionChanged);
  shape(0); resize();
  return {
    open(text, lang) {
      if (destroyed) return;
      const current = ++generation;
      textValue = text; langValue = lang; progress = 0;
      drawTexture(); shape(0); resize(); animate(1);
      const font = lang === 'hi' ? '30px "Noto Serif Devanagari"' : '40px "Birthstone"';
      document.fonts.load(font).then(() => { if (!destroyed && current === generation) { drawTexture(); render(); } });
    },
    close(onComplete) { if (destroyed) { onComplete(); return; } ++generation; animate(0, onComplete); },
    destroy() {
      if (destroyed) return; destroyed = true; ++generation; cancelAnimationFrame(frame);
      observer.disconnect(); motion.removeEventListener('change', motionChanged);
      geometry.dispose(); upperRim.geometry.dispose(); lowerRim.geometry.dispose();
      front.dispose(); back.dispose(); rimMaterial.dispose(); shadowMaterial.dispose(); shadowGeometry.dispose();
      texture.dispose(); backTexture.dispose(); key.shadow.dispose(); renderer.dispose();
      closing = undefined;
    },
  };
}
