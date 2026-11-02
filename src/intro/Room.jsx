import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/* ---------- tiny deterministic helpers ---------- */
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const mix = (a, b, t) => a + (b - a) * t;

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
function speckle(x, w, h, n, a) { for (let i = 0; i < n; i++) { const v = hash(i * 3.1) * 255; x.fillStyle = `rgba(${v},${v},${v},${a * hash(i * 7.7)})`; x.fillRect(hash(i * 1.7) * w, hash(i * 5.3) * h, 1 + hash(i) * 2, 1 + hash(i + 9) * 2); } }

/* ---------- textures ---------- */
const wallTex = () => canvasTex(512, 512, (x, w, h) => {
  x.fillStyle = '#767a7c'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 30; i++) { const g = x.createRadialGradient(hash(i) * w, hash(i + 40) * h, 4, hash(i) * w, hash(i + 40) * h, 50 + hash(i + 7) * 150); const d = hash(i) < .5; g.addColorStop(0, `rgba(${d ? 38 : 120},${d ? 40 : 122},${d ? 42 : 124},.14)`); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }
  speckle(x, w, h, 7000, .09);
  for (let i = 0; i < 14; i++) { const gx = x.createLinearGradient(0, 0, 0, h); const xx = hash(i * 9) * w; gx.addColorStop(0, 'rgba(25,25,27,.0)'); gx.addColorStop(.5, 'rgba(25,25,27,.07)'); gx.addColorStop(1, 'rgba(25,25,27,.14)'); x.fillStyle = gx; x.fillRect(xx, 0, 2 + hash(i) * 6, h); }   // damp streaks
}, [2.2, 1.2]);
const floorTex = () => canvasTex(1024, 1024, (x, w, h) => {
  const pw = 128; for (let i = 0; i < w / pw; i++) { const v = 56 + hash(i * 5) * 16; x.fillStyle = `rgb(${v},${v - 2},${v - 5})`; x.fillRect(i * pw, 0, pw, h);
    for (let j = 0; j < 10; j++) { const y0 = hash(i * 13 + j) * h; x.fillStyle = `rgba(0,0,0,${.04 + hash(j + i) * .07})`; x.fillRect(i * pw, y0, pw, 2 + hash(j) * 34); }
    for (let k = 0; k < 40; k++) { x.strokeStyle = `rgba(20,16,12,${.05 + hash(k + i) * .08})`; x.beginPath(); const y0 = hash(k * 3 + i) * h; x.moveTo(i * pw + hash(k) * pw, y0); x.lineTo(i * pw + hash(k) * pw + (hash(k + 5) - .5) * 14, y0 + 40 + hash(k + 8) * 140); x.stroke(); }
    x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(i * pw, 0, 2, h); for (let k = 0; k < 3; k++) x.fillRect(i * pw, hash(i + k * 3) * h, pw, 1.5); }
  speckle(x, w, h, 12000, .1);
}, [1.7, 1.9]);
const linenTex = (c1, c2) => canvasTex(256, 256, (x, w, h) => { x.fillStyle = c1; x.fillRect(0, 0, w, h); for (let i = 0; i < h; i += 3) { x.fillStyle = c2; x.fillRect(0, i, w, 1); } for (let i = 0; i < w; i += 3) { x.fillStyle = c2; x.globalAlpha = .5; x.fillRect(i, 0, 1, h); x.globalAlpha = 1; } speckle(x, w, h, 2500, .12); }, [3, 3]);
const rugTex = () => canvasTex(512, 384, (x, w, h) => {
  x.fillStyle = '#3d4348'; x.fillRect(0, 0, w, h); x.strokeStyle = '#555c61'; x.lineWidth = 10; x.strokeRect(22, 22, w - 44, h - 44); x.strokeStyle = '#2b3034'; x.lineWidth = 4; x.strokeRect(46, 46, w - 92, h - 92);
  for (let i = 0; i < 9; i++) for (let j = 0; j < 6; j++) { x.fillStyle = (i + j) % 2 ? '#4a5157' : '#353b40'; x.beginPath(); x.moveTo(70 + i * 46, 70 + j * 42); x.lineTo(93 + i * 46, 91 + j * 42); x.lineTo(70 + i * 46, 112 + j * 42); x.lineTo(47 + i * 46, 91 + j * 42); x.fill(); }
  speckle(x, w, h, 7000, .15);
});
const woodTex = (base) => canvasTex(256, 256, (x, w, h) => { x.fillStyle = base; x.fillRect(0, 0, w, h); for (let i = 0; i < 70; i++) { x.strokeStyle = `rgba(0,0,0,${.05 + hash(i) * .1})`; x.beginPath(); const yy = hash(i * 3) * h; x.moveTo(0, yy); x.bezierCurveTo(w * .3, yy + (hash(i) - .5) * 8, w * .7, yy + (hash(i + 4) - .5) * 8, w, yy + (hash(i + 8) - .5) * 5); x.stroke(); } speckle(x, w, h, 2000, .1); }, [1, 1]);
const posterTex = (kind) => canvasTex(256, 360, (x, w, h) => {
  x.fillStyle = '#8b8f91'; x.fillRect(0, 0, w, h);
  if (kind === 0) { for (let i = 0; i < 18; i++) for (let j = 0; j < 7; j++) { const v = 60 + hash(i * 7 + j) * 80; x.fillStyle = `rgb(${v},${v + 4},${v + 8})`; if (hash(i + j * 9) > .25) x.fillRect(12 + i * 13, 70 + j * 30, 11, 26); }
    x.fillStyle = '#2a2d30'; x.font = '700 30px Space Grotesk, sans-serif'; x.fillText('ELEMENTS', 16, 48); }
  else { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#9aa3a8'); g.addColorStop(1, '#4b5256'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = '#2d3235'; x.beginPath(); x.moveTo(0, 260); for (let i = 0; i <= 8; i++) x.lineTo(i * 32, 230 - hash(i + 3) * 90); x.lineTo(w, h); x.lineTo(0, h); x.fill(); x.fillStyle = '#c3c8cb'; x.beginPath(); x.arc(190, 80, 24, 0, 7); x.fill(); }
  x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 6; x.strokeRect(0, 0, w, h); speckle(x, w, h, 2500, .12);
});
const clockTex = () => canvasTex(256, 256, (x) => { x.fillStyle = '#b8bbbc'; x.beginPath(); x.arc(128, 128, 120, 0, 7); x.fill(); x.strokeStyle = '#26282a'; x.lineWidth = 8; x.stroke(); x.fillStyle = '#26282a'; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; x.fillRect(128 + Math.sin(a) * 96 - 3, 128 - Math.cos(a) * 96 - 3, 6, 6); }
  x.lineCap = 'round'; x.lineWidth = 9; x.beginPath(); x.moveTo(128, 128); x.lineTo(128 + Math.sin(1.5) * 56, 128 - Math.cos(1.5) * 56); x.stroke(); x.lineWidth = 5; x.beginPath(); x.moveTo(128, 128); x.lineTo(128, 56); x.stroke(); });
const corkTex = () => canvasTex(256, 192, (x, w, h) => { x.fillStyle = '#5b5348'; x.fillRect(0, 0, w, h); speckle(x, w, h, 5000, .35);
  [[20, 18, 70, 90, '#c9c7c1'], [110, 14, 60, 72, '#b8bfc4'], [182, 26, 54, 64, '#cfcdc7'], [60, 104, 80, 70, '#bdbab4'], [160, 110, 66, 62, '#c4c9cc']].forEach(([a, b, c, d, f], i) => { x.save(); x.translate(a + c / 2, b + d / 2); x.rotate((hash(i) - .5) * .2); x.fillStyle = f; x.fillRect(-c / 2, -d / 2, c, d); x.fillStyle = 'rgba(40,40,40,.5)'; for (let k = 0; k < 6; k++) x.fillRect(-c / 2 + 6, -d / 2 + 10 + k * 9, c - 12 - hash(k + i) * 20, 2); x.fillStyle = '#7a2d29'; x.beginPath(); x.arc(0, -d / 2 + 4, 3, 0, 7); x.fill(); x.restore(); }); });

const keysTex = () => canvasTex(720, 500, (x, w, h) => {
  x.fillStyle = '#3d4044'; x.fillRect(0, 0, w, h);
  const rows = [14, 14, 13, 12, 11]; let y = 24;
  rows.forEach((n, r) => { const kw = (w - 60) / n; for (let i = 0; i < n; i++) { x.fillStyle = '#1d1f21'; x.fillRect(30 + i * kw + 2, y, kw - 4, 46); x.fillStyle = 'rgba(255,255,255,.07)'; x.fillRect(30 + i * kw + 2, y, kw - 4, 4); } y += 54; });
  x.fillStyle = '#1d1f21'; x.fillRect(130, y, 460, 44); x.fillStyle = '#2f3235'; x.fillRect(250, y + 62, 220, 120); x.strokeStyle = '#1a1b1d'; x.lineWidth = 3; x.strokeRect(250, y + 62, 220, 120);
});
/* the answer sheet, as scanned on the laptop: a real-looking paper, red pen all over it */
function screenTex() {
  return canvasTex(2048, 1280, (x, w, h) => {
    const INK = '#23272d', RED = '#a8312b', hand = (px, f = 'Caveat') => `${px}px ${f}, 'Caveat', cursive`;
    const wob = (n, a) => (hash(n) - .5) * a;
    x.fillStyle = '#17191b'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#222527'; x.fillRect(0, 0, w, 52); x.fillStyle = '#4a4e52'; [28, 62, 96].forEach((cx) => { x.beginPath(); x.arc(cx, 26, 9, 0, 7); x.fill(); });
    x.fillStyle = '#34383b'; x.font = '24px Space Grotesk, sans-serif'; x.fillText('answer_sheet_scan.pdf', 140, 34);
    // paper
    x.save(); x.translate(w / 2, 66); x.rotate(-0.012);
    x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 30; x.fillStyle = '#d6d3cb'; x.fillRect(-840, 0, 1680, 2200); x.shadowBlur = 0;
    const pg = x.createLinearGradient(-840, 0, 840, 0); pg.addColorStop(0, 'rgba(0,0,0,.10)'); pg.addColorStop(.1, 'rgba(0,0,0,0)'); pg.addColorStop(1, 'rgba(0,0,0,.06)'); x.fillStyle = pg; x.fillRect(-840, 0, 1680, 2200);
    // ruled lines + margin
    x.strokeStyle = 'rgba(70,80,95,.35)'; x.lineWidth = 2; for (let y = 330; y < 2200; y += 62) { x.beginPath(); x.moveTo(-840, y); x.lineTo(840, y); x.stroke(); }
    x.strokeStyle = 'rgba(150,60,55,.5)'; x.lineWidth = 3; x.beginPath(); x.moveTo(-690, 0); x.lineTo(-690, 2200); x.stroke();
    // printed header
    x.fillStyle = '#2a2c2e'; x.textAlign = 'center'; x.font = '700 78px "Instrument Serif", Georgia, serif'; x.fillText('PAWAR PUBLIC SCHOOL', 0, 118);
    x.font = '400 50px "Instrument Serif", Georgia, serif'; x.fillText('Kandivali', 0, 180);
    x.fillRect(-520, 204, 1040, 3); x.fillRect(-520, 214, 1040, 1.5);
    x.textAlign = 'left'; x.font = '34px "Space Grotesk", sans-serif'; x.fillStyle = '#44484c';
    x.fillText('Name:', -660, 272); x.fillText('Class:', 120, 272); x.fillText('Subject:', -660, 318 - 12); x.fillText('Roll no:', 120, 318 - 12);
    x.strokeStyle = '#6a6e72'; x.lineWidth = 1.6; [[-540, 280, 600], [210, 280, 600], [-520, 306, 560], [250, 306, 560]].forEach(([a, b, c]) => { x.beginPath(); x.moveTo(a, b); x.lineTo(a + c - 120, b); x.stroke(); });
    // handwriting
    x.fillStyle = INK; x.font = hand(62); x.fillText('Manas Shah', -520, 270); x.font = hand(54); x.fillText('Computer', -480, 306 - 8);
    const lines = [
      ['Q1.  What is a computer?', 380], ['Ans.  A computer is a machine that can think', 442], ['and make decisions by itself like human brain.', 504],
      ['Q2.  Name two input devices.', 616], ['Ans.  monitor, printer', 678],
      ['Q3.  What does CPU stand for?', 790], ['Ans.  Central Power Unit', 852],
      ['Q4.  Write one use of the Internet.', 964], ['Ans.  Internet is a software', 1026],
      ['Q5.  What is an operating system?', 1138], ['Ans.  it is', 1200],
    ];
    x.font = hand(52); lines.forEach(([t, y], i) => { x.save(); x.translate(-640, y); x.rotate(wob(i, .012)); x.fillStyle = i % 2 ? '#2b3036' : INK; x.fillText(t, 0, 0); x.restore(); });
    // ---- red pen ----
    x.strokeStyle = RED; x.fillStyle = RED; x.lineCap = 'round'; x.lineJoin = 'round';
    const pen = (pts, lw = 6) => { x.lineWidth = lw; x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.stroke(); };
    const cross = (cx, cy, r = 38) => { pen([[cx - r, cy - r * .9], [cx + r, cy + r * .9]], 7); pen([[cx + r * .9, cy - r], [cx - r * .8, cy + r * 1.05]], 6); };
    const strike = (x1, y, x2) => pen([[x1, y], [x1 + (x2 - x1) * .5, y + 4], [x2, y - 3]], 6);
    const circle = (cx, cy, rx, ry) => { x.lineWidth = 6; x.beginPath(); x.ellipse(cx, cy, rx, ry, -.06, .3, 6.9); x.stroke(); };
    const say = (t, px, a, b, rot = -0.04) => { x.save(); x.translate(a, b); x.rotate(rot); x.font = hand(px); x.fillText(t, 0, 0); x.restore(); };
    // Q1 – half right
    pen([[-660, 395], [-620, 418], [-558, 364]], 8);                                   // tick
    strike(-220, 436, 130); say('machine that follows instructions', 50, 150, 436 - 76 + 14, -0.03);   // correction
    say('not "think" !', 46, 250, 540, -0.05); pen([[250, 548], [490, 552]], 4);
    // Q2
    cross(-690, 690); strike(-380, 672, -160); strike(-120, 672, 80); say('keyboard, mouse', 50, 120, 724, -0.04);
    say('printer = OUTPUT', 44, 330, 664, -0.06); circle(530, 650, 90, 36);
    // Q3
    cross(-690, 862); strike(-300, 846, 340); say('Central Processing Unit', 50, -340, 916, -0.03); say('???', 52, 420, 848, -0.1);
    // Q4
    cross(-690, 1036); strike(-310, 1020, 140); say('incomplete', 54, 160, 1030, -0.06); pen([[160, 1042], [330, 1046]], 4); say('give a use!', 44, 380, 1090, -0.04);
    // Q5
    cross(-690, 1210); pen([[-400, 1212], [-60, 1206]], 5); say('where is the answer?', 52, -380, 1270, -0.03); circle(-420, 1195, 70, 34);
    say('see chapter 1', 44, 220, 1290, -0.05); pen([[210, 1300], [420, 1304]], 4);
    // scribbled total, circled, in red
    x.save(); x.translate(540, 130); x.rotate(-0.07);
    x.font = hand(250); x.fillText('2', -120, 40); pen([[-10, 150], [120, -150]], 11); x.fillText('30', 100, 108);
    x.lineWidth = 9; x.beginPath(); x.ellipse(60, -30, 232, 150, -0.05, 0.1, 6.5); x.stroke(); x.beginPath(); x.ellipse(66, -26, 224, 142, -0.03, 3.4, 8.5); x.stroke();
    x.restore();
    x.restore();
  });
}

/* ---------- little builders ---------- */
function crumple(r, seed) {
  const g = new THREE.IcosahedronGeometry(r, 3), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = hash(Math.round(v.x * 40) * 3 + Math.round(v.y * 40) * 17 + Math.round(v.z * 40) * 31 + seed); v.multiplyScalar(0.8 + n * 0.3 + (hash(Math.round(v.x * 90) + Math.round(v.y * 90) * 7 + seed * 13) - .5) * .12); p.setXYZ(i, v.x, v.y * (0.9 + hash(seed) * .2), v.z); }
  g.computeVertexNormals(); return g;
}
function binGeometry() {
  const pts = [[0, 0], [0.205, 0], [0.235, 0.02], [0.3, 0.55], [0.318, 0.575], [0.31, 0.595], [0.292, 0.58], [0.285, 0.565], [0.215, 0.05], [0, 0.04]].map(([a, b]) => new THREE.Vector2(a, b));
  const g = new THREE.LatheGeometry(pts, 40); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i), x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x); const d = (hash(Math.round(a * 6) + Math.round(y * 9)) - .5) * .006 * (y > .1 ? 1 : 0); p.setX(i, x * (1 + d * 4)); p.setZ(i, z * (1 + d * 4)); }
  g.computeVertexNormals(); return g;
}
function blanketGeometry() {
  const g = new THREE.PlaneGeometry(1.0, 1.55, 30, 46); g.rotateX(-Math.PI / 2); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); const f = Math.sin(x * 9 + z * 5) * .018 + Math.sin(x * 4 - z * 11 + 1) * .022 + (hash(i) - .5) * .008; const edge = Math.max(0, Math.abs(x) - .42) * 1.5; p.setY(i, f - edge * edge * 4 + Math.max(0, z - .45) * -.05); }
  g.computeVertexNormals(); return g;
}
function curtainGeometry(w, h) {
  const g = new THREE.PlaneGeometry(w, h, 24, 4), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 22) * 0.035 + Math.sin(p.getX(i) * 9 + 1) * 0.015);
  g.computeVertexNormals(); return g;
}
function clothGeometry() {
  const g = new THREE.SphereGeometry(0.28, 20, 12), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const n = 0.75 + hash(i) * 0.5; p.setXYZ(i, p.getX(i) * n * 1.4, Math.abs(p.getY(i)) * 0.35 * n, p.getZ(i) * n); }
  g.computeVertexNormals(); return g;
}
const D = { roughness: 0.92, metalness: 0 };
const Bx = ({ p, s, c, tex, shadow = true, rot, r = 0.9, ...o }) => (
  <mesh position={p} rotation={rot} castShadow={shadow} receiveShadow><boxGeometry args={s} /><meshStandardMaterial color={c} map={tex} roughness={r} metalness={0} {...o} /></mesh>
);

/* ---------- scene ---------- */
const BOOKS = (() => { const cols = ['#4b5258', '#5b5f58', '#3f464c', '#6a625a', '#495550', '#58504b', '#6b7378', '#3a3f44', '#5e5a55', '#51616a'], out = []; let seed = 0;
  for (let sh = 0; sh < 4; sh++) { let x = -0.38; while (x < 0.36) { const w = 0.025 + hash(seed++) * 0.03, h = 0.2 + hash(seed++) * 0.1, lean = hash(seed++) > 0.93 ? 0.3 : 0; if (hash(seed++) > 0.12) out.push({ x: x + w / 2, sh, w, h, c: cols[(hash(seed++) * cols.length) | 0], lean }); x += w + 0.004; if (hash(seed++) > 0.92) x += 0.12; } }
  return out; })();

function Room() {
  const [fontReady, setFont] = useState(false);
  useEffect(() => { let on = true; const f = document.fonts; (f ? Promise.all([f.load('200px Caveat', 'Ans 2/30'), f.load('700 60px "Instrument Serif"', 'PAWAR'), f.load('34px "Space Grotesk"', 'Name')]) : Promise.resolve()).catch(() => {}).then(() => on && setFont(true)); return () => { on = false; }; }, []);
  const m = useMemo(() => ({ wall: wallTex(), floor: floorTex(), sheet: linenTex('#4a4f54', '#40454a'), pillow: linenTex('#767a7c', '#6b6f72'), rug: rugTex(), desk: woodTex('#4a4540'), shelf: woodTex('#3c3834'), door: woodTex('#4d4a45'),
    posters: [posterTex(0), posterTex(1)], keys: keysTex(), clock: clockTex(), cork: corkTex(), bin: binGeometry(), blanket: blanketGeometry(), curtain: curtainGeometry(0.62, 1.7), cloth: clothGeometry(),
    paper: [crumple(0.07, 1), crumple(0.08, 2), crumple(0.065, 3), crumple(0.075, 4), crumple(0.06, 5), crumple(0.08, 6), crumple(0.07, 7), crumple(0.06, 8)] }), []);
  const screen = useMemo(() => (fontReady ? screenTex() : null), [fontReady]);
  const glow = useRef(); const dust = useRef(); const gap = useRef();
  const dustPts = useMemo(() => { const a = new Float32Array(300 * 3); for (let i = 0; i < 300; i++) { a[i * 3] = (hash(i) - .5) * 6; a[i * 3 + 1] = hash(i + 50) * 2.8; a[i * 3 + 2] = (hash(i + 90) - .5) * 7; } return a; }, []);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (glow.current) glow.current.intensity = 2.4 + Math.sin(t * 0.6) * 0.1;
    if (gap.current) gap.current.intensity = 0.9 + Math.sin(t * 0.35) * 0.12;
    if (dust.current) dust.current.rotation.y = t * 0.01, dust.current.position.y = Math.sin(t * 0.2) * 0.05;
  });
  const paperMat = <meshStandardMaterial color="#dcd9d3" emissive="#3a3935" emissiveIntensity={0.5} {...D} />;
  const W = 3.3, DZ = -3.6;
  return (
    <>
      <color attach="background" args={['#0b0c0d']} />
      <fog attach="fog" args={['#0b0c0d', 3.5, 9.5]} />
      <ambientLight intensity={0.7} color="#a3adb4" />
      <hemisphereLight args={['#8a949a', '#161616', 0.6]} />
      <directionalLight position={[-1.3, 2.6, -4.8]} intensity={1.35} color="#b0bcc6" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.02}
        shadow-camera-left={-4} shadow-camera-right={4} shadow-camera-top={3.5} shadow-camera-bottom={-3.5} shadow-camera-near={0.5} shadow-camera-far={14} />
      <pointLight ref={glow} position={[0.7, 1.05, -2.5]} color="#c4d0dc" intensity={2.4} distance={5.5} decay={1.7} />
      <pointLight ref={gap} position={[2.55, 1.0, -3.2]} color="#9fb2c0" intensity={0.9} distance={3.2} decay={1.8} />
      <spotLight position={[1.7, 2.5, -1.9]} angle={0.5} penumbra={1} intensity={2.4} decay={1.4} color="#a7b0b7" />

      {/* shell */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[2 * W, 9]} /><meshStandardMaterial map={m.floor} bumpMap={m.floor} bumpScale={1.5} {...D} roughness={0.75} /></mesh>
      <mesh position={[0, 1.45, DZ]}><planeGeometry args={[2 * W, 2.9]} /><meshStandardMaterial map={m.wall} bumpMap={m.wall} bumpScale={1.2} {...D} /></mesh>
      <mesh position={[-W, 1.45, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[9, 2.9]} /><meshStandardMaterial map={m.wall} bumpMap={m.wall} bumpScale={1.2} {...D} /></mesh>
      <mesh position={[W, 1.45, 0]} rotation={[0, -Math.PI / 2, 0]}><planeGeometry args={[9, 2.9]} /><meshStandardMaterial map={m.wall} bumpMap={m.wall} bumpScale={1.2} {...D} /></mesh>
      <mesh position={[0, 2.9, 0]} rotation={[Math.PI / 2, 0, 0]}><planeGeometry args={[2 * W, 9]} /><meshStandardMaterial color="#3a3b3c" {...D} /></mesh>
      <Bx p={[0, 0.07, DZ + 0.02]} s={[2 * W, 0.14, 0.04]} c="#4a4c4e" shadow={false} />
      <Bx p={[-W + 0.02, 0.07, 0]} s={[0.04, 0.14, 9]} c="#4a4c4e" shadow={false} /><Bx p={[W - 0.02, 0.07, 0]} s={[0.04, 0.14, 9]} c="#4a4c4e" shadow={false} />
      <mesh position={[0, 2.88, DZ + 0.01]}><boxGeometry args={[2 * W, 0.04, 0.04]} /><meshStandardMaterial color="#47494b" {...D} /></mesh>
      {/* tube light, off */}
      <Bx p={[0, 2.84, -0.6]} s={[0.16, 0.05, 1.2]} c="#8a8e90" shadow={false} />

      {/* window + curtains */}
      <group position={[-1.5, 1.7, DZ + 0.01]}>
        <mesh><planeGeometry args={[0.95, 1.2]} /><meshBasicMaterial color="#8a9298" toneMapped={false} /></mesh>
        {[-0.38, -0.12, 0.14, 0.4].map((y, i) => <mesh key={i} position={[0, y, 0.02]}><boxGeometry args={[0.95, 0.05, 0.01]} /><meshStandardMaterial color="#686b6e" {...D} /></mesh>)}
        <Bx p={[0, 0.62, 0.02]} s={[1.08, 0.06, 0.07]} c="#3a3c3f" shadow={false} /><Bx p={[0, -0.62, 0.04]} s={[1.14, 0.07, 0.1]} c="#3a3c3f" shadow={false} />
        <Bx p={[-0.51, 0, 0.02]} s={[0.06, 1.3, 0.07]} c="#3a3c3f" shadow={false} /><Bx p={[0.51, 0, 0.02]} s={[0.06, 1.3, 0.07]} c="#3a3c3f" shadow={false} />
        <mesh geometry={m.curtain} position={[-0.72, -0.05, 0.1]} castShadow><meshStandardMaterial color="#3c4348" {...D} side={THREE.DoubleSide} /></mesh>
        <mesh geometry={m.curtain} position={[0.72, -0.05, 0.1]} castShadow><meshStandardMaterial color="#3c4348" {...D} side={THREE.DoubleSide} /></mesh>
        <Bx p={[0, 0.9, 0.12]} s={[1.9, 0.025, 0.025]} c="#2a2c2e" shadow={false} />
      </group>

      {/* door, slightly ajar, light from the corridor */}
      <group position={[2.45, 0, DZ + 0.012]}>
        <mesh position={[0, 1.0, 0]}><planeGeometry args={[0.92, 2.0]} /><meshBasicMaterial color="#6e7e8a" toneMapped={false} /></mesh>
        <Bx p={[-0.5, 1.03, 0.02]} s={[0.08, 2.1, 0.1]} c="#35332f" shadow={false} /><Bx p={[0.5, 1.03, 0.02]} s={[0.08, 2.1, 0.1]} c="#35332f" shadow={false} /><Bx p={[0, 2.07, 0.02]} s={[1.08, 0.08, 0.1]} c="#35332f" shadow={false} />
        <group position={[0.46, 0, 0.03]} rotation={[0, 0.62, 0]}>
          <mesh position={[-0.44, 1.0, 0]} castShadow receiveShadow><boxGeometry args={[0.88, 2.0, 0.045]} /><meshStandardMaterial map={m.door} {...D} /></mesh>
          <mesh position={[-0.8, 1.0, 0.04]}><sphereGeometry args={[0.03, 12, 10]} /><meshStandardMaterial color="#7c7f80" metalness={0.6} roughness={0.4} /></mesh>
        </group>
      </group>

      {/* bed, unmade */}
      <group position={[-2.45, 0, -1.9]} rotation={[0, 0.03, 0]}>
        <Bx p={[0, 0.17, 0]} s={[1.12, 0.22, 2.1]} c="#2f3133" />
        {[[-.5, -1], [.5, -1], [-.5, 1], [.5, 1]].map(([x, z], i) => <Bx key={i} p={[x, 0.04, z]} s={[0.07, 0.08, 0.07]} c="#222" shadow={false} />)}
        <mesh position={[0, 0.4, 0]} castShadow receiveShadow><boxGeometry args={[1.04, 0.24, 2.02]} /><meshStandardMaterial map={m.sheet} {...D} /></mesh>
        <mesh position={[0, 0.535, 0.2]} castShadow receiveShadow geometry={m.blanket} rotation={[0, 0.07, 0]}><meshStandardMaterial map={m.sheet} color="#9aa0a4" {...D} side={THREE.DoubleSide} /></mesh>
        <mesh position={[0.05, 0.62, -0.74]} scale={[0.5, 0.15, 0.31]} rotation={[0.08, 0.14, 0.02]} castShadow><sphereGeometry args={[1, 28, 20]} /><meshStandardMaterial map={m.pillow} {...D} /></mesh>
        <Bx p={[0, 0.85, -1.06]} s={[1.12, 0.55, 0.06]} c="#2c2e30" />
        <mesh position={[-0.05, 0.64, 0.7]} scale={[0.5, 0.1, 0.35]} rotation={[0, 0.5, 0]}><sphereGeometry args={[1, 18, 12]} /><meshStandardMaterial color="#555b60" {...D} /></mesh>
      </group>
      {/* clothes on the floor, shoes */}
      <mesh geometry={m.cloth} position={[-1.55, 0.04, -0.7]} rotation={[0, 0.6, 0]} castShadow><meshStandardMaterial color="#555b5f" {...D} /></mesh>
      <mesh geometry={m.cloth} position={[-1.2, 0.04, -0.35]} rotation={[0, 2.1, 0]} scale={0.7}><meshStandardMaterial color="#42484c" {...D} /></mesh>
      {[[-1.3, -2.55, 0.3], [-1.18, -2.65, 1.2]].map(([x, z, r], i) => <group key={i} position={[x, 0.05, z]} rotation={[0, r, 0]}><Bx p={[0, 0, 0]} s={[0.1, 0.09, 0.26]} c="#2a2d30" /><Bx p={[0, 0.06, -0.05]} s={[0.09, 0.07, 0.12]} c="#34383b" /></group>)}
      {/* rug */}
      <mesh position={[-0.35, 0.006, 0.4]} rotation={[-Math.PI / 2, 0, 0.05]} receiveShadow><planeGeometry args={[2.3, 1.7]} /><meshStandardMaterial map={m.rug} {...D} /></mesh>

      {/* bookshelf on the left wall */}
      <group position={[-W + 0.17, 0, 0.6]} rotation={[0, Math.PI / 2, 0]}>
        <Bx p={[0, 0.95, -0.02]} s={[0.92, 1.9, 0.03]} c="#2b2927" tex={m.shelf} />
        <Bx p={[-0.45, 0.95, 0.1]} s={[0.03, 1.9, 0.3]} c="#3c3834" tex={m.shelf} /><Bx p={[0.45, 0.95, 0.1]} s={[0.03, 1.9, 0.3]} c="#3c3834" tex={m.shelf} />
        {[0.03, 0.5, 0.97, 1.44, 1.89].map((y, i) => <Bx key={i} p={[0, y, 0.1]} s={[0.92, 0.03, 0.3]} c="#3c3834" tex={m.shelf} />)}
        {BOOKS.map((b, i) => <mesh key={i} position={[b.x, 0.05 + [0, 0.47, 0.94, 1.41][b.sh] + b.h / 2, 0.1]} rotation={[0, 0, b.lean]} castShadow><boxGeometry args={[b.w, b.h, 0.2]} /><meshStandardMaterial color={b.c} {...D} /></mesh>)}
      </group>

      {/* desk, laptop, lamp, clutter */}
      <group position={[0.7, 0, -3.2]}>
        <Bx p={[0, 0.75, 0]} s={[1.5, 0.05, 0.7]} c="#4a4540" tex={m.desk} r={0.7} />
        <Bx p={[-0.7, 0.37, 0]} s={[0.05, 0.74, 0.62]} c="#38342f" tex={m.desk} /><Bx p={[0.7, 0.37, 0]} s={[0.05, 0.74, 0.62]} c="#38342f" tex={m.desk} />
        <Bx p={[0, 0.3, -0.3]} s={[1.4, 0.4, 0.02]} c="#34302c" tex={m.desk} />
        <Bx p={[0.42, 0.58, 0.02]} s={[0.6, 0.16, 0.56]} c="#3f3b36" tex={m.desk} />
        <group position={[-0.08, 0.775, 0.0]} rotation={[0, -0.05, 0]} scale={1.9}>
          <mesh position={[0, 0.01, 0.1]} castShadow><boxGeometry args={[0.38, 0.02, 0.26]} /><meshStandardMaterial color="#4a4c4f" metalness={0.5} roughness={0.5} /></mesh>
          <mesh position={[0, 0.0212, 0.1]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[0.36, 0.25]} /><meshStandardMaterial map={m.keys} roughness={0.6} /></mesh>
          <group position={[0, 0.02, -0.03]} rotation={[-0.2, 0, 0]}>
            <mesh position={[0, 0.125, 0]} castShadow><boxGeometry args={[0.38, 0.25, 0.012]} /><meshStandardMaterial color="#303234" metalness={0.5} roughness={0.5} /></mesh>
            <mesh position={[0, 0.125, 0.0075]}><planeGeometry args={[0.35, 0.219]} />{screen ? <meshBasicMaterial map={screen} toneMapped={false} /> : <meshBasicMaterial color="#1b1d1f" />}</mesh>
          </group>
        </group>
        {/* study lamp, off */}
        <group position={[-0.58, 0.775, -0.22]}>
          <mesh position={[0, 0.01, 0]}><cylinderGeometry args={[0.09, 0.1, 0.02, 20]} /><meshStandardMaterial color="#3a3d40" {...D} /></mesh>
          <Bx p={[0, 0.17, 0]} s={[0.015, 0.34, 0.015]} c="#4a4d50" rot={[0, 0, 0.12]} /><Bx p={[0.08, 0.34, 0]} s={[0.2, 0.015, 0.015]} c="#4a4d50" rot={[0, 0, -0.35]} />
          <mesh position={[0.2, 0.34, 0]} rotation={[0, 0, 0.6]}><coneGeometry args={[0.08, 0.14, 18, 1, true]} /><meshStandardMaterial color="#5a5e61" {...D} side={THREE.DoubleSide} /></mesh>
        </group>
        {/* notebooks, textbooks, pens */}
        <Bx p={[0.45, 0.8, 0.05]} s={[0.24, 0.05, 0.32]} c="#4d5a62" rot={[0, 0.1, 0]} /><Bx p={[0.46, 0.85, 0.04]} s={[0.22, 0.035, 0.3]} c="#6a6a64" rot={[0, -0.05, 0]} /><Bx p={[0.45, 0.89, 0.05]} s={[0.2, 0.03, 0.28]} c="#3b4a41" rot={[0, 0.18, 0]} />
        <mesh position={[0.62, 0.82, -0.2]} castShadow><cylinderGeometry args={[0.04, 0.035, 0.09, 16]} /><meshStandardMaterial color="#555a5e" {...D} /></mesh>
        <mesh position={[-0.35, 0.82, 0.22]} castShadow><cylinderGeometry args={[0.032, 0.032, 0.14, 14]} /><meshStandardMaterial color="#7d8488" metalness={0.2} roughness={0.5} /></mesh>
        <mesh position={[-0.52, 0.78, 0.12]} rotation={[0, 0.3, 0]}><boxGeometry args={[0.21, 0.01, 0.29]} />{paperMat}</mesh>
        <mesh position={[0.2, 0.815, 0.26]} geometry={m.paper[2]} rotation={[1, 2, 0]} castShadow>{paperMat}</mesh>
      </group>
      {/* shelf and notice board above the desk */}
      <Bx p={[1.2, 1.55, DZ + 0.12]} s={[0.9, 0.03, 0.22]} c="#3c3834" tex={m.shelf} />
      {[0.85, 1.0, 1.1, 1.2, 1.33].map((x, i) => <Bx key={i} p={[x, 1.55 + 0.1 + (i % 2) * 0.02, DZ + 0.12]} s={[0.05 + (i % 3) * 0.01, 0.17 + (i % 2) * 0.04, 0.16]} c={['#51616a', '#58504b', '#3f464c', '#495550', '#6a625a'][i]} />)}
      <mesh position={[0.2, 1.8, DZ + 0.015]}><planeGeometry args={[0.8, 0.6]} /><meshStandardMaterial map={m.cork} {...D} /></mesh>
      <Bx p={[0.2, 1.8, DZ + 0.01]} s={[0.84, 0.64, 0.02]} c="#2f2c28" shadow={false} />
      {/* chair, pulled out */}
      <group position={[-0.55, 0, -2.3]} rotation={[0, 2.2, 0]}>
        <Bx p={[0, 0.46, 0]} s={[0.46, 0.05, 0.46]} c="#454a4e" /><Bx p={[0, 0.8, -0.22]} s={[0.44, 0.5, 0.04]} c="#454a4e" />
        {[[-.2, -.2], [.2, -.2], [-.2, .2], [.2, .2]].map(([x, z], i) => <Bx key={i} p={[x, 0.22, z]} s={[0.04, 0.44, 0.04]} c="#1f2021" />)}
      </group>
      {/* school bag on the floor */}
      <group position={[1.15, 0, -2.45]} rotation={[0, -0.5, 0.0]}>
        <Bx p={[0, 0.22, 0]} s={[0.34, 0.44, 0.2]} c="#363f45" r={0.8} /><Bx p={[0, 0.12, 0.13]} s={[0.26, 0.2, 0.07]} c="#2d3539" /><Bx p={[0, 0.34, 0.11]} s={[0.1, 0.03, 0.01]} c="#7b8286" shadow={false} />
        <Bx p={[-0.13, 0.28, -0.11]} s={[0.04, 0.34, 0.02]} c="#222a2e" /><Bx p={[0.13, 0.28, -0.11]} s={[0.04, 0.34, 0.02]} c="#222a2e" />
      </group>

      {/* the dustbin: beside the desk, by the door */}
      <group position={[1.75, 0, -3.1]}>
        <mesh geometry={m.bin} castShadow receiveShadow><meshStandardMaterial color="#505356" metalness={0.35} roughness={0.55} side={THREE.DoubleSide} /></mesh>
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.28, 32]} /><meshStandardMaterial color="#0b0b0c" {...D} /></mesh>
        {[[0, 0.52, 0, 0], [-0.12, 0.5, 0.08, 1], [0.12, 0.51, -0.07, 2], [0.06, 0.47, 0.14, 3], [-0.13, 0.46, -0.1, 4], [0.15, 0.45, 0.09, 5]].map(([x, y, z, k], i) =>
          <mesh key={i} geometry={m.paper[k]} position={[x, y, z]} rotation={[hash(i) * 3, hash(i + 4) * 3, 0]} castShadow receiveShadow>{paperMat}</mesh>)}
      </group>
      {[[1.3, 0.06, -2.85, 6], [1.55, 0.06, -2.2, 7], [2.2, 0.06, -2.7, 1], [1.95, 0.06, -3.45, 2], [0.95, 0.06, -1.9, 3]].map(([x, y, z, k], i) =>
        <mesh key={i} geometry={m.paper[k]} position={[x, y, z]} rotation={[hash(i + 20) * 3, hash(i + 24) * 3, 0]} castShadow receiveShadow><meshStandardMaterial color="#d3d0ca" emissive="#33322f" emissiveIntensity={0.5} {...D} /></mesh>)}

      {/* right wall: uniform on a hook, a poster, a clock */}
      <group position={[W - 0.06, 0, -1.2]} rotation={[0, -Math.PI / 2, 0]}>
        <Bx p={[0, 1.78, 0]} s={[0.05, 0.05, 0.08]} c="#6f7376" shadow={false} />
        <Bx p={[0, 1.4, 0.04]} s={[0.4, 0.62, 0.09]} c="#5f6468" /><Bx p={[-0.28, 1.45, 0.04]} s={[0.12, 0.42, 0.08]} c="#5b6064" rot={[0, 0, 0.12]} /><Bx p={[0.28, 1.45, 0.04]} s={[0.12, 0.42, 0.08]} c="#5b6064" rot={[0, 0, -0.12]} />
        <Bx p={[0, 0.78, 0.04]} s={[0.34, 0.8, 0.08]} c="#2e3236" />
      </group>
      <mesh position={[W - 0.01, 1.65, 0.7]} rotation={[0, -Math.PI / 2, 0]}><planeGeometry args={[0.55, 0.78]} /><meshStandardMaterial map={m.posters[0]} {...D} /></mesh>
      <mesh position={[-W + 0.01, 1.7, -0.9]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[0.55, 0.78]} /><meshStandardMaterial map={m.posters[1]} {...D} /></mesh>
      <mesh position={[W - 0.01, 2.25, -1.8]} rotation={[0, -Math.PI / 2, 0]}><circleGeometry args={[0.17, 32]} /><meshStandardMaterial map={m.clock} {...D} /></mesh>

      {/* dust in the air */}
      <points ref={dust}><bufferGeometry><bufferAttribute attach="attributes-position" array={dustPts} count={300} itemSize={3} /></bufferGeometry><pointsMaterial size={0.012} color="#b9c1c8" transparent opacity={0.3} depthWrite={false} sizeAttenuation /></points>
    </>
  );
}

/* ---------- the camera: wide and still, then it walks toward the bin and looks in ---------- */
function Rig({ reduce, onReady, play }) {
  const { camera } = useThree(); const t0 = useRef(null);
  useFrame((s) => {
    if (!play) { camera.position.set(-0.4, 1.5, 3.0); camera.lookAt(0.7, 0.95, -2.6); return; }
    if (t0.current === null) { t0.current = s.clock.elapsedTime; onReady && onReady(); }
    const dbg = new URLSearchParams(location.search).get('roomT');
    const t = dbg !== null ? +dbg : s.clock.elapsedTime - t0.current;
    // wide → close on the desk (read the sheet) → across to the dustbin → look in
    const a = reduce ? 1 : ease(clamp01((t - 1.4) / 5.2)), b = reduce ? 1 : ease(clamp01((t - 8.0) / 3.8));
    const P0 = [-0.4, 1.5, 3.0], T0 = [0.7, 0.95, -2.6], P1 = [0.62, 1.2, -1.45], T1 = [0.6, 1.02, -3.2], P2 = [1.75, 0.98, -2.45], T2 = [1.75, 0.22, -3.1];
    const lp = (A, B, u) => A.map((v, i) => mix(v, B[i], u));
    const p = lp(lp(P0, P1, a), P2, b), g = lp(lp(T0, T1, a), T2, b);
    const sway = reduce ? 0 : (1 - b * 0.8);
    camera.position.set(p[0] + Math.sin(t * 0.45) * 0.025 * sway, p[1] + Math.sin(t * 0.6) * 0.012 * sway, p[2]);
    camera.lookAt(g[0], g[1], g[2]);
    const fov = mix(56, 40, a * 0.6 + b * 0.4); if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  });
  return null;
}

export default function RoomCanvas({ reduce, onReady, play }) {
  return (
    <Canvas frameloop={play ? 'always' : 'demand'} shadows={{ type: THREE.PCFSoftShadowMap }} dpr={[1, 1.75]} camera={{ fov: 56, near: 0.05, far: 30, position: [-0.4, 1.5, 3.0] }} gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.25; }}>
      <Room /><Rig reduce={reduce} onReady={onReady} play={play} />
    </Canvas>
  );
}
