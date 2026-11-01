import * as THREE from 'three';
import { noise3 } from './noise.js';

// A tired galvanised-steel dustbin: one continuous lathed profile (rolled rim, pressed ribs,
// rounded foot, inner wall), dents in the sheet, and painted-on wear: zinc spangle, grime, rust, scratches.
const H = 1.25;
const rBase = (y) => 0.4 + 0.12 * (y / H);
// pressed-in ribs: gentle gaussian grooves
const rib = (y, c, w = 0.022, d = 0.014) => d * Math.exp(-Math.pow((y - c) / w, 2));
const RIBS = [0.34, 0.37, 0.8, 0.83];
const rOuter = (y) => rBase(y) - RIBS.reduce((s, c) => s - 0 + rib(y, c), 0) + 0.006 * Math.sin((Math.PI * y) / H);
const RIM_R = 0.017;

function dent(v) {
  const r = Math.hypot(v.x, v.z);
  if (r < 0.02) return;
  const n = (noise3(v.x * 2.2 + 3, v.y * 2.2, v.z * 2.2) - 0.5) * 0.028 + (noise3(v.x * 6.5, v.y * 6.5, v.z * 6.5) - 0.5) * 0.01;
  const a = Math.atan2(v.x, v.z);
  const bump = (a0, y0, ay, ar, depth) => {
    const da = Math.atan2(Math.sin(a - a0), Math.cos(a - a0));
    return depth * Math.exp(-(da * da) / ar - Math.pow((v.y - y0) / ay, 2));
  };
  const d = n - bump(0.7, 0.55, 0.2, 0.1, 0.045) - bump(-1.9, 0.95, 0.13, 0.07, 0.03) - bump(2.6, 0.3, 0.1, 0.05, 0.022);
  v.x += (v.x / r) * d; v.z += (v.z / r) * d;
}

// ---- tileable value noise for the textures (wraps in u) ----
function mkNoise(seed) {
  const T = 256, tab = new Float32Array(T * T);
  let s = seed >>> 0;
  for (let i = 0; i < tab.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; tab[i] = s / 4294967296; }
  return (x, y, px) => { // px = period in x (integer)
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const m = (a) => ((a % px) + px) % px, my = (b) => ((b % T) + T) % T;
    const a = tab[my(iy) * T + (m(ix) & 255)], b = tab[my(iy) * T + (m(ix + 1) & 255)];
    const c = tab[my(iy + 1) * T + (m(ix) & 255)], d = tab[my(iy + 1) * T + (m(ix + 1) & 255)];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

function paintMaps(S, ySamples, quality) {
  const W = S, Hh = S;
  const mkC = () => { const c = document.createElement('canvas'); c.width = W; c.height = Hh; return c; };
  const cA = mkC(), cO = mkC(), cB = mkC();
  const gA = cA.getContext('2d'), gO = cO.getContext('2d'), gB = cB.getContext('2d');
  const iA = gA.createImageData(W, Hh), iO = gO.createImageData(W, Hh), iB = gB.createImageData(W, Hh);
  const n1 = mkNoise(11), n2 = mkNoise(53), n3 = mkNoise(97);
  const fb = (n, x, y, p, oct) => { let a = 0.5, s = 0, f = 1; for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f, p * f); f *= 2; a *= 0.5; } return s; };
  for (let j = 0; j < Hh; j++) {
    const v = j / (Hh - 1);              // 0 = bottom foot, 1 = top rim
    const y = ySamples(v);               // world height for this row
    const ny = y / H;
    let ribD = 0;
    for (const c of RIBS) ribD = Math.max(ribD, Math.exp(-Math.pow((y - c) / 0.05, 2)));
    for (let i = 0; i < W; i++) {
      const u = i / W;
      const k = (j * W + i) * 4;
      // zinc spangle: broad mottling + crisp tiny crystals
      const mott = fb(n1, u * 6, v * 8, 6, 4);
      const crystal = n2(u * 90, v * 90, 90);
      const grain = n3(u * 420, v * 420, 420);
      // vertical drip streaks, heavier toward the foot
      const streak = fb(n2, u * 46, v * 2.2, 46, 3);
      const streakAmt = Math.pow(Math.max(0, streak - 0.42) * 2.4, 1.2) * (0.35 + 0.65 * (1 - ny));
      // grime gathers low and in the ribs
      const grime = Math.min(1, 0.12 + 0.55 * Math.pow(1 - ny, 2.2) + 0.28 * ribD + 0.5 * streakAmt) * (0.6 + 0.8 * fb(n3, u * 10, v * 10, 10, 3));
      // rust: blotchy, low, at the foot, along ribs and the lip
      const rn = fb(n1, u * 14 + 3, v * 14, 14, 4);
      const lip = Math.exp(-Math.pow((v - 1) / 0.035, 2)) * 0.5;
      const foot = Math.exp(-Math.pow(v / 0.07, 2)) * 0.9;
      const rust = Math.max(0, Math.min(1, (rn - (0.74 - foot * 0.22 - lip * 0.12 - ribD * 0.05 - 0.1 * (1 - ny))) * 4.0)) * 0.75;
      let L = 0.2 + 0.09 * (mott - 0.5) + 0.07 * (crystal - 0.5) + 0.03 * (grain - 0.5);
      let r = L * 0.95, g = L * 1.0, b = L * 1.08;
      // grime: warm dark brown-grey
      const gm = grime * 0.82;
      r = r * (1 - gm) + 0.12 * gm; g = g * (1 - gm) + 0.105 * gm; b = b * (1 - gm) + 0.09 * gm;
      // rust
      const rr = 0.2 + 0.1 * n2(u * 60, v * 60, 60);
      r = r * (1 - rust) + rr * rust; g = g * (1 - rust) + rr * 0.38 * rust; b = b * (1 - rust) + rr * 0.14 * rust;
      iA.data[k] = Math.pow(Math.min(1, r), 1 / 2.2) * 255; iA.data[k + 1] = Math.pow(Math.min(1, g), 1 / 2.2) * 255; iA.data[k + 2] = Math.pow(Math.min(1, b), 1 / 2.2) * 255; iA.data[k + 3] = 255;
      // ORM: G roughness, B metalness
      const rough = Math.min(1, 0.36 + 0.14 * (mott - 0.5) + 0.35 * grime + 0.5 * rust + 0.06 * (grain - 0.5));
      const metal = Math.max(0, 0.95 - 0.55 * grime - 0.9 * rust);
      iO.data[k] = 255; iO.data[k + 1] = rough * 255; iO.data[k + 2] = metal * 255; iO.data[k + 3] = 255;
      // bump: sheet grain + dimpled rust
      const hB = 0.5 + 0.22 * (grain - 0.5) + 0.2 * (crystal - 0.5) + 0.35 * rust * (rn - 0.5) + 0.12 * (mott - 0.5);
      const bv = Math.max(0, Math.min(1, hB)) * 255;
      iB.data[k] = iB.data[k + 1] = iB.data[k + 2] = bv; iB.data[k + 3] = 255;
    }
  }
  gA.putImageData(iA, 0, 0); gO.putImageData(iO, 0, 0); gB.putImageData(iB, 0, 0);
  // scratches + scuffs (bright on albedo, dents on bump)
  let s = 4242; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const nS = quality === 'high' ? 140 : 90;
  for (let q = 0; q < nS; q++) {
    const x = rnd() * W, y = rnd() * Hh * 0.9 + Hh * 0.02, len = 8 + rnd() * 90, ang = (rnd() - 0.5) * 1.2 + (rnd() < 0.6 ? 0 : Math.PI / 2);
    const dx = Math.cos(ang) * len, dy = Math.sin(ang) * len * 0.5;
    gA.strokeStyle = `rgba(190,188,178,${0.12 + rnd() * 0.25})`; gA.lineWidth = 0.6 + rnd() * 1.1;
    gA.beginPath(); gA.moveTo(x, y); gA.lineTo(x + dx, y + dy); gA.stroke();
    gB.strokeStyle = `rgba(20,20,20,${0.4 + rnd() * 0.4})`; gB.lineWidth = 0.8 + rnd();
    gB.beginPath(); gB.moveTo(x, y); gB.lineTo(x + dx, y + dy); gB.stroke();
    gO.strokeStyle = 'rgba(255,70,0,0.35)'; gO.lineWidth = 1.2;
    gO.beginPath(); gO.moveTo(x, y); gO.lineTo(x + dx, y + dy); gO.stroke();
  }
  // a faint ghost of a past sticker / tape residue
  
  const mkT = (c, srgb) => {
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; return t;
  };
  return { albedo: mkT(cA, true), orm: mkT(cO, false), bump: mkT(cB, false) };
}

export function createBin(quality, envTex) {
  const group = new THREE.Group();
  const seg = quality === 'low' ? 56 : 112;
  const hi = quality !== 'low';

  // ---- profile: [r, y] from the outside-bottom, up the outer wall, over the rolled rim, down the inner wall, to the floor
  const P = [];
  const push = (r, y) => P.push(new THREE.Vector2(r, y));
  push(0.0, 0.0);
  push(rOuter(0.03) - 0.05, 0.0);
  // rounded foot corner
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI / 2; push(rOuter(0.03) - 0.03 + Math.sin(a) * 0.03 - 0.0, 0.03 - Math.cos(a) * 0.03); }
  const NW = hi ? 90 : 46;
  const y0 = 0.04, y1 = H - 0.03;
  for (let i = 1; i <= NW; i++) { const y = y0 + (y1 - y0) * (i / NW); push(rOuter(y), y); }
  // rolled bead: half-circle over the top, then back inside a hair
  const rc = rOuter(y1), cx = rc - RIM_R, cy = y1;
  const bead = Math.PI + 0.3;
  for (let i = 0; i <= 16; i++) { const a = (i / 16) * bead; push(cx + Math.cos(a) * RIM_R, cy + Math.sin(a) * RIM_R); }
  const innerOff = rBase(y1) - P[P.length - 1].x;
  // inner wall back down (thin gauge)
  for (let i = NW; i >= 0; i--) { const y = 0.06 + (y1 - 0.06) * (i / NW); push(rBase(y) - innerOff, y); }
  push(0.34, 0.045); push(0.18, 0.05); push(0.0, 0.05);

  // arc-length parameterisation for UVs
  const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + P[i].distanceTo(P[i - 1]));
  const tot = cum[cum.length - 1];
  const geo = new THREE.LatheGeometry(P, seg);
  const pos = geo.attributes.position, uv = geo.attributes.uv, col = new Float32Array(pos.count * 3);
  const per = P.length, v3 = new THREE.Vector3();
  const innerStart = P.length - (NW + 1) - 3; // first inner wall sample
  for (let i = 0; i < pos.count; i++) {
    const j = i % per;
    v3.fromBufferAttribute(pos, i);
    // outer wall rows use the 0..1 height map; the rest tile low-detail
    uv.setY(i, cum[j] / tot);
    // baked ambient occlusion: darker low inside, near foot and under ribs
    let ao = 1;
    if (j >= innerStart) { const t = Math.min(1, Math.max(0, (v3.y - 0.05) / 1.1)); ao = 0.07 + 0.55 * Math.pow(t, 1.8); }
    else if (j < 12) ao = 0.5 + 0.5 * (j / 12);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao;
    dent(v3); pos.setXYZ(i, v3.x, v3.y, v3.z);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();

  // texture rows map to arc fraction -> height (outer wall only matters visually)
  const wallStart = cum[10] / tot, wallEnd = cum[10 + NW] / tot;
  const ySamples = (v) => {
    const f = wallStart + (wallEnd - wallStart) * v; // v 0..1 across outer wall
    for (let i = 1; i < P.length; i++) if (cum[i] / tot >= f) { const t = (f - cum[i - 1] / tot) / ((cum[i] - cum[i - 1]) / tot || 1); return P[i - 1].y + (P[i].y - P[i - 1].y) * t; }
    return H;
  };
  // remap uv.y so the outer wall spans the full 0..1 texture and extras clamp
  for (let i = 0; i < pos.count; i++) {
    const f = uv.getY(i); uv.setY(i, Math.min(1, Math.max(0, (f - wallStart) / (wallEnd - wallStart))));
  }
  const maps = paintMaps(hi ? (quality === 'high' ? 1024 : 768) : 512, ySamples, quality);
  const mat = new THREE.MeshStandardMaterial({
    map: maps.albedo, roughnessMap: maps.orm, metalnessMap: maps.orm, roughness: 1, metalness: 1,
    bumpMap: maps.bump, bumpScale: 0.9, vertexColors: true, side: THREE.DoubleSide,
    envMap: envTex || null, envMapIntensity: 0.45,
    emissive: new THREE.Color(0xe8a33d), emissiveIntensity: 0,
  });
  const body = new THREE.Mesh(geo, mat);
  body.castShadow = true; body.receiveShadow = true;
  group.add(body);

  // two spot-welded side handles (flat steel strap loops), seated on the wall
  const hGeo = new THREE.TorusGeometry(0.065, 0.011, 8, 22, Math.PI);
  const hMat = new THREE.MeshStandardMaterial({ color: 0x6a6c68, metalness: 0.85, roughness: 0.5, envMap: envTex || null, envMapIntensity: 0.9 });
  const handles = [];
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(hGeo, hMat);
    m.position.set(s * (rBase(1.0) - 0.004), 1.0, 0); m.rotation.set(0, Math.PI / 2, s > 0 ? -Math.PI / 2 : Math.PI / 2);
    m.castShadow = true; group.add(m); handles.push(m);
  }
  group.rotation.y = Math.PI;

  return {
    group, height: H, topY: H,
    setGlow(a) { mat.emissiveIntensity = a; },
    dispose() { geo.dispose(); hGeo.dispose(); mat.dispose(); hMat.dispose(); maps.albedo.dispose(); maps.orm.dispose(); maps.bump.dispose(); },
  };
}
