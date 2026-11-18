import * as THREE from 'three';

export function createSubmergedWater() {
  const group = new THREE.Group();
  const clock = { value: 0 };
  const waterColor = new THREE.Color('#0c3052');
  const vertex = `
    varying vec3 vWorld;
    void main() {
      vec4 wp = modelMatrix * vec4(position,1.);
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`;
  const ripples = `
    float waves(vec2 p, float t) {
      return sin(p.x * 1.8 + sin(p.y * 1.3 + t) + t)
           + .65 * cos(p.y * 2.1 + sin(p.x + t * .5) - t * .61);
    }
    float caustic(vec2 p, float t) {
      float a=abs(waves(p,t));
      float b=abs(waves(p.yx*.73+2.,t*.82));
      return pow(max(0., 1.-min(a,b)),16.);
    }`;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(124, 48, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { t: clock },
      vertexShader: vertex,
      fragmentShader: `
      uniform float t; varying vec3 vWorld;
      ${ripples}
      void main(){
        vec3 d = normalize(vWorld-cameraPosition);
        float up = smoothstep(-.32,.83,d.y);
        vec3 water = mix(vec3(.0037,.030,.084),vec3(.013,.090,.205),up);
        vec3 sun=normalize(vec3(-.50,.85,-.38));
        float light=max(0.,dot(d,sun));
        water+=vec3(.11,.30,.38)*pow(light,13.);
        vec2 uv = d.xz / max(.08, d.y) * 3.;
        water+=vec3(.025,.10,.12)*caustic(uv*3.2,t*.22)*smoothstep(.38,.86,d.y);
        gl_FragColor=vec4(water,1.);
        #include <colorspace_fragment>
      }`,
    }),
  );
  dome.renderOrder = -5;
  group.add(dome);

  const seabed = new THREE.Mesh(
    new THREE.PlaneGeometry(250, 250),
    new THREE.ShaderMaterial({
      uniforms: { t: clock, fogColor: { value: waterColor } },
      vertexShader: vertex,
      fragmentShader: `
      varying vec3 vWorld; uniform float t; uniform vec3 fogColor;
      ${ripples}
      float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.545);}
      void main(){
        vec2 p=vWorld.xz;
        float grain=hash(floor(p*37.));
        float ridge=sin(p.y*3.2+p.x*.55+1.8*sin(p.x*.43)+.25*sin(p.y*1.4));
        vec3 sand = mix(vec3(.018,.050,.074),vec3(.060,.118,.130),.5+.28*ridge+.20*grain);
        sand+=vec3(.020,.080,.085)*caustic(p*.85,t*.3);
        float haze=1.-exp(-length(cameraPosition-vWorld)*.032);
        gl_FragColor=vec4(mix(sand,fogColor,haze),1.);
        #include <colorspace_fragment>
      }`,
    }),
  );
  seabed.rotation.x = -Math.PI / 2;
  seabed.position.y = -3.04;
  group.add(seabed);
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(140, 140),
    new THREE.ShadowMaterial({ opacity: 0.38, color: 0x011322, depthWrite: false }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = -3.032;
  contact.receiveShadow = true;
  group.add(contact);
  // Fine suspended sediment gives the camera a visible near field as it swims.
  const sediment = new THREE.BufferGeometry();
  const motes = new Float32Array(310 * 3);
  for (let i = 0; i < 310; i++) {
    const jitter = (n: number) => THREE.MathUtils.euclideanModulo(Math.sin(i * 91.17 + n) * 43758.54, 1);
    motes[i * 3] = jitter(3) * 61 - 30;
    motes[i * 3 + 1] = jitter(7) * 25 - 2;
    motes[i * 3 + 2] = jitter(17) * 61 - 40;
  }
  sediment.setAttribute('position', new THREE.BufferAttribute(motes, 3));
  const dust = new THREE.Points(
    sediment,
    new THREE.ShaderMaterial({
      uniforms: { t: clock },
      transparent: true,
      depthWrite: false,
      vertexShader: `uniform float t; varying float alpha; void main(){
      vec3 p=position; p.x+=.20*sin(t*.22+p.z); p.y+=.31*sin(t*.17+p.x);
      vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
      gl_PointSize=clamp(14./max(1.,-mv.z),1.,3.); alpha=.36*exp(-max(0.,-mv.z)*.048);
    }`,
      fragmentShader: `varying float alpha; void main(){float r=length(gl_PointCoord-.5)*2.;
      gl_FragColor=vec4(.65,.90,.97,alpha*(1.-smoothstep(.25,1.,r)));}`,
    }),
  );
  group.add(dust);
  const beams = new THREE.BufferGeometry();
  const vertices: number[] = [],
    uv: number[] = [];
  for (let i = 0; i < 10; i++) {
    const x = -32 + i * 5.9,
      z = -31 + ((i * 13) % 28),
      w = 0.5 + (i % 3);
    const a = [x, 30, z],
      b = [x + w, 30, z],
      c = [x + 15 + w * 2, -3, z + 5],
      d = [x + 15, -3, z + 5];
    vertices.push(...a, ...d, ...b, ...b, ...d, ...c);
    uv.push(0, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 0);
  }
  beams.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  beams.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const light = new THREE.Mesh(
    beams,
    new THREE.ShaderMaterial({
      uniforms: { t: clock },
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader:
        'varying vec2 v; void main(){v=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `uniform float t; varying vec2 v; void main(){float s=sin(3.14159*v.x); float ray=s*s*sqrt(v.y)*(.8+.2*sin(t*.38+v.x*7.)); gl_FragColor=vec4(.34,.67,.76,ray*.049);}`,
    }),
  );
  group.add(light);
  return {
    group,
    update(time: number) {
      clock.value = time;
    },
  };
}
