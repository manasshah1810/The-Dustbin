import * as THREE from 'three';
import { glslNoise } from './noise.js';
import { mulberry } from './util.js';

export const PAPER_W = 0.6, PAPER_H = 0.8;
const FONT = '"Caveat","Bradley Hand","Segoe Print","Comic Sans MS",cursive';
let sharedGeo = null, geoUsers = 0;

export function makePaperTexture({ title = '', body = '', seed = 1 } = {}) {
  const W = 512, H = 683;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const rnd = mulberry(seed * 977 + 13);
  g.fillStyle = '#F3EAD7'; g.fillRect(0, 0, W, H);
  // soft stains / aging
  for (let i = 0; i < 5; i++) {
    const x = rnd() * W, y = rnd() * H, r = 80 + rnd() * 160;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(140,105,60,0.07)'); gr.addColorStop(1, 'rgba(140,105,60,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  const eg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
  eg.addColorStop(0, 'rgba(120,90,50,0)'); eg.addColorStop(1, 'rgba(120,90,50,0.16)');
  g.fillStyle = eg; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(110,85,50,${0.02 + rnd() * 0.04})`; g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 1.5, 1 + rnd() * 1.5); }
  // faint fold lines (letter fold + half)
  const fold = (x1, y1, x2, y2) => {
    g.strokeStyle = 'rgba(80,60,35,0.13)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x1 + 1.5, y1 + 1.5); g.lineTo(x2 + 1.5, y2 + 1.5); g.stroke();
  };
  fold(0, H / 3, W, H / 3 + 2); fold(0, (2 * H) / 3, W, (2 * H) / 3 - 2); fold(W / 2 + 2, 0, W / 2, H);

  g.fillStyle = '#1A1A1A'; g.strokeStyle = '#1A1A1A'; g.textBaseline = 'alphabetic';
  if (title) {
    g.save(); g.translate(W * 0.1, H * 0.2); g.rotate(-0.025);
    let size = 120; g.font = `${size}px ${FONT}`;
    while (g.measureText(title).width > W * 0.78 && size > 30) { size -= 4; g.font = `${size}px ${FONT}`; }
    g.fillText(title, 0, 0);
    g.lineWidth = 3; g.lineCap = 'round'; g.globalAlpha = 0.8; g.beginPath();
    const tw = g.measureText(title).width; g.moveTo(0, size * 0.18);
    for (let x = 0; x <= tw; x += 20) g.lineTo(x, size * 0.18 + Math.sin(x * 0.05) * 3 + 2);
    g.stroke(); g.restore();
    // illegible scribble lines (not text)
    g.globalAlpha = 0.3; g.lineWidth = 2.4;
    for (let l = 0; l < 7; l++) {
      const y = H * 0.34 + l * 38; let x = W * 0.1; const end = W * (0.55 + rnd() * 0.33);
      g.beginPath(); g.moveTo(x, y);
      while (x < end) { x += 6 + rnd() * 9; g.lineTo(x, y + (rnd() - 0.5) * 11); if (rnd() < 0.12) x += 10 + rnd() * 14, g.moveTo(x, y); }
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  if (body) {
    let size = 54, lines = [];
    const maxW = W * 0.8, maxH = H * 0.78;
    const wrap = () => {
      g.font = `${size}px ${FONT}`; lines = [];
      for (const para of String(body).split(/\n/)) {
        let cur = '';
        for (const word of para.split(/\s+/)) {
          let w = word;
          while (g.measureText(w).width > maxW && w.length > 1) { // break very long words
            let k = w.length; while (k > 1 && g.measureText(w.slice(0, k)).width > maxW) k--;
            if (cur) { lines.push(cur); cur = ''; }
            lines.push(w.slice(0, k)); w = w.slice(k);
          }
          const t = cur ? cur + ' ' + w : w;
          if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
        }
        lines.push(cur);
      }
    };
    wrap();
    while (lines.length * size * 1.22 > maxH && size > 16) { size -= 3; wrap(); }
    g.font = `${size}px ${FONT}`;
    lines.forEach((ln, i) => { g.save(); g.translate(W * 0.1, H * 0.12 + size + i * size * 1.22); g.rotate((rnd() - 0.5) * 0.012); g.fillText(ln, 0, 0); g.restore(); });
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.generateMipmaps = true;
  return tex;
}

const DISP = /* glsl */ `
uniform float uCrumple; uniform float uCurl; uniform float uSeed; uniform vec2 uSize;
${glslNoise}
vec3 paperDisp(vec3 p, out float shade){
  vec2 q = p.xy / uSize; vec2 uv = q + 0.5; float c = uCrumple;
  vec3 f = p;
  float e = max(abs(q.x), abs(q.y)) * 2.0;
  float corner = pow(abs(q.x)*2.0, 2.0) * (0.35 + 0.65*(0.5 - q.y));
  f.z += uCurl * (0.11*corner + 0.05*pow(e, 4.0));
  f.z += sin(q.x*3.0 + uSeed) * 0.014 * (1.0 - c);
  float w  = fbm3(vec3(p.xy*4.5, uSeed)) - 0.5;
  float w2 = vnoise(vec3(p.xy*12.0, uSeed+3.0)) - 0.5;
  f.z += (w*0.36 + w2*0.09) * c;
  f.xy *= 1.0 - 0.42*c*c;
  float th = uv.x*6.28318; float ph = (0.04 + 0.92*uv.y)*3.14159;
  vec3 s = vec3(sin(ph)*cos(th), cos(ph), sin(ph)*sin(th));
  float n = fbm3(s*3.0 + uSeed); float n2 = vnoise(s*9.0 + uSeed*2.0);
  vec3 b = s * 0.17 * (0.7 + 0.7*n + 0.2*n2);
  float t = smoothstep(0.25, 1.0, c);
  float shF = clamp(1.0 + w*1.5*c, 0.55, 1.08);
  float shB = clamp(0.5 + 0.9*n + 0.35*n2, 0.45, 1.1);
  shade = mix(shF, shB, t);
  return mix(f, b, t);
}`;

function patchVertex(sh, U, withNormal) {
  Object.assign(sh.uniforms, U);
  sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${DISP}\nvarying float vShade;`);
  if (withNormal) {
    sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', `
      float sh0, sh1, sh2;
      vec3 pd0 = paperDisp(position, sh0);
      vec3 pd1 = paperDisp(position + vec3(0.012,0.0,0.0), sh1);
      vec3 pd2 = paperDisp(position + vec3(0.0,0.012,0.0), sh2);
      vec3 objectNormal = normalize(cross(pd1 - pd0, pd2 - pd0));
      vShade = sh0;`);
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = pd0;');
  } else {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', 'float shx; vec3 transformed = paperDisp(position, shx);');
  }
}

export function createPaper({ title, body, seed = 1, castShadow = true }) {
  if (!sharedGeo) sharedGeo = new THREE.PlaneGeometry(PAPER_W, PAPER_H, 48, 64);
  geoUsers++;
  const U = {
    uCrumple: { value: 1 }, uCurl: { value: 0 }, uSeed: { value: seed * 3.7 },
    uSize: { value: new THREE.Vector2(PAPER_W, PAPER_H) },
  };
  const tex = makePaperTexture({ title, body, seed });
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    patchVertex(sh, U, true);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vShade;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vShade;');
  };
  mat.customProgramCacheKey = () => 'paper';
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  depth.onBeforeCompile = (sh) => patchVertex(sh, U, false);
  depth.customProgramCacheKey = () => 'paperDepth';
  const mesh = new THREE.Mesh(sharedGeo, mat);
  mesh.customDepthMaterial = depth;
  mesh.castShadow = castShadow; mesh.receiveShadow = true; mesh.frustumCulled = false;
  return {
    mesh, U, tex,
    dispose() {
      tex.dispose(); mat.dispose(); depth.dispose();
      if (--geoUsers <= 0) { sharedGeo.dispose(); sharedGeo = null; geoUsers = 0; }
    },
  };
}
