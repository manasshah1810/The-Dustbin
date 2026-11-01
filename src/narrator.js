import * as THREE from 'three';
import anime from 'animejs/lib/anime.es.js';

// A 3D narrator bust drawn with an ordered (Bayer) dither: two inks, chunky pixels.
// If /narrator/face.png|jpg exists it is dithered onto a head-shaped plane instead of the procedural face.
const INK = new THREE.Color('#0A1030');
const PAPER = new THREE.Color('#FBF7EA');

const EMO = {
  shy:      { bt: 0.25, by: 0.0,  eo: 0.9,  c: 0.15, mo: 0.0,  tilt: 0.07, pitch: 0.10 },
  sad:      { bt: 0.6,  by: -0.03, eo: 0.72, c: -0.65, mo: 0.0, tilt: 0.03, pitch: 0.2 },
  hopeful:  { bt: 0.3,  by: 0.07, eo: 1.15, c: 0.7,   mo: 0.05, tilt: -0.05, pitch: -0.02 },
  hurt:     { bt: 0.7,  by: 0.0,  eo: 0.8,  c: -0.5,  mo: 0.0,  tilt: -0.1, pitch: 0.12 },
  warm:     { bt: -0.1, by: 0.05, eo: 0.95, c: 0.95,  mo: 0.15, tilt: 0.04, pitch: -0.04 },
  uneasy:   { bt: 0.5,  by: 0.04, eo: 1.2,  c: -0.2,  mo: 0.0,  tilt: 0.0,  pitch: 0.06 },
  inviting: { bt: 0.1,  by: 0.05, eo: 1.05, c: 0.65,  mo: 0.05, tilt: 0.03, pitch: -0.02 },
};
export const CHAPTER_EMOTION = ['shy', 'sad', 'hopeful', 'hurt', 'warm', 'uneasy', 'inviting'];

const DITHER_V = `varying vec3 vN; varying vec2 vUv; void main(){ vN = normalize(normalMatrix*normal); vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const BAYER = `
float bayer4(vec2 p){
  int x = int(mod(p.x,4.0)), y = int(mod(p.y,4.0)); int i = x + y*4;
  float m[16] = float[16](0.,8.,2.,10., 12.,4.,14.,6., 3.,11.,1.,9., 15.,7.,13.,5.);
  return (m[i]+0.5)/16.0;
}`;
function ditherMat(tone, rim = 0.0) {
  return new THREE.ShaderMaterial({
    uniforms: { uTone: { value: tone }, uInk: { value: INK }, uPaper: { value: PAPER }, uRim: { value: rim } },
    vertexShader: DITHER_V,
    fragmentShader: `uniform float uTone; uniform vec3 uInk; uniform vec3 uPaper; uniform float uRim; varying vec3 vN; varying vec2 vUv; ${BAYER}
      void main(){
        vec3 n = normalize(vN);
        float l = dot(n, normalize(vec3(-0.45,0.65,0.75)))*0.5+0.5;
        l = clamp(l*uTone + uRim*pow(1.0-abs(n.z),2.0), 0.0, 1.0);
        gl_FragColor = vec4(l > bayer4(gl_FragCoord.xy) ? uPaper : uInk, 1.0);
      }`,
  });
}
const flat = (c) => new THREE.MeshBasicMaterial({ color: c });

export async function createNarrator(host, { quality = 'mid', reducedMotion = false } = {}) {
  const canvas = document.createElement('canvas');
  host.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  camera.position.set(0, 0.45, 7.2); camera.lookAt(0, 0.1, 0);

  const rig = new THREE.Group(); scene.add(rig);
  const geos = [], mats = [];
  const G = (g) => { geos.push(g); return g; };
  const M = (m) => { mats.push(m); return m; };
  const skin = M(ditherMat(1.12, 0.12)), hair = M(ditherMat(0.5)), shirt = M(ditherMat(0.78));
  const inkM = M(flat(INK)), whiteM = M(flat(PAPER));
  const sph = G(new THREE.SphereGeometry(1, 40, 28));

  const body = new THREE.Mesh(sph, shirt); body.scale.set(2.0, 1.25, 1.0); body.position.set(0, -2.05, 0); rig.add(body);
  const head = new THREE.Group(); head.position.y = 0.1; rig.add(head);
  const neck = new THREE.Mesh(G(new THREE.CylinderGeometry(0.42, 0.5, 0.7, 20)), skin); neck.position.set(0, -1.1, 0); rig.add(neck);
  const skull = new THREE.Mesh(sph, skin); skull.scale.set(0.95, 1.08, 0.98); head.add(skull);
  for (const s of [-1, 1]) { const ear = new THREE.Mesh(sph, skin); ear.scale.set(0.16, 0.28, 0.16); ear.position.set(s * 0.95, -0.05, 0); head.add(ear); }
  // curly hair: a cap of balls
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 34; i++) {
    const a = rnd() * Math.PI * 2, e = 0.15 + rnd() * 1.05;       // elevation from the horizon up
    const R = 1.0 + rnd() * 0.08, sz = 0.3 + rnd() * 0.14;
    const x = Math.cos(a) * Math.cos(e) * R * 0.97, y = Math.sin(e) * R * 1.08 + 0.1, z = Math.sin(a) * Math.cos(e) * R * 0.98;
    if (z > 0.35 && y < 0.78) continue;                             // keep the forehead clear
    const b = new THREE.Mesh(sph, hair); b.scale.setScalar(sz); b.position.set(x, y, z - 0.08); head.add(b);
  }
  // face
  const faceZ = (x, y) => Math.sqrt(Math.max(0.02, 1 - (x / 0.95) ** 2 - (y / 1.08) ** 2)) * 0.98;
  const eyes = [], brows = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Group(); e.position.set(s * 0.37, 0.1, faceZ(s * 0.37, 0.1) + 0.02); head.add(e);
    const ball = new THREE.Mesh(sph, inkM); ball.scale.set(0.15, 0.22, 0.05); e.add(ball);
    const hi = new THREE.Mesh(sph, whiteM); hi.scale.set(0.045, 0.06, 0.03); hi.position.set(-0.04 * s, 0.07, 0.05); e.add(hi);
    eyes.push(e);
    const br = new THREE.Mesh(G(new THREE.BoxGeometry(0.32, 0.07, 0.04)), inkM); br.userData.s = s; head.add(br); brows.push(br);
  }
  const mouth = new THREE.Mesh(G(new THREE.CircleGeometry(0.3, 24, Math.PI, Math.PI)), inkM); head.add(mouth);
  const nose = new THREE.Mesh(sph, skin); nose.scale.set(0.09, 0.07, 0.07); nose.position.set(0, -0.12, faceZ(0, -0.12) + 0.04); head.add(nose);

  // optional: the real face, dithered
  let photoMesh = null;
  const tryPhoto = (url) => new Promise((res) => {
    const img = new Image(); img.onload = () => res(img); img.onerror = () => res(null); img.src = url;
  });
  (async () => {
    const img = (await tryPhoto('narrator/face.png')) || (await tryPhoto('narrator/face.jpg'));
    if (!img) return;
    const tex = new THREE.Texture(img); tex.needsUpdate = true; tex.colorSpace = THREE.SRGBColorSpace;
    const m = M(new THREE.ShaderMaterial({
      uniforms: { uMap: { value: tex }, uInk: { value: INK }, uPaper: { value: PAPER } }, transparent: true,
      vertexShader: DITHER_V,
      fragmentShader: `uniform sampler2D uMap; uniform vec3 uInk; uniform vec3 uPaper; varying vec2 vUv; ${BAYER}
        void main(){
          vec4 t = texture2D(uMap, vUv); float l = dot(t.rgb, vec3(0.3,0.59,0.11));
          l = clamp((l-0.5)*1.5+0.55, 0.0, 1.0);
          vec2 q = (vUv-0.5)*vec2(1.0,1.0); float oval = smoothstep(0.5, 0.42, length(q*vec2(1.0,0.92)));
          if (t.a*oval < 0.5) discard;
          gl_FragColor = vec4(l > bayer4(gl_FragCoord.xy) ? uPaper : uInk, 1.0);
        }`,
    }));
    photoMesh = new THREE.Mesh(G(new THREE.PlaneGeometry(2.7, 2.7)), m); photoMesh.position.set(0, 0.2, 0.2);
    rig.add(photoMesh);
    head.visible = false;
  })();

  // ---- state ----
  const P = { bt: 0, by: 0, eo: 1, c: 0.1, mo: 0, tilt: 0, pitch: 0 };       // animated params
  const look = { x: 0, y: 0, sx: 0, sy: 0 };
  let speaking = false, t = 0, last = performance.now(), blinkAt = 2.5, blink = 0, raf = 0, running = true, visible = true;
  let breathe = 0;

  function setEmotion(name) {
    const e = EMO[name] || EMO.shy;
    anime.remove(P);
    anime({ targets: P, ...e, duration: reducedMotion ? 1 : 900, easing: 'easeInOutCubic' });
  }
  setEmotion('shy');

  function pose(dt) {
    t += dt; breathe = Math.sin(t * 1.6) * 0.012;
    look.sx += (look.x - look.sx) * (1 - Math.exp(-dt * 4)); look.sy += (look.y - look.sy) * (1 - Math.exp(-dt * 4));
    const sp = speaking && !reducedMotion;
    const talk = sp ? (0.5 + 0.5 * Math.sin(t * 14) * Math.sin(t * 5.3 + 1)) : 0;
    const mouthOpen = Math.max(P.mo, talk * 0.7);
    head.rotation.y = look.sx * 0.35 + (sp ? Math.sin(t * 2.1) * 0.05 : 0);
    head.rotation.x = P.pitch + look.sy * 0.2 + (sp ? Math.sin(t * 3.1) * 0.025 : 0);
    head.rotation.z = P.tilt + Math.sin(t * 0.7) * 0.012;
    rig.position.y = breathe + (sp ? Math.sin(t * 6) * 0.01 : 0);
    // blink
    blinkAt -= dt; if (blinkAt < 0) { blink = 1; blinkAt = 2.4 + Math.random() * 3; }
    blink = Math.max(0, blink - dt * 8);
    const open = P.eo * (1 - Math.sin(blink * Math.PI) * 0.92);
    eyes.forEach((e) => { e.children[0].scale.y = 0.22 * open; e.children[1].visible = open > 0.45; });
    brows.forEach((b) => {
      const s = b.userData.s, x = s * 0.37;
      const y = 0.1 + 0.3 + P.by + (open - 1) * 0.05;
      b.position.set(x, y, faceZ(x, y) + 0.03);
      b.rotation.z = -s * P.bt * 0.45;                // inner ends rise when sad/uneasy
    });
    const curve = P.c;
    mouth.rotation.z = curve < 0 ? Math.PI : 0;
    mouth.scale.set(0.9 + 0.35 * Math.abs(curve) * (curve > 0 ? 1 : 0.3), 0.06 + 0.5 * Math.max(mouthOpen, Math.abs(curve) * 0.45), 1);
    const my = -0.5 + (curve < 0 ? -0.06 : 0.04);
    mouth.position.set(0, my, faceZ(0, my) + 0.03);
    if (photoMesh) { photoMesh.rotation.y = head.rotation.y * 0.8; photoMesh.rotation.x = head.rotation.x * 0.6; photoMesh.scale.y = 1 + (sp ? talk * 0.012 : 0); }
  }

  function size() {
    const W = host.clientWidth || 200, H = host.clientHeight || 200;
    const px = quality === 'low' ? 4 : 3;                 // one rendered pixel = px CSS pixels (chunky on purpose)
    renderer.setPixelRatio(1 / px);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.fov = W / H < 0.9 ? 31 : 26; camera.updateProjectionMatrix();
    canvas.style.width = '100%'; canvas.style.height = '100%';
  }
  size();
  const ro = new ResizeObserver(size); ro.observe(host);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); io.observe(host);

  let acc = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!running || !visible || document.hidden) return;
    acc += dt; if (quality === 'low' && acc < 1 / 30) return; const d = acc; acc = 0;
    pose(d); renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  return {
    setEmotion,
    setSpeaking(v) { speaking = !!v; },
    setLook(x, y) { look.x = x; look.y = y; },
    nod() { anime({ targets: P, pitch: [P.pitch + 0.0, P.pitch + 0.14, P.pitch], duration: 500, easing: 'easeInOutSine' }); },
    setPaused(v) { running = !v; },
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); anime.remove(P);
      geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); renderer.dispose(); canvas.remove();
    },
  };
}
