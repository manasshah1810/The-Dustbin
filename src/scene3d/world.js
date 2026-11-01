import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { clamp, lerp, smooth, easeInOut, mulberry } from './util.js';
import { makeState, resolveTarget, NUM_KEYS, COLOR_KEYS } from './chapters.js';
import { createBin } from './bin.js';
import { createFloor } from './floor.js';
import { createLights } from './lights.js';
import { createDust } from './dust.js';
import { createPaper, PAPER_W, PAPER_H } from './paper.js';

const TITLES = [null, '2 / 30', '55 hands', 'not selected', 'small scope', 'still crumpled'];
// resting poses: ball center positions (inside the bin mouth or on the sand around it)
const REST = [
  null,
  { p: [0.12, 1.2, 0.1], r: [0.4, 1.1, 0.2] },
  { p: [-0.2, 1.1, 0.14], r: [1.3, 0.3, 0.8] },
  { p: [0.2, 1.04, -0.12], r: [2.1, 0.9, 0.1] },
  { p: [0.92, 0.15, 0.55], r: [0.5, 2.0, 1.1] },
  { p: [-0.98, 0.15, 0.42], r: [1.0, 0.2, 2.2] },
];
const USER_REST = { p: [0.0, 1.02, -0.03], r: [0.7, 0.4, 1.5] };

export async function createWorld(canvas, opts = {}) {
  const quality = ['high', 'mid', 'low'].includes(opts.quality) ? opts.quality : 'mid';
  const reduced = !!opts.reducedMotion;
  const dprCap = quality === 'low' ? 1.25 : quality === 'mid' ? 1.75 : 2;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', alpha: false, powerPreference: 'high-performance' });
  } catch (e) { throw new Error('WebGL unavailable'); }
  if (!renderer || !renderer.getContext()) throw new Error('WebGL unavailable');
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (quality !== 'low') { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0e0c0b, 0.085);
  scene.background = new THREE.Color(0x0e0c0b);

  let envRT = null;
  if (quality !== 'low') {
    const pm = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    envRT = pm.fromScene(room, 0.04);
    scene.environment = envRT.texture;
    room.traverse((o) => { o.geometry && o.geometry.dispose(); o.material && o.material.dispose && o.material.dispose(); });
    pm.dispose();
  }

  const camera = new THREE.PerspectiveCamera(50, 9 / 16, 0.05, 60);
  const lights = createLights(scene, quality);
  const floor = createFloor(quality); scene.add(floor.group);
  const bin = createBin(quality); scene.add(bin.group);
  const dust = createDust(scene, quality, reduced);

  // ---------- papers ----------
  const papers = [null];
  const mkPaperObj = (i, spec, rest) => {
    const pp = createPaper({ title: spec.title, body: spec.body, seed: spec.seed, castShadow: true });
    const o = {
      i, ...pp, rest: {
        pos: new THREE.Vector3(...rest.p), quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(...rest.r)), scale: 1,
      },
      cr: 1, curl: 0, openT: 0, mode: 'free', trem: 0, scaleMul: 1,
    };
    o.mesh.position.copy(o.rest.pos); o.mesh.quaternion.copy(o.rest.quat);
    o.mesh.visible = false; scene.add(o.mesh);
    return o;
  };
  for (let i = 1; i <= 5; i++) papers.push(mkPaperObj(i, { title: TITLES[i], seed: i }, REST[i]));
  let userPaper = null;

  // ---------- state ----------
  let chapter = 0, chT = 0, time = 0, tremble = false, paused = false, lost = false, disposed = false, raf = 0;
  let active = null;
  const cur = makeState(), tgt = makeState();
  resolveTarget(tgt, 0, 0);
  for (const k of NUM_KEYS) cur[k] = tgt[k];
  for (const k of COLOR_KEYS) cur[k].copy(tgt[k]);
  const par = { x: 0, y: 0, sx: 0, sy: 0 };
  let W = 1, Hh = 1, pxScale = 600;

  const sfx = (type, x = 0, gain = 0.8) => {
    try { opts.onSfx && opts.onSfx({ type, pan: clamp(x / 1.4, -1, 1), gain: clamp(gain, 0, 1) }); } catch (e) { /* ignore */ }
  };

  // ---------- tweens ----------
  const tweens = new Set();
  function tween(dur, fn, owner = null, delay = 0) {
    return new Promise((res) => {
      tweens.add({ t: -delay, dur: Math.max(0.001, dur * (reduced ? 0.55 : 1)), fn, res, owner });
    });
  }
  function cancelFor(owner) { if (owner) owner.gen = (owner.gen || 0) + 1; for (const tw of [...tweens]) if (tw.owner === owner) { tweens.delete(tw); tw.res(); } }
  const wait = (s, owner) => tween(s, () => {}, owner);
  function stepTweens(dt) {
    for (const tw of [...tweens]) {
      tw.t += dt;
      if (tw.t < 0) continue;
      const p = clamp(tw.t / tw.dur);
      try { tw.fn(p); } catch (e) { /* keep animation alive */ }
      if (p >= 1) { tweens.delete(tw); tw.res(); }
    }
  }

  // ---------- camera ----------
  const camBase = new THREE.Vector3(), camTarget = new THREE.Vector3();
  const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion();
  function updateCamera(dt) {
    const a = W / Hh;
    const t = clamp((a - 0.5) / 1.0);
    const fov = lerp(54, 38, t);
    if (Math.abs(camera.fov - fov) > 0.01 || Math.abs(camera.aspect - a) > 1e-4) { camera.fov = fov; camera.aspect = a; camera.updateProjectionMatrix(); }
    const ht = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const dist = Math.max(1.15 / (ht * a), 2.1 / ht) * cur.camDist;
    par.sx += (par.x - par.sx) * (1 - Math.exp(-dt * 3)); par.sy += (par.y - par.sy) * (1 - Math.exp(-dt * 3));
    const drift = reduced ? 0 : 1;
    const dx = Math.sin(time * 0.21) * 0.07 * drift, dy = Math.sin(time * 0.17 + 1) * 0.035 * drift, dz = Math.sin(time * 0.13 + 2) * 0.06 * drift;
    camTarget.set(par.sx * 0.1, cur.ty + par.sy * 0.05, 0);
    camBase.set(cur.camX + dx + par.sx * 0.28, cur.ty + Math.sin(cur.pitch) * dist + dy + par.sy * 0.14, Math.cos(cur.pitch) * dist + dz);
    camera.position.copy(camBase);
    camera.lookAt(camTarget);
    if (cur.roll) camera.rotateZ(cur.roll);
    camera.updateMatrixWorld();
    pxScale = (renderer.domElement.height) / (2 * ht);
  }

  // ---------- paper poses ----------
  const readPos = new THREE.Vector3(), P1 = new THREE.Vector3(), P2 = new THREE.Vector3();
  let readScale = 1;
  function readingPose() {
    const d = 1.5;
    const ht = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const vh = 2 * d * ht, vw = vh * camera.aspect;
    readScale = Math.min((0.86 * vw) / PAPER_W, (0.8 * vh) / PAPER_H);
    tmpV.set(0, 0, -d).applyQuaternion(camera.quaternion);
    readPos.copy(camera.position).add(tmpV);
  }
  function cubic(out, a, b, c, d, t) {
    const u = 1 - t, w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
    return out.set(a.x * w0 + b.x * w1 + c.x * w2 + d.x * w3, a.y * w0 + b.y * w1 + c.y * w2 + d.y * w3, a.z * w0 + b.z * w1 + c.z * w2 + d.z * w3);
  }
  function applyPath(p) {
    const t = clamp(p.openT, 0, 1);
    const r = p.rest.pos;
    P1.set(r.x * 0.5, bin.topY + 1.45, r.z * 0.5 + 0.3);
    P2.lerpVectors(P1, readPos, 0.55); P2.y += 0.15;
    cubic(p.mesh.position, r, P1, P2, readPos, t);
    const e = smooth(t);
    p.mesh.quaternion.copy(p.rest.quat).slerp(camera.quaternion, e);
    p.mesh.scale.setScalar(lerp(p.rest.scale, readScale, e) * p.scaleMul);
    if (t > 0.9 && !reduced) { // gentle float while held
      const f = (t - 0.9) * 10;
      p.mesh.position.x += Math.sin(time * 0.9) * 0.004 * f; p.mesh.position.y += Math.sin(time * 0.7 + 1) * 0.004 * f;
    }
    p.trem = 0;
    if (tremble && t > 0.85) {
      const a = reduced ? 0.12 : 1;
      tmpV.set(Math.sin(time * 23) * 0.0045 * a, Math.sin(time * 29 + 1) * 0.0035 * a, 0).applyQuaternion(camera.quaternion);
      p.mesh.position.add(tmpV);
      tmpQ.setFromAxisAngle(new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion), Math.sin(time * 17) * 0.007 * a);
      p.mesh.quaternion.premultiply(tmpQ);
      p.trem = (Math.sin(time * 9) * 0.02 + Math.sin(time * 5.3) * 0.015) * a;
    }
  }

  async function dropTo(p, restPose = p.rest, spin = true) {
    p.mode = 'free';
    const gen = p.gen;
    const s0 = p.mesh.position.clone(), q0 = p.mesh.quaternion.clone(), sc0 = p.mesh.scale.x, q1 = restPose.quat;
    const h = Math.max(0.05, s0.y - restPose.pos.y);
    const tf = Math.sqrt((2 * h) / 9) * 1.1 + 0.08;
    await tween(tf, (r) => {
      const e = r * r;
      p.mesh.position.set(lerp(s0.x, restPose.pos.x, smooth(r)), s0.y - (s0.y - restPose.pos.y) * e, lerp(s0.z, restPose.pos.z, smooth(r)));
      p.mesh.quaternion.copy(q0).slerp(q1, smooth(r));
      p.mesh.scale.setScalar(lerp(sc0, restPose.scale, smooth(r)));
    }, p);
    if (p.gen !== gen) return;
    const x = restPose.pos.x;
    sfx('thud', x, clamp(0.35 + h * 0.25, 0.3, 0.9)); sfx('puff', x, 0.45);
    dust.puff(x, Math.max(0.05, restPose.pos.y - 0.1), restPose.pos.z, p.i === 0 ? 0.8 : 1);
    const by = restPose.pos.y;
    await tween(0.34, (r) => { p.mesh.position.y = by + 0.07 * 4 * r * (1 - r) * (1 - r * 0.4); }, p);
    if (p.gen !== gen) return;
    p.mesh.position.copy(restPose.pos); p.mesh.quaternion.copy(restPose.quat); p.mesh.scale.setScalar(restPose.scale);
  }

  async function appear(p) {
    cancelFor(p);
    p.mode = 'free'; p.cr = 1; p.curl = 0;
    const rp = p.rest;
    p.mesh.visible = true;
    p.mesh.position.set(rp.pos.x, rp.pos.y + 2.4, rp.pos.z); p.mesh.quaternion.copy(rp.quat).multiply(tmpQ2.setFromEuler(new THREE.Euler(1.5, 0.6, 0.9)));
    p.mesh.scale.setScalar(1);
    const gen = p.gen;
    await wait(0.5, p);
    if (p.gen !== gen) return;
    await dropTo(p);
  }

  function showPapersFor(ch, instant) {
    const n = ch >= 6 ? 5 : Math.max(1, ch);
    for (let i = 1; i <= 5; i++) {
      const p = papers[i];
      if (i <= n) {
        if (!p.mesh.visible && p !== active) { if (instant) { cancelFor(p); p.mesh.visible = true; p.mesh.position.copy(p.rest.pos); p.mesh.quaternion.copy(p.rest.quat); } else appear(p); }
      } else if (p !== active) { cancelFor(p); p.mesh.visible = false; }
    }
  }

  // ---------- public API ----------
  const world = {
    setChapter(i, o = {}) {
      if (disposed) return;
      i = clamp(Math.round(i), 0, 6);
      const changed = i !== chapter;
      chapter = i; if (changed || o.instant) chT = 0;
      resolveTarget(tgt, chapter, chT);
      if (o.instant) { for (const k of NUM_KEYS) cur[k] = tgt[k]; for (const k of COLOR_KEYS) cur[k].copy(tgt[k]); }
      showPapersFor(chapter, !!o.instant);
    },

    async openPaper(i) {
      if (disposed) return;
      if (active) await world.closePaper();
      const p = papers[i]; if (!p) return;
      cancelFor(p);
      p.mesh.visible = true; p.mode = 'path'; p.openT = 0; p.cr = 1; p.curl = 0; p.scaleMul = 1;
      p.mesh.position.copy(p.rest.pos); p.mesh.quaternion.copy(p.rest.quat); p.mesh.scale.setScalar(1);
      active = p;
      const crEnd = i === 5 ? 0.5 : 0;
      sfx('lift', p.rest.pos.x, 0.8);
      let played = false;
      await tween(1.6, (r) => {
        p.openT = easeInOut(r);
        const u = smooth((r - 0.28) / 0.72);
        p.cr = lerp(1, crEnd, u);
        p.curl = Math.sin(u * Math.PI) * 0.85 + 0.15 * u;
        if (!played && r > 0.32) { played = true; sfx('unfold', 0, 0.8); }
      }, p);
      p.openT = 1; p.cr = crEnd; p.curl = 0.15;
    },

    async closePaper() {
      const p = active; if (!p || disposed) return;
      cancelFor(p);
      await retract(p, 'fold');
    },

    setTremble(on) { tremble = !!on; },

    async submitUserPaper(text) {
      if (disposed) return;
      if (active) await world.closePaper();
      if (userPaper) { cancelFor(userPaper); scene.remove(userPaper.mesh); userPaper.dispose(); userPaper = null; }
      const body = String(text || '').slice(0, 700);
      const o = mkPaperObj(0, { title: '', body, seed: 11 }, USER_REST);
      userPaper = o; const p = o;
      p.mesh.visible = true; p.mode = 'path'; p.cr = 0; p.curl = 0.12; p.openT = 1; p.scaleMul = 0.9; active = p;
      sfx('unfold', 0, 0.5);
      await tween(0.6, (r) => { p.scaleMul = lerp(0.9, 1, smooth(r)); }, p);
      await wait(1.4, p);
      sfx('crumple', 0, 0.9);
      await retract(p, 'crumple', true);
    },

    setParallax(x, y) { par.x = clamp(+x || 0, -1, 1); par.y = clamp(+y || 0, -1, 1); },

    resize(w, h, dpr = 1) {
      if (disposed) return;
      W = Math.max(1, w | 0); Hh = Math.max(1, h | 0);
      renderer.setPixelRatio(Math.min(dpr || 1, dprCap));
      renderer.setSize(W, Hh, false);
      camera.aspect = W / Hh; camera.updateProjectionMatrix();
    },

    setPaused(b) {
      paused = !!b;
      if (paused) { cancelAnimationFrame(raf); raf = 0; } else start();
    },

    dispose() {
      if (disposed) return; disposed = true;
      cancelAnimationFrame(raf); raf = 0;
      canvas.removeEventListener('webglcontextlost', onLost); canvas.removeEventListener('webglcontextrestored', onRestored);
      for (const tw of [...tweens]) tw.res(); tweens.clear();
      papers.forEach((p) => { if (p) { scene.remove(p.mesh); p.dispose(); } });
      if (userPaper) { scene.remove(userPaper.mesh); userPaper.dispose(); }
      dust.dispose(); lights.dispose(); floor.dispose(); bin.dispose();
      if (envRT) envRT.dispose();
      renderer.dispose();
    },
  };

  // fold (or crumple) the active paper, carry it back along the curve, drop it with a bounce
  async function retract(p, kind, userDrop = false) {
    const cr0 = p.cr, cu0 = p.curl;
    if (kind === 'fold') sfx('fold', p.rest.pos.x, 0.7);
    let s2 = false;
    await tween(userDrop ? 1.0 : 0.85, (r) => {
      p.openT = lerp(1, 0.24, easeInOut(r));
      const u = smooth(r / 0.7);
      p.cr = lerp(cr0, 1, u);
      p.curl = lerp(cu0, 0, u) + Math.sin(u * Math.PI) * 0.4;
      if (!s2 && r > 0.45) { s2 = true; if (kind === 'fold') sfx('crumple', p.rest.pos.x, 0.5); }
    }, p);
    p.openT = 0.24; p.cr = 1; p.curl = 0;
    applyPath(p);
    if (active === p) active = null;
    p.trem = 0; p.scaleMul = 1;
    await dropTo(p, p.rest);
  }

  // ---------- context loss ----------
  function onLost(e) { e.preventDefault(); lost = true; cancelAnimationFrame(raf); raf = 0; }
  function onRestored() { lost = false; if (!paused && !disposed) start(); }
  canvas.addEventListener('webglcontextlost', onLost, false);
  canvas.addEventListener('webglcontextrestored', onRestored, false);

  // ---------- main loop ----------
  let last = 0, fAcc = 0, fN = 0;
  const lc = new THREE.Color();
  function frame(now) {
    raf = 0;
    if (disposed || paused || lost) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016); last = now;
    time += dt; chT += dt;
    if (opts.onFrameStats) { fAcc += dt; fN++; if (fAcc >= 1) { try { opts.onFrameStats(fN / fAcc); } catch (e) { /* */ } fAcc = 0; fN = 0; } }

    stepTweens(dt);

    resolveTarget(tgt, chapter, chT);
    const k = 1 - Math.exp(-dt * (reduced ? 2.5 : 1.3));
    for (const key of NUM_KEYS) cur[key] += (tgt[key] - cur[key]) * k;
    for (const key of COLOR_KEYS) cur[key].lerp(tgt[key], k);
    scene.background.copy(cur.bg); scene.fog.color.copy(cur.bg); scene.fog.density = cur.fog;
    scene.environmentIntensity = cur.env;
    bin.setGlow(cur.binEm);

    // ch5: slow unsettled sway of the lamp (no flashing: <0.5 Hz, tiny amplitude)
    const unsettled = chapter === 5 && !reduced ? 1 : 0;
    const sway = { x: unsettled * Math.sin(time * 0.9) * 0.12, i: unsettled * Math.sin(time * 0.55) * 0.03 };
    lights.update(cur, time, sway);
    dust.update(time, { pos: lights.spot.position, dir: lights.dir, tan: Math.tan(cur.angle) }, cur.spotColor, pxScale, 1);

    updateCamera(dt);
    readingPose();
    for (const p of papers) if (p && p.mode === 'path') applyPath(p);
    if (userPaper && userPaper.mode === 'path') applyPath(userPaper);
    const setU = (p) => { if (!p) return; p.U.uCrumple.value = clamp(p.cr + (p.trem || 0)); p.U.uCurl.value = p.curl; };
    papers.forEach(setU); setU(userPaper);

    renderer.render(scene, camera);
  }
  function start() { if (!raf && !disposed && !lost) { last = 0; raf = requestAnimationFrame(frame); } }

  // init
  world.resize(canvas.clientWidth || canvas.width || 390, canvas.clientHeight || canvas.height || 844, window.devicePixelRatio || 1);
  world.setChapter(0, { instant: true });
  start();
  return world;
}
