import * as THREE from 'three';
import { noise3 } from './noise.js';

const H = 1.25;
const rAt = (y) => 0.4 + 0.12 * (y / H) + 0.012 * Math.sin(Math.PI * y / H);

function dent(v) {
  const r = Math.hypot(v.x, v.z);
  if (r < 0.02) return;
  const n = (noise3(v.x * 2.4 + 3, v.y * 2.4, v.z * 2.4) - 0.5) * 0.05 + (noise3(v.x * 7, v.y * 7, v.z * 7) - 0.5) * 0.012;
  // one bigger dent, low on the front-right
  const a = Math.atan2(v.x, v.z), da = Math.atan2(Math.sin(a - 0.7), Math.cos(a - 0.7));
  const g = Math.exp(-(da * da) / 0.12 - Math.pow((v.y - 0.55) / 0.22, 2));
  const d = n - 0.04 * g;
  v.x += (v.x / r) * d; v.z += (v.z / r) * d;
}

export function createBin(quality) {
  const group = new THREE.Group();
  const seg = quality === 'low' ? 40 : 72;
  const pts = [];
  const N = 26;
  pts.push(new THREE.Vector2(0.0, 0.05));
  pts.push(new THREE.Vector2(rAt(0.05) - 0.02, 0.05));
  for (let i = 0; i <= N; i++) { const y = 0.05 + (H - 0.02 - 0.05) * (i / N); pts.push(new THREE.Vector2(rAt(y) - 0.022, y)); }
  const innerN = pts.length;
  for (let i = N; i >= 0; i--) { const y = 0.0 + (H - 0.02) * (i / N); pts.push(new THREE.Vector2(rAt(y) + 0.004, y)); }
  pts.push(new THREE.Vector2(0.2, 0.0));
  pts.push(new THREE.Vector2(0.0, 0.0));

  const geo = new THREE.LatheGeometry(pts, seg);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  const per = pts.length;
  for (let i = 0; i < pos.count; i++) {
    const j = i % per;
    v.fromBufferAttribute(pos, i);
    const y = v.y;
    let s;
    if (j < innerN) s = 0.04 + 0.42 * Math.pow(y / H, 1.6);
    else s = 0.55 + 0.45 * Math.min(1, y / 0.5) - 0.12 * noise3(v.x * 5, v.y * 5, v.z * 5);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = s;
    dent(v);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: 0x8a8d88, metalness: quality === 'low' ? 0.3 : 0.7, roughness: 0.52, vertexColors: true, side: THREE.DoubleSide,
    emissive: new THREE.Color(0xe8a33d), emissiveIntensity: 0,
  });
  const body = new THREE.Mesh(geo, mat);
  body.castShadow = true; body.receiveShadow = true;
  group.add(body);

  const partMat = new THREE.MeshStandardMaterial({ color: 0x8f918c, metalness: quality === 'low' ? 0.3 : 0.7, roughness: 0.45 });
  const geos = [geo];
  const addTorus = (r, y, tube) => {
    const g = new THREE.TorusGeometry(r, tube, 10, seg);
    g.rotateX(Math.PI / 2); g.translate(0, y, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); dent(v); p.setXYZ(i, v.x, v.y, v.z); }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, partMat); m.castShadow = true; m.receiveShadow = true;
    group.add(m); geos.push(g);
  };
  addTorus(rAt(H - 0.02) - 0.012, H - 0.005, 0.03);  // rolled rim
  addTorus(rAt(0.38) + 0.006, 0.38, 0.014);
  addTorus(rAt(0.82) + 0.006, 0.82, 0.014);
  addTorus(rAt(0.04) + 0.004, 0.04, 0.02);

  // two small side handles
  const hg = new THREE.TorusGeometry(0.07, 0.012, 8, 20, Math.PI);
  geos.push(hg);
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(hg, partMat);
    m.position.set(s * (rAt(1.0) + 0.01), 1.0, 0); m.rotation.set(0, Math.PI / 2, s > 0 ? -Math.PI / 2 : Math.PI / 2);
    m.castShadow = true; group.add(m);
  }
  group.rotation.y = Math.PI; // lathe seam to the back

  return {
    group, height: H, topY: H,
    setGlow(a) { mat.emissiveIntensity = a; },
    dispose() { geos.forEach((g) => g.dispose()); mat.dispose(); partMat.dispose(); },
  };
}
