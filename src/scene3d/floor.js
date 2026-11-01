import * as THREE from 'three';
import { glslNoise } from './noise.js';
import { mulberry } from './util.js';

export function createFloor(quality) {
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(70, 70, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0x75654f, roughness: 0.96, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWP;\n${glslNoise}
float sandH(vec2 p){
  float r = sin((p.x*0.8 + p.y*1.4)*4.0 + fbm3(vec3(p*0.9,1.0))*7.0)*0.5+0.5;
  return vnoise(vec3(p*55.0,1.0))*0.45 + vnoise(vec3(p*12.0,2.0))*0.4 + r*0.55;
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float big = fbm3(vec3(vWP.xz*0.35, 4.0));
  float g = vnoise(vec3(vWP.xz*90.0, 7.0));
  float rip = sandH(vWP.xz);
  diffuseColor.rgb *= (0.62 + 0.5*big) * (0.86 + 0.22*rip) * (0.93 + 0.1*g);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(1.0,0.9,0.78), big);
}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  float fade = 1.0 - smoothstep(3.0, 11.0, length(vViewPosition));
  float e = 0.012; float h0 = sandH(vWP.xz);
  float gx = (sandH(vWP.xz+vec2(e,0.0))-h0)/e; float gz = (sandH(vWP.xz+vec2(0.0,e))-h0)/e;
  vec3 gW = vec3(-gx,0.0,-gz) * 0.035 * fade;
  normal = normalize(normal + (viewMatrix*vec4(gW,0.0)).xyz);
}`);
  };
  const floor = new THREE.Mesh(geo, mat);
  floor.receiveShadow = true;
  group.add(floor);

  // scattered pebbles
  const rnd = mulberry(7);
  const pg = new THREE.IcosahedronGeometry(1, 1);
  const pm = new THREE.MeshStandardMaterial({ color: 0x5d5249, roughness: 0.9, flatShading: true });
  const count = quality === 'low' ? 18 : 46;
  const inst = new THREE.InstancedMesh(pg, pm, count);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2, r = 1.2 + Math.pow(rnd(), 0.8) * 6;
    const sz = 0.02 + rnd() * 0.07;
    p.set(Math.cos(a) * r, sz * 0.3, Math.sin(a) * r * 0.8 + 0.4);
    e.set(rnd() * 3, rnd() * 3, rnd() * 3); q.setFromEuler(e);
    s.set(sz * (1 + rnd() * 0.6), sz * 0.6, sz * (1 + rnd() * 0.6));
    m4.compose(p, q, s); inst.setMatrixAt(i, m4);
  }
  inst.castShadow = quality !== 'low'; inst.receiveShadow = true;
  group.add(inst);

  return { group, dispose() { geo.dispose(); mat.dispose(); pg.dispose(); pm.dispose(); inst.dispose(); } };
}
