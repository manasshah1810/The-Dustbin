// Procedural Web Audio engine for "The Dustbin". No audio files. Every method is no-op safe and never throws.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rnd = (a, b) => a + Math.random() * (b - a);

let ctx = null, master = null, comp = null, ambBus = null, duckGain = null, voiceBus = null;
let brownBuf = null, whiteBuf = null;
let muted = false, ducked = false, chapter = 0, unlocked = false, pendingChapter = 0, paused = false;
const L = {}; // layer gain nodes
const MASTER_LEVEL = 0.8;

// Per-chapter layer targets: room, hum, wind, hiss, spot, drone, tremble, plus wind filter freq and room lowpass
const CH = [
  { room: 0.07, hum: 0.012, wind: 0.02, hiss: 0.004, spot: 0.006, drone: 0, tremble: 0, wf: 380, rf: 160 },  // 0 near-silent dim room
  { room: 0.09, hum: 0.012, wind: 0.06, hiss: 0.008, spot: 0.0, drone: 0, tremble: 0, wf: 480, rf: 200 },
  { room: 0.09, hum: 0.012, wind: 0.07, hiss: 0.009, spot: 0.0, drone: 0, tremble: 0, wf: 520, rf: 200 },
  { room: 0.05, hum: 0.006, wind: 0.07, hiss: 0.012, spot: 0.0, drone: 0, tremble: 0, wf: 900, rf: 120 },  // 3 colder/thinner
  { room: 0.13, hum: 0.016, wind: 0.03, hiss: 0.006, spot: 0.0, drone: 0.1, tremble: 0, wf: 300, rf: 240 }, // 4 warm drone
  { room: 0.05, hum: 0.004, wind: 0.04, hiss: 0.01, spot: 0.0, drone: 0.0, tremble: 0.028, wf: 800, rf: 130 }, // 5 tremble
  { room: 0.08, hum: 0.01, wind: 0.04, hiss: 0.006, spot: 0.0, drone: 0, tremble: 0, wf: 450, rf: 180 },   // 6 calm
];

function makeBuffers() {
  const sr = ctx.sampleRate, n = sr * 4;
  brownBuf = ctx.createBuffer(1, n, sr);
  whiteBuf = ctx.createBuffer(1, n, sr);
  const b = brownBuf.getChannelData(0), w = whiteBuf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const x = Math.random() * 2 - 1;
    w[i] = x;
    last = (last + 0.02 * x) / 1.02;
    b[i] = last * 3.5;
  }
  // crossfade loop seam for brown noise
  const f = 2000;
  for (let i = 0; i < f; i++) {
    const t = i / f;
    b[n - f + i] = b[n - f + i] * (1 - t) + b[i] * t;
  }
}

function loopSrc(buf) {
  const s = ctx.createBufferSource();
  s.buffer = buf; s.loop = true;
  s.loopStart = 0; s.loopEnd = buf.duration - 2000 / ctx.sampleRate;
  s.start(0, Math.random() * 2);
  return s;
}
function gainNode(v, dest) { const g = ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }
function lfo(freq, depth, target) {
  const o = ctx.createOscillator(); o.frequency.value = freq;
  const g = ctx.createGain(); g.gain.value = depth;
  o.connect(g); g.connect(target); o.start(); return o;
}
function biquad(type, f, q, dest) {
  const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q;
  if (dest) b.connect(dest); return b;
}

function buildBeds() {
  const dest = ambBus;
  // room tone: brown noise lowpassed
  L.room = gainNode(0, dest);
  L.roomLP = biquad('lowpass', 160, 0.5, L.room);
  loopSrc(brownBuf).connect(L.roomLP);
  // faint hum
  L.hum = gainNode(0, dest);
  for (const f of [50, 100.4]) { const o = ctx.createOscillator(); o.frequency.value = f; o.connect(L.hum); o.start(); }
  // wind over rock: bandpassed noise with slow LFO on gain and freq
  L.wind = gainNode(0, dest);
  const windGain = gainNode(0.6, L.wind);
  L.windBP = biquad('bandpass', 450, 0.8, windGain);
  loopSrc(brownBuf).connect(L.windBP);
  lfo(0.07, 0.35, windGain.gain);
  lfo(0.05, 120, L.windBP.frequency);
  // dust hiss
  L.hiss = gainNode(0, dest);
  const hp = biquad('highpass', 5500, 0.5, L.hiss);
  loopSrc(whiteBuf).connect(hp);
  // spot-light presence: tiny soft tone cluster
  L.spot = gainNode(0, dest);
  const sl = biquad('lowpass', 900, 0.5, L.spot);
  for (const f of [220, 330.5]) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(sl); o.start(); }
  lfo(0.2, 0.3, L.spot.gain);
  // ch4 drone
  L.drone = gainNode(0, dest);
  const dLP = biquad('lowpass', 260, 0.7, L.drone);
  lfo(0.06, 110, dLP.frequency);
  [['sine', 55], ['triangle', 55.35], ['sine', 82.6], ['triangle', 110.5], ['sine', 54.6]].forEach(([t, f], i) => {
    const o = ctx.createOscillator(); o.type = t; o.frequency.value = f;
    const g = gainNode(i === 2 ? 0.25 : i === 3 ? 0.12 : 0.4, dLP); o.connect(g); o.start();
  });
  // ch5 tremble tone with slow flutter
  L.tremble = gainNode(0, dest);
  const flutter = gainNode(0.5, L.tremble);
  const tLP = biquad('lowpass', 1600, 0.5, flutter);
  lfo(0.35, 0.3, flutter.gain);
  lfo(5.2, 0.12, flutter.gain);
  [392, 394.3, 587.6].forEach((f, i) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    lfo(0.3 + i * 0.11, 2.5, o.frequency);
    const g = gainNode(i === 2 ? 0.25 : 0.5, tLP); o.connect(g); o.start();
  });
}

function applyChapter(i, t = 2.5) {
  if (!ctx) return;
  const c = CH[clamp(i | 0, 0, CH.length - 1)], now = ctx.currentTime;
  const set = (p, v) => { p.cancelScheduledValues(now); p.setValueAtTime(p.value, now); p.linearRampToValueAtTime(v, now + t); };
  set(L.room.gain, c.room); set(L.hum.gain, c.hum); set(L.wind.gain, c.wind); set(L.hiss.gain, c.hiss);
  set(L.spot.gain, c.spot); set(L.drone.gain, c.drone); set(L.tremble.gain, c.tremble);
  set(L.windBP.frequency, c.wf); set(L.roomLP.frequency, c.rf);
}

function init() {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return false;
  ctx = new AC({ latencyHint: 'playback' });
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.knee.value = 24; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.3;
  master = gainNode(muted ? 0 : MASTER_LEVEL);
  master.connect(comp); comp.connect(ctx.destination);
  duckGain = gainNode(ducked ? 0.35 : 1, master);
  ambBus = gainNode(1, duckGain);
  voiceBus = gainNode(1, master);
  makeBuffers();
  buildBeds();
  ctx.onstatechange = () => { if (ctx && ctx.state === 'interrupted' && !paused) tryResume(); };
  return true;
}

function tryResume() {
  try { const p = ctx && ctx.resume && ctx.resume(); if (p && p.catch) p.catch(() => {}); return p; } catch (e) {}
}

function env(g, t0, atk, peak, dec) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + atk + dec);
}
function noiseBurst(out, t0, { dur, f, q = 1, type = 'bandpass', peak, atk = 0.01, buf = whiteBuf }) {
  const s = ctx.createBufferSource(); s.buffer = buf;
  const flt = biquad(type, f, q); const g = ctx.createGain();
  s.connect(flt); flt.connect(g); g.connect(out);
  env(g, t0, atk, peak, dur);
  s.start(t0, Math.random() * 2, dur + atk + 0.05);
  return flt;
}
// granular crackle: many tiny filtered grains over time
function grains(out, t0, { n, span, fLo, fHi, peak, q = 3, grain = 0.02 }) {
  for (let k = 0; k < n; k++) {
    const t = t0 + Math.pow(Math.random(), 1.3) * span;
    noiseBurst(out, t, { dur: grain * rnd(0.6, 1.6), f: rnd(fLo, fHi), q, peak: peak * rnd(0.25, 1), atk: 0.004 });
  }
}

const SFX = {
  crumple(o, t) {
    grains(o, t, { n: 26, span: 0.5, fLo: 1500, fHi: 5000, peak: 0.16 });
    noiseBurst(o, t, { dur: 0.45, f: 1800, q: 0.7, peak: 0.12, atk: 0.03 });
  },
  unfold(o, t) {
    noiseBurst(o, t, { dur: 0.7, f: 2200, q: 0.8, peak: 0.1, atk: 0.12 });
    grains(o, t, { n: 16, span: 0.7, fLo: 1800, fHi: 5500, peak: 0.12 });
  },
  fold(o, t) {
    noiseBurst(o, t, { dur: 0.35, f: 2600, q: 0.8, peak: 0.08, atk: 0.06 });
    grains(o, t, { n: 10, span: 0.35, fLo: 2000, fHi: 5000, peak: 0.1 });
  },
  lift(o, t) {
    const f = noiseBurst(o, t, { dur: 0.7, f: 500, q: 0.9, peak: 0.07, atk: 0.2 });
    f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(1600, t + 0.8);
    grains(o, t + 0.05, { n: 6, span: 0.4, fLo: 2000, fHi: 4500, peak: 0.05 });
  },
  thud(o, t) {
    const osc = ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(95, t); osc.frequency.exponentialRampToValueAtTime(48, t + 0.25);
    const g = ctx.createGain(); osc.connect(g); g.connect(o);
    env(g, t, 0.012, 0.32, 0.4);
    osc.start(t); osc.stop(t + 0.5);
    noiseBurst(o, t, { dur: 0.15, f: 260, q: 0.6, type: 'lowpass', peak: 0.12, atk: 0.008, buf: brownBuf });
  },
  puff(o, t) {
    noiseBurst(o, t, { dur: 0.6, f: 1100, q: 0.5, type: 'lowpass', peak: 0.1, atk: 0.06 });
    noiseBurst(o, t, { dur: 0.5, f: 4500, q: 0.6, type: 'highpass', peak: 0.015, atk: 0.08 });
  },
  dirt(o, t) {
    grains(o, t, { n: 22, span: 0.45, fLo: 700, fHi: 3200, peak: 0.12, q: 1.5, grain: 0.03 });
    noiseBurst(o, t, { dur: 0.3, f: 600, q: 0.5, type: 'lowpass', peak: 0.06, atk: 0.03 });
  },
  tap(o, t) {
    noiseBurst(o, t, { dur: 0.03, f: 2400, q: 2, peak: 0.05, atk: 0.004 });
  },
};

export const audio = {
  async unlock() {
    try {
      if (!ctx && !init()) return;
      // iOS: resume + play a silent buffer within the gesture
      try {
        const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
        s.buffer = b; s.connect(ctx.destination); s.start(0);
      } catch (e) {}
      paused = false;
      const p = tryResume();
      if (p) await p.catch(() => {});
      if (!unlocked) {
        unlocked = true;
        applyChapter(pendingChapter, 3);
      }
    } catch (e) {}
  },
  getContext() { return ctx; },
  getVoiceBus() { return voiceBus; },
  setMuted(b) {
    try {
      muted = !!b;
      if (!ctx) return;
      const t = ctx.currentTime, p = master.gain;
      p.cancelScheduledValues(t); p.setValueAtTime(p.value, t);
      p.linearRampToValueAtTime(muted ? 0 : MASTER_LEVEL, t + 0.25);
    } catch (e) {}
  },
  isMuted() { return muted; },
  setChapter(i) {
    try {
      pendingChapter = clamp(i | 0, 0, CH.length - 1); chapter = pendingChapter;
      if (ctx && unlocked) applyChapter(chapter);
    } catch (e) {}
  },
  sfx(type, { pan = 0, gain = 1 } = {}) {
    try {
      if (!ctx || !unlocked || ctx.state !== 'running' || muted || !SFX[type]) return;
      const t = ctx.currentTime + 0.01;
      const out = ctx.createGain(); out.gain.value = clamp(+gain || 0, 0, 1);
      let node = out;
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner(); p.pan.value = clamp(+pan || 0, -1, 1);
        out.connect(p); node = p;
      }
      node.connect(master);
      SFX[type](out, t);
      setTimeout(() => { try { node.disconnect(); out.disconnect(); } catch (e) {} }, 2500);
    } catch (e) {}
  },
  duck(on) {
    try {
      ducked = !!on;
      if (!ctx) return;
      const t = ctx.currentTime, p = duckGain.gain;
      p.cancelScheduledValues(t); p.setValueAtTime(p.value, t);
      p.linearRampToValueAtTime(ducked ? 0.35 : 1, t + (ducked ? 0.4 : 0.9)); // ~-9dB
    } catch (e) {}
  },
  suspend() {
    try {
      paused = true;
      if (ctx && ctx.state === 'running') { const p = ctx.suspend(); if (p && p.catch) p.catch(() => {}); }
    } catch (e) {}
  },
  resume() {
    try {
      paused = false;
      if (ctx && unlocked) tryResume();
    } catch (e) {}
  },
};

export default audio;
