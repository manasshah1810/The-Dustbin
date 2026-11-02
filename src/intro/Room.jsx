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
  x.fillStyle = '#74787b'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) { const g = x.createRadialGradient(hash(i) * w, hash(i + 40) * h, 4, hash(i) * w, hash(i + 40) * h, 60 + hash(i + 7) * 140); g.addColorStop(0, `rgba(${hash(i) < .5 ? 40 : 110},${hash(i) < .5 ? 42 : 112},${hash(i) < .5 ? 44 : 114},.13)`); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }
  speckle(x, w, h, 6000, .08);
  x.fillStyle = 'rgba(30,30,32,.10)'; for (let i = 0; i < 8; i++) x.fillRect(hash(i * 9) * w, 0, 1 + hash(i) * 2, h);  // faint peeling lines
}, [3, 1.4]);
const floorTex = () => canvasTex(1024, 1024, (x, w, h) => {
  const pw = 128; for (let i = 0; i < w / pw; i++) { const v = 52 + hash(i * 5) * 16; x.fillStyle = `rgb(${v},${v - 1},${v - 3})`; x.fillRect(i * pw, 0, pw, h);
    for (let j = 0; j < 6; j++) { const y0 = hash(i * 13 + j) * h; x.fillStyle = `rgba(0,0,0,${.05 + hash(j + i) * .06})`; x.fillRect(i * pw, y0, pw, 2 + hash(j) * 30); }
    x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(i * pw, 0, 2, h); for (let k = 0; k < 4; k++) x.fillRect(i * pw, hash(i + k * 3) * h, pw, 1.5); }
  speckle(x, w, h, 9000, .1);
}, [2.4, 2.4]);
const linenTex = (c1, c2) => canvasTex(256, 256, (x, w, h) => { x.fillStyle = c1; x.fillRect(0, 0, w, h); for (let i = 0; i < h; i += 3) { x.fillStyle = c2; x.fillRect(0, i, w, 1); } speckle(x, w, h, 2500, .12); }, [3, 3]);

function screenTex(font) {
  return canvasTex(1024, 640, (x, w, h) => {
    x.fillStyle = '#1b1d1f'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#26292c'; x.fillRect(0, 0, w, 34); x.fillStyle = '#4a4e52'; [18, 40, 62].forEach((cx) => { x.beginPath(); x.arc(cx, 17, 6, 0, 7); x.fill(); });
    x.save(); x.translate(w / 2, h / 2 + 18); x.rotate(-0.025);
    x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(-286, -262, 584, 540);
    x.fillStyle = '#d4d2cc'; x.fillRect(-292, -270, 584, 540);
    x.fillStyle = '#9b9992'; for (let i = 0; i < 9; i++) x.fillRect(-250, -222 + i * 20, 160 + hash(i * 3) * 190, 7);   // scribbled lines
    x.strokeStyle = '#6f6d67'; x.lineWidth = 1; for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(-250, 10 + i * 30); x.lineTo(250, 10 + i * 30); x.stroke(); }
    x.fillStyle = '#242424'; x.font = `210px ${font}, 'Caveat', cursive`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('2 / 30', 0, -30);
    x.strokeStyle = '#2d2d2d'; x.lineWidth = 8; x.lineCap = 'round'; x.beginPath(); x.ellipse(2, -22, 232, 118, -0.04, 0.2, 6.4); x.stroke();   // circled, in pen
    x.restore();
  });
}

/* ---------- little builders ---------- */
function crumple(r, seed, detail = 2) {
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

/* ---------- scene ---------- */
function Room() {
  const [fontReady, setFont] = useState(false);
  useEffect(() => { let on = true; (document.fonts ? document.fonts.load("200px Caveat", '2/30') : Promise.resolve()).catch(() => {}).then(() => on && setFont(true)); return () => { on = false; }; }, []);
  const m = useMemo(() => ({ wall: wallTex(), floor: floorTex(), sheet: linenTex('#44484c', '#3b3f43'), pillow: linenTex('#6d6f70', '#62646a'), bin: binGeometry(), blanket: blanketGeometry(),
    paper: [crumple(0.07, 1), crumple(0.08, 2), crumple(0.065, 3), crumple(0.075, 4), crumple(0.06, 5), crumple(0.08, 6), crumple(0.07, 7), crumple(0.06, 8)] }), []);
  const screen = useMemo(() => (fontReady ? screenTex('Caveat') : null), [fontReady]);
  const glow = useRef(); const dust = useRef();
  const dustPts = useMemo(() => { const a = new Float32Array(260 * 3); for (let i = 0; i < 260; i++) { a[i * 3] = (hash(i) - .5) * 7; a[i * 3 + 1] = hash(i + 50) * 3; a[i * 3 + 2] = (hash(i + 90) - .5) * 6; } return a; }, []);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    if (glow.current) glow.current.intensity = 2.6 + Math.sin(t * 0.7) * 0.08;
    if (dust.current) dust.current.rotation.y = t * 0.012, dust.current.position.y = Math.sin(t * 0.2) * 0.05;
  });
  const dull = { roughness: 0.95, metalness: 0 };
  return (
    <>
      <color attach="background" args={['#0d0e0f']} />
      <fog attach="fog" args={['#0d0e0f', 4, 11]} />
      <ambientLight intensity={0.85} color="#aab2b8" />
      <hemisphereLight args={['#8d969c', '#1a1a1a', 0.7]} />
      <directionalLight position={[-1.4, 2.7, -4.8]} target-position={[0.6, 0, 0]} intensity={1.6} color="#b4bfc8" castShadow shadow-mapSize={[1536, 1536]} shadow-bias={-0.0004} shadow-normalBias={0.02}
        shadow-camera-left={-5} shadow-camera-right={5} shadow-camera-top={4} shadow-camera-bottom={-4} shadow-camera-near={0.5} shadow-camera-far={14} />
      <pointLight ref={glow} position={[1.27, 1.02, -2.15]} color="#c4d0dc" intensity={2.6} distance={6.5} decay={1.7} />
      <spotLight position={[0.7, 2.6, -0.8]} angle={0.55} penumbra={1} intensity={3.2} decay={1.4} color="#9aa3aa" distance={6} />

      {/* shell */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[9, 8]} /><meshStandardMaterial map={m.floor} {...dull} roughness={0.78} /></mesh>
      <mesh position={[0, 1.6, -3.6]}><planeGeometry args={[9, 3.2]} /><meshStandardMaterial map={m.wall} {...dull} /></mesh>
      <mesh position={[-4.1, 1.6, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[8, 3.2]} /><meshStandardMaterial map={m.wall} {...dull} /></mesh>
      <mesh position={[4.1, 1.6, 0]} rotation={[0, -Math.PI / 2, 0]}><planeGeometry args={[8, 3.2]} /><meshStandardMaterial map={m.wall} {...dull} /></mesh>
      <mesh position={[0, 3.2, 0]} rotation={[Math.PI / 2, 0, 0]}><planeGeometry args={[9, 8]} /><meshStandardMaterial color="#2c2d2e" {...dull} /></mesh>
      <mesh position={[0, 0.07, -3.58]}><boxGeometry args={[9, 0.14, 0.04]} /><meshStandardMaterial color="#3f4143" {...dull} /></mesh>

      {/* window, overcast */}
      <group position={[-0.9, 1.75, -3.57]}>
        <mesh><planeGeometry args={[0.95, 1.25]} /><meshBasicMaterial color="#8c949a" toneMapped={false} /></mesh>
        {[-0.42, -0.14, 0.14, 0.42].map((y, i) => <mesh key={i} position={[0, y, 0.02]}><boxGeometry args={[0.95, 0.05, 0.01]} /><meshStandardMaterial color="#6a6d70" {...dull} /></mesh>)}
        {[[0, 0.64, 0.04, 1.3], [0, -0.64, 0.04, 1.3]].map(([x, y], i) => <mesh key={'h' + i} position={[x, y, 0.02]}><boxGeometry args={[1.05, 0.06, 0.06]} /><meshStandardMaterial color="#35373a" {...dull} /></mesh>)}
        {[-0.5, 0.5].map((x, i) => <mesh key={'v' + i} position={[x, 0, 0.02]}><boxGeometry args={[0.06, 1.3, 0.06]} /><meshStandardMaterial color="#35373a" {...dull} /></mesh>)}
      </group>

      {/* bed along the left wall, unmade */}
      <group position={[-2.35, 0, -1.4]} rotation={[0, 0.05, 0]}>
        <mesh position={[0, 0.17, 0]} castShadow receiveShadow><boxGeometry args={[1.12, 0.22, 2.2]} /><meshStandardMaterial color="#2d2f31" {...dull} /></mesh>
        {[[-.5, -1.05], [.5, -1.05], [-.5, 1.05], [.5, 1.05]].map(([x, z], i) => <mesh key={i} position={[x, 0.04, z]}><boxGeometry args={[0.07, 0.08, 0.07]} /><meshStandardMaterial color="#222" {...dull} /></mesh>)}
        <mesh position={[0, 0.4, 0]} castShadow receiveShadow><boxGeometry args={[1.04, 0.24, 2.12]} /><meshStandardMaterial map={m.sheet} {...dull} /></mesh>
        <mesh position={[0, 0.535, 0.25]} castShadow receiveShadow geometry={m.blanket} rotation={[0, 0.06, 0]}><meshStandardMaterial map={m.sheet} color="#8d9296" {...dull} side={THREE.DoubleSide} /></mesh>
        <mesh position={[0, 0.62, -0.78]} scale={[0.5, 0.15, 0.31]} rotation={[0.08, 0.1, 0.02]} castShadow><sphereGeometry args={[1, 28, 20]} /><meshStandardMaterial map={m.pillow} {...dull} /></mesh>
        <mesh position={[0, 0.9, -1.12]} castShadow><boxGeometry args={[1.12, 0.62, 0.06]} /><meshStandardMaterial color="#2a2b2d" {...dull} /></mesh>
      </group>

      {/* desk + laptop + chair */}
      <group position={[1.35, 0, -2.85]}>
        <mesh position={[0, 0.75, 0]} castShadow receiveShadow><boxGeometry args={[1.55, 0.055, 0.78]} /><meshStandardMaterial color="#3d3b39" {...dull} roughness={0.7} /></mesh>
        {[[-.72, -.34], [.72, -.34], [-.72, .34], [.72, .34]].map(([x, z], i) => <mesh key={i} position={[x, 0.37, z]} castShadow><boxGeometry args={[0.05, 0.75, 0.05]} /><meshStandardMaterial color="#2a2928" {...dull} /></mesh>)}
        <mesh position={[0, 0.2, 0.34]}><boxGeometry args={[1.4, 0.03, 0.03]} /><meshStandardMaterial color="#2a2928" {...dull} /></mesh>
        <group position={[-0.05, 0.78, 0.04]} rotation={[0, -0.08, 0]} scale={1.7}>
          <mesh position={[0, 0.01, 0.1]} castShadow><boxGeometry args={[0.38, 0.02, 0.26]} /><meshStandardMaterial color="#4a4c4f" metalness={0.5} roughness={0.5} /></mesh>
          <group position={[0, 0.02, -0.03]} rotation={[-0.2, 0, 0]}>
            <mesh position={[0, 0.125, 0]} castShadow><boxGeometry args={[0.38, 0.25, 0.012]} /><meshStandardMaterial color="#303234" metalness={0.5} roughness={0.5} /></mesh>
            <mesh position={[0, 0.125, 0.0075]}><planeGeometry args={[0.35, 0.219]} />{screen ? <meshBasicMaterial map={screen} toneMapped={false} /> : <meshBasicMaterial color="#1b1d1f" />}</mesh>
          </group>
        </group>
        <mesh position={[0.5, 0.8, 0.1]} castShadow><cylinderGeometry args={[0.04, 0.035, 0.09, 16]} /><meshStandardMaterial color="#555a5e" {...dull} roughness={0.5} /></mesh>
        <mesh position={[-0.55, 0.78, 0.2]} rotation={[0, 0.3, 0]}><boxGeometry args={[0.21, 0.012, 0.29]} /><meshStandardMaterial color="#9b9a95" {...dull} /></mesh>
        <mesh position={[-0.6, 0.79, 0.12]} rotation={[0, -0.2, 0]}><boxGeometry args={[0.21, 0.012, 0.29]} /><meshStandardMaterial color="#8d8c87" {...dull} /></mesh>
      </group>
      <group position={[1.05, 0, -1.85]} rotation={[0, 2.5, 0]}>
        <mesh position={[0, 0.46, 0]} castShadow><boxGeometry args={[0.46, 0.05, 0.46]} /><meshStandardMaterial color="#45484b" {...dull} /></mesh>
        <mesh position={[0, 0.78, -0.22]} castShadow><boxGeometry args={[0.44, 0.5, 0.04]} /><meshStandardMaterial color="#45484b" {...dull} /></mesh>
        {[[-.2, -.2], [.2, -.2], [-.2, .2], [.2, .2]].map(([x, z], i) => <mesh key={i} position={[x, 0.22, z]}><boxGeometry args={[0.04, 0.44, 0.04]} /><meshStandardMaterial color="#1f2021" {...dull} /></mesh>)}
      </group>

      {/* the dustbin */}
      <group position={[0.7, 0, -1.0]}>
        <mesh geometry={m.bin} castShadow receiveShadow><meshStandardMaterial color="#4b4e51" metalness={0.35} roughness={0.55} side={THREE.DoubleSide} /></mesh>
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.28, 32]} /><meshStandardMaterial color="#0b0b0c" {...dull} /></mesh>
        {[[0, 0.52, 0, 0], [-0.12, 0.5, 0.08, 1], [0.12, 0.51, -0.07, 2], [0.06, 0.47, 0.14, 3], [-0.13, 0.46, -0.1, 4], [0.15, 0.45, 0.09, 5]].map(([x, y, z, k], i) =>
          <mesh key={i} geometry={m.paper[k]} position={[x, y, z]} rotation={[hash(i) * 3, hash(i + 4) * 3, 0]} castShadow receiveShadow><meshStandardMaterial color="#dcd9d3" emissive="#3a3935" emissiveIntensity={0.5} {...dull} /></mesh>)}
      </group>
      {/* spilled, never reached it */}
      {[[0.2, 0.06, -0.5, 6], [1.15, 0.06, -0.7, 7], [-0.1, 0.06, -1.3, 1], [0.95, 0.06, -1.55, 2]].map(([x, y, z, k], i) =>
        <mesh key={i} geometry={m.paper[k]} position={[x, y, z]} rotation={[hash(i + 20) * 3, hash(i + 24) * 3, 0]} castShadow receiveShadow><meshStandardMaterial color="#d3d0ca" emissive="#33322f" emissiveIntensity={0.5} {...dull} /></mesh>)}

      {/* dust in the air */}
      <points ref={dust}><bufferGeometry><bufferAttribute attach="attributes-position" array={dustPts} count={260} itemSize={3} /></bufferGeometry><pointsMaterial size={0.012} color="#b9c1c8" transparent opacity={0.35} depthWrite={false} sizeAttenuation /></points>
    </>
  );
}

/* ---------- the camera: wide and still, then it walks toward the bin and looks in ---------- */
function Rig({ reduce, onReady }) {
  const { camera } = useThree(); const t0 = useRef(null);
  useFrame((s) => {
    if (t0.current === null) { t0.current = s.clock.elapsedTime; onReady && onReady(); }
    const dbg = new URLSearchParams(location.search).get('roomT');
    const t = dbg !== null ? +dbg : s.clock.elapsedTime - t0.current;
    const a = reduce ? 1 : ease(clamp01((t - 1.6) / 7.4)), b = reduce ? 1 : ease(clamp01((t - 8.2) / 3.4));
    const P0 = [-0.15, 1.45, 3.2], T0 = [0.45, 0.85, -1.7], P1 = [0.72, 1.05, 0.3], T1 = [0.7, 0.3, -1.0], P2 = [0.7, 1.05, -0.45], T2 = [0.7, 0.2, -1.0];
    const lp = (A, B, u) => A.map((v, i) => mix(v, B[i], u));
    const p = lp(lp(P0, P1, a), P2, b), g = lp(lp(T0, T1, a), T2, b);
    const sway = reduce ? 0 : (1 - b * 0.8);
    camera.position.set(p[0] + Math.sin(t * 0.45) * 0.03 * sway, p[1] + Math.sin(t * 0.6) * 0.015 * sway, p[2]);
    camera.lookAt(g[0], g[1], g[2]);
    const fov = mix(54, 42, a * 0.6 + b * 0.4); if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  });
  return null;
}

export default function RoomCanvas({ reduce, onReady }) {
  return (
    <Canvas shadows={{ type: THREE.PCFSoftShadowMap }} dpr={[1, 1.75]} camera={{ fov: 54, near: 0.05, far: 30, position: [0.15, 1.5, 3.7] }} gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.25; }}>
      <Room /><Rig reduce={reduce} onReady={onReady} />
    </Canvas>
  );
}
