import * as THREE from 'three';
import { mulberry } from './util.js';

function spriteTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createDust(scene, quality, reduced) {
  const sprite = spriteTexture();
  const rnd = mulberry(99);
  const n = quality === 'high' ? 280 : quality === 'mid' ? 170 : 70;
  const pos = new Float32Array(n * 3), rr = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 1.7;
    pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = rnd() * 4.5; pos[i * 3 + 2] = Math.sin(a) * r * 0.9 + 0.3;
    rr[i * 4] = rnd(); rr[i * 4 + 1] = 0.4 + rnd() * 0.8; rr[i * 4 + 2] = 0.008 + rnd() * rnd() * 0.03; rr[i * 4 + 3] = 0.4 + rnd() * 0.6;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(rr, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uPx: { value: 600 }, uTex: { value: sprite }, uColor: { value: new THREE.Color(0xffe3bd) },
      uLP: { value: new THREE.Vector3() }, uLD: { value: new THREE.Vector3(0, -1, 0) }, uTan: { value: 0.2 }, uAmt: { value: 1 },
    },
    vertexShader: `attribute vec4 aRand; uniform float uTime,uPx,uTan,uAmt; uniform vec3 uLP,uLD; varying float vA;
      void main(){
        vec3 p = position; float t = uTime*aRand.y;
        p += vec3(sin(t+aRand.x*6.28)*0.25, sin(t*0.7+aRand.x*17.0)*0.12, cos(t*0.8+aRand.x*9.0)*0.25);
        p.y = mod(p.y + uTime*0.03*aRand.y, 4.5);
        vec3 v = p - uLP; float al = dot(v,uLD); float perp = length(v - uLD*al);
        float cone = al > 0.0 ? 1.0 - smoothstep(0.5, 1.0, perp/(al*uTan+0.001)) : 0.0;
        float hf = smoothstep(0.0,0.5,p.y)*(1.0-smoothstep(3.6,4.5,p.y));
        vA = cone*hf*aRand.w*uAmt;
        vec4 mv = modelViewMatrix*vec4(p,1.0);
        gl_PointSize = aRand.z*uPx/max(0.1,-mv.z)*(vA>0.001?1.0:0.0);
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: `uniform sampler2D uTex; uniform vec3 uColor; varying float vA;
      void main(){ float a = texture2D(uTex, gl_PointCoord).a*vA; gl_FragColor = vec4(uColor*a, 1.0); }`,
  });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false; points.renderOrder = 3;
  scene.add(points);

  // puffs of dust on impact
  const PN = 120, PL = 1.6;
  const pp = new Float32Array(PN * 3), pv = new Float32Array(PN * 3), pb = new Float32Array(PN).fill(-100), ps = new Float32Array(PN);
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  pg.setAttribute('aVel', new THREE.BufferAttribute(pv, 3));
  pg.setAttribute('aBirth', new THREE.BufferAttribute(pb, 1));
  pg.setAttribute('aSize', new THREE.BufferAttribute(ps, 1));
  const pmat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uPx: { value: 600 }, uTex: { value: sprite }, uColor: { value: new THREE.Color(0x8a7a64) }, uAmt: { value: 1 } },
    vertexShader: `attribute vec3 aVel; attribute float aBirth, aSize; uniform float uTime,uPx; varying float vA;
      void main(){
        float age = uTime - aBirth; float L = ${PL.toFixed(2)};
        float ok = (age>0.0 && age<L) ? 1.0 : 0.0; float k = clamp(age/L,0.0,1.0);
        vec3 p = position + aVel*(1.0-exp(-age*3.2))/3.2 + vec3(0.0,0.12*age,0.0);
        vA = ok*pow(1.0-k,1.6)*0.5;
        vec4 mv = modelViewMatrix*vec4(p,1.0);
        gl_PointSize = aSize*(0.6+1.8*k)*uPx/max(0.1,-mv.z)*ok;
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: `uniform sampler2D uTex; uniform vec3 uColor; uniform float uAmt; varying float vA;
      void main(){ float a = texture2D(uTex, gl_PointCoord).a*vA*uAmt; gl_FragColor = vec4(uColor, a); }`,
  });
  const puffPts = new THREE.Points(pg, pmat);
  puffPts.frustumCulled = false; puffPts.renderOrder = 4;
  scene.add(puffPts);
  let cursor = 0, now = 0;
  const pr = mulberry(5);

  return {
    update(time, light, lightColor, px, amt) {
      now = time;
      mat.uniforms.uTime.value = reduced ? time * 0.15 : time;
      mat.uniforms.uLP.value.copy(light.pos); mat.uniforms.uLD.value.copy(light.dir); mat.uniforms.uTan.value = light.tan;
      mat.uniforms.uColor.value.copy(lightColor).multiplyScalar(0.8); mat.uniforms.uPx.value = px; mat.uniforms.uAmt.value = amt;
      pmat.uniforms.uTime.value = time; pmat.uniforms.uPx.value = px;
    },
    puff(x, y, z, strength = 1) {
      const c = Math.round((quality === 'low' ? 10 : 22) * strength);
      for (let k = 0; k < c; k++) {
        const i = cursor; cursor = (cursor + 1) % PN;
        const a = pr() * Math.PI * 2, sp = (0.25 + pr() * 0.55) * strength;
        pp[i * 3] = x + Math.cos(a) * 0.05; pp[i * 3 + 1] = y; pp[i * 3 + 2] = z + Math.sin(a) * 0.05;
        pv[i * 3] = Math.cos(a) * sp; pv[i * 3 + 1] = 0.1 + pr() * 0.2; pv[i * 3 + 2] = Math.sin(a) * sp;
        pb[i] = now; ps[i] = 0.06 + pr() * 0.07;
      }
      pg.attributes.position.needsUpdate = pg.attributes.aVel.needsUpdate = pg.attributes.aBirth.needsUpdate = pg.attributes.aSize.needsUpdate = true;
    },
    dispose() { scene.remove(points, puffPts); g.dispose(); pg.dispose(); mat.dispose(); pmat.dispose(); sprite.dispose(); },
  };
}
