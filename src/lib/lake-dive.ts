import * as THREE from 'three';

/** Sample the actual surface render through a moving air/water boundary as the lens submerges. */
export function createLakeLens(renderer: THREE.WebGLRenderer) {
  const color = new THREE.WebGLRenderTarget(1, 1, { colorSpace: THREE.SRGBColorSpace });
  const size = new THREE.Vector2();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      surface: { value: color.texture },
      phase: { value: 0 },
      seconds: { value: 0 },
      night: { value: 0 },
      aspect: { value: 1 },
    },
    depthWrite: false,
    depthTest: false,
    vertexShader: `
      varying vec2 uvLens;
      void main() {
        uvLens = uv;
        gl_Position = vec4(position.xy, 0., 1.);
      }`,
    fragmentShader: `
      uniform sampler2D surface;
      uniform float phase, seconds, night, aspect;
      varying vec2 uvLens;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(31.14, 79.39))) * 9437.75); }
      void main() {
        vec2 p = uvLens;
        float t = seconds;
        float edge = mix(-.11, 1.12, phase);
        float wobble = .022 * sin(9.0*p.x + 1.3*t) + .012 * sin(20.0*p.x - 1.8*t + .4);
        float d = edge + wobble - p.y;
        float wet = smoothstep(-.006, .006, d);
        float lens = exp(-abs(d) * 38.);
        vec2 uv = p;
        uv.x += wet * (.003 + .012*lens) * sin(14.*p.y + 1.4*t);
        uv.y += wet * .006 * sin(13.*p.x - .7*t) + lens * .032 * cos(8.*p.x + t);
        vec3 scene = texture2D(surface, clamp(uv, .001, .999)).rgb;
        vec3 blue = mix(vec3(.0018, .039, .074), vec3(.0009, .009, .03), night);
        float absorption = smoothstep(0., .62, d);
        vec3 water = mix(scene * vec3(.40, .79, .87), blue, .17 + .82*absorption);
        float shafts = pow(.5+.5*sin(p.x*11.0 + p.y*4.0 + .21*sin(t*.3)), 7.);
        water += vec3(.001, .011, .015) * shafts * (1.-night*.8);

        // Small entrained air bubbles follow the lens upward through the surface.
        vec2 cell = vec2(p.x * aspect, p.y - .09*t - .56*phase) * 8.;
        vec2 id = floor(cell);
        vec2 center = vec2(hash(id), hash(id + 9.)) * .66 + .17;
        vec2 delta = fract(cell) - center;
        float radius = .032 + .055 * hash(id+42.);
        float ring = 1. - smoothstep(.004, .022, abs(length(delta) - radius));
        float glint = smoothstep(-.7, .9, dot(delta/max(radius,.001), vec2(-.55,.83)));
        water += vec3(.09, .3, .32) * ring * glint * step(.76, hash(id+72.)) * smoothstep(.03,.22,d);
        vec3 result = mix(scene, water, wet);
        result += vec3(.10,.25,.23) * exp(-abs(d)*440.) * (1.-.82*night);
        gl_FragColor = vec4(result, 1.);
        #include <colorspace_fragment>
      }`,
  });
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);
  return {
    render(surface: THREE.Scene, surfaceCamera: THREE.Camera, phase: number, seconds: number, night: number) {
      renderer.getDrawingBufferSize(size);
      // The underwater refraction is soft; avoid supersampling this temporary target.
      const scale = Math.min(1, 1536 / Math.max(size.x, size.y));
      color.setSize(Math.max(1, Math.round(size.x * scale)), Math.max(1, Math.round(size.y * scale)));
      material.uniforms.phase!.value = phase;
      material.uniforms.seconds!.value = seconds;
      material.uniforms.night!.value = night;
      material.uniforms.aspect!.value = size.x / Math.max(size.y, 1);
      renderer.setRenderTarget(color);
      renderer.render(surface, surfaceCamera);
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
    destroy() { color.dispose(); material.dispose(); quad.geometry.dispose(); },
  };
}
