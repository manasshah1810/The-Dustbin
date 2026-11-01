import * as THREE from 'three';

export function createLights(scene, quality) {
  const hemi = new THREE.HemisphereLight(0x2a2f38, 0x15110e, 0.1);
  scene.add(hemi);
  const spot = new THREE.SpotLight(0xffe3bd, 90, 0, 0.21, 0.85, 2);
  spot.position.set(0.4, 5.2, 1.4);
  spot.target.position.set(0, 0.75, 0);
  scene.add(spot, spot.target);
  if (quality !== 'low') {
    spot.castShadow = true;
    const ms = quality === 'high' ? 2048 : 1024;
    spot.shadow.mapSize.set(ms, ms);
    spot.shadow.camera.near = 1.5; spot.shadow.camera.far = 12;
    spot.shadow.bias = -0.0004; spot.shadow.normalBias = 0.02; spot.shadow.radius = 4;
  }

  // additive light shaft: open cone, apex at the lamp
  const cg = new THREE.ConeGeometry(1, 1, 56, 1, true);
  cg.translate(0, -0.5, 0);
  const shaftMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uOp: { value: 0.2 }, uColor: { value: new THREE.Color(0xffe3bd) }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vL;
      void main(){ vUv=uv; vL=position; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vV=mv.xyz; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform float uOp; uniform vec3 uColor; uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vL;
      void main(){
        float f = abs(dot(normalize(vN), normalize(-vV)));
        float edge = pow(f, 1.6);
        float t = 1.0 - vUv.y;
        float a = smoothstep(0.0, 0.3, t) * (1.0 - 0.85*smoothstep(0.55, 1.0, t));
        float ang = atan(vL.x, vL.z);
        float shimmer = 0.94 + 0.06*sin(ang*5.0 + uTime*0.25 + t*3.0);
        gl_FragColor = vec4(uColor * edge * a * shimmer * uOp, 1.0);
      }`,
  });
  const shaft = new THREE.Mesh(cg, shaftMat);
  shaft.frustumCulled = false; shaft.renderOrder = 2;
  scene.add(shaft);

  const dir = new THREE.Vector3(), up = new THREE.Vector3(0, -1, 0);
  const api = {
    spot, hemi, shaft, dir,
    update(s, time, sway) {
      spot.color.copy(s.spotColor); spot.intensity = s.spotI * (1 + sway.i);
      spot.angle = s.angle; spot.penumbra = s.pen;
      spot.position.set(s.sx + sway.x, s.sy, s.sz);
      hemi.color.copy(s.ambColor); hemi.intensity = s.ambI;
      dir.copy(spot.target.position).sub(spot.position).normalize();
      const L = spot.position.y / Math.max(0.2, -dir.y);
      shaft.position.copy(spot.position);
      shaft.quaternion.setFromUnitVectors(up, dir);
      const r = Math.tan(s.angle) * L * 0.92;
      shaft.scale.set(r, L, r);
      shaftMat.uniforms.uOp.value = s.shaft; shaftMat.uniforms.uColor.value.copy(s.spotColor); shaftMat.uniforms.uTime.value = time;
    },
    dispose() { cg.dispose(); shaftMat.dispose(); spot.shadow.map && spot.shadow.map.dispose(); },
  };
  return api;
}
