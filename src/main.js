import './style.css';
import { CHAPTERS, GATE_LINES, UI } from './story.js';
import { audio } from './audio/engine.js';
import { loadManifest, unlockVoice, playSlot, stopVoice, setVoiceMuted } from './voice.js';

const $ = (id) => document.getElementById(id);
const app = $('app'), stage = $('stage');
const params = new URLSearchParams(location.search);
const PREVIEW = params.has('preview');           // skips tap-to-begin (testing). Also: ?preview&ch=3
const FORCE_2D = params.get('mode') === '2d';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- capability detection ---------- */
function detectQuality() {
  const q = params.get('q');
  if (q === 'low' || q === 'mid' || q === 'high') return q;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  const save = navigator.connection && navigator.connection.saveData;
  const dpr = window.devicePixelRatio || 1;
  if (save || cores <= 2 || mem <= 2) return 'low';
  if (cores <= 4 || mem <= 3 || (dpr >= 3 && cores <= 6) || reduced) return 'mid';
  return 'high';
}
function hasWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
let quality = detectQuality();
let world = null, worldKind = null;

/* ---------- UI text ---------- */
$('begin').textContent = UI.begin; $('begin-sub').textContent = UI.beginSub;
$('decision-label').textContent = UI.decisionLabel;
$('ask-q').textContent = CHAPTERS[6].question; $('ask-input').placeholder = UI.placeholderInput;
$('privacy').textContent = UI.privacy; $('ask-btn').textContent = UI.throwIt;
$('gone').textContent = UI.gone;
$('ask-input').setAttribute('aria-labelledby', 'ask-q');
$('dots').innerHTML = CHAPTERS.map(() => '<li></li>').join('');

/* ---------- gate: words arrive before any touch ---------- */
const gl = $('gate-lines');
gl.innerHTML = GATE_LINES.map((l) => `<div>${l}</div>`).join('');
GATE_LINES.forEach((_, i) => setTimeout(() => gl.children[i].classList.add('on'), (reduced ? 200 : 700) + i * (reduced ? 300 : 1900)));
loadManifest(); // tiny; ready before first note

/* ---------- world (lazy, coarse-split chunk) ---------- */
const onSfx = (e) => audio.sfx(e.type, { pan: e.pan, gain: e.gain });
let lowFpsHits = 0, pendingDowngrade = false;
const KEEP = params.has('keep');                  // testing: never auto-downgrade
let statsFrom = 0;
function onFrameStats(fps) {
  if (KEEP || document.hidden || performance.now() < statsFrom) return;
  if (fps < 26) lowFpsHits++; else lowFpsHits = Math.max(0, lowFpsHits - 1);
  if (lowFpsHits >= 3 && !pendingDowngrade) { pendingDowngrade = true; maybeDowngrade(); }
}
async function buildWorld(kind) {
  const opts = { quality, reducedMotion: reduced, onSfx, onFrameStats };
  let w;
  if (kind === '3d') {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    stage.replaceChildren(canvas);
    const mod = await import('./scene3d/world.js');
    w = await mod.createWorld(canvas, opts);
    w.kind = '3d';
  } else {
    stage.replaceChildren();
    const mod = await import('./fallback2d.js');
    w = await mod.createWorld(stage, opts);
  }
  return w;
}
async function startWorld() {
  try { await Promise.race([document.fonts.load('600 40px Caveat'), new Promise((r) => setTimeout(r, 1500))]); } catch { /* noop */ }
  let kind = FORCE_2D || !hasWebGL() ? '2d' : '3d';
  try { world = await buildWorld(kind); }
  catch (e) { console.warn('3D unavailable, using 2D', e); kind = '2d'; world = await buildWorld('2d'); }
  worldKind = kind;
  statsFrom = performance.now() + 6000;   // ignore shader-compile hitches at startup
  sizeWorld();
  world.setChapter(state.chapter, { instant: true });
  app.classList.add('ready');
}
function sizeWorld() { if (world) world.resize(stage.clientWidth || innerWidth, stage.clientHeight || innerHeight, Math.min(devicePixelRatio || 1, 2)); }
async function maybeDowngrade() {
  if (!['idle', 'closed', 'ask', 'thrown', 'gate'].includes(state.phase)) { setTimeout(maybeDowngrade, 2500); return; }
  const next = quality === 'high' ? 'mid' : quality === 'mid' ? 'low' : null;
  try {
    world.dispose();
    if (next) { quality = next; world = await buildWorld('3d'); worldKind = '3d'; }
    else { world = await buildWorld('2d'); worldKind = '2d'; }
    sizeWorld(); world.setChapter(state.chapter, { instant: true }); lowFpsHits = 0; pendingDowngrade = false;
    if (state.chapter === 5 && state.phase !== 'gate') world.setTremble(false);
  } catch (e) { console.warn(e); }
}
const worldReady = startWorld();

/* ---------- state ---------- */
const state = { chapter: 0, phase: 'gate', muted: false, play: null, token: 0 };
const setPhase = (p) => { state.phase = p; app.dataset.phase = p; renderControls(); };

const el = { prev: $('b-prev'), replay: $('b-replay'), skip: $('b-skip'), mute: $('b-mute'), next: $('b-next'),
  caption: $('caption'), sr: $('caption-sr'), decision: $('decision'), ask: $('ask'), gone: $('gone'), hint: $('paper-hint') };

function renderControls() {
  const { chapter: c, phase: p } = state;
  const story = c >= 1 && c <= 5;
  el.prev.disabled = c === 0 || p === 'gate' || p === 'opening';
  el.replay.hidden = !(p === 'playing' || p === 'read' || p === 'closed' || p === 'thrown') || c === 6 && p !== 'playing';
  el.skip.hidden = p !== 'playing';
  el.next.hidden = false;
  el.next.disabled = false;
  let label = UI.next, action = 'next';
  if (p === 'idle' && story) { label = UI.openPaper; action = 'open'; }
  else if (p === 'idle' || p === 'opening' || p === 'playing' || p === 'ask') { el.next.hidden = true; }
  else if (p === 'thrown') { label = UI.again; action = 'restart'; }
  else if (p === 'closed' && c === 6) { el.next.hidden = true; }
  el.next.textContent = label; el.next.dataset.action = action;
  el.hint.hidden = !(p === 'idle' && story);
  [...$('dots').children].forEach((d, i) => d.classList.toggle('on', i === c));
}

/* ---------- captions ---------- */
let capIndex = -1, capWords = [];
function renderCue(i, cue) {
  capIndex = i;
  el.caption.innerHTML = '';
  capWords = cue.words.map((w) => { const s = document.createElement('span'); s.className = 'w'; s.textContent = w.w + ' '; el.caption.appendChild(s); return { t: w.t, s }; });
  el.sr.textContent = cue.text;
}
function onTick(t, cues) {
  let idx = -1;
  for (let i = 0; i < cues.length; i++) if (cues[i].start <= t) idx = i;
  if (idx < 0) return;
  if (idx !== capIndex) renderCue(idx, cues[idx]);
  for (const w of capWords) if (t >= w.t) w.s.classList.add('on');
}
function clearCaption() { capIndex = -1; capWords = []; el.caption.innerHTML = ''; el.sr.textContent = ''; }

/* ---------- chapter flow ---------- */
function setHeader(i) {
  const ch = CHAPTERS[i];
  $('chapter-label').textContent = i === 0 ? '' : i === 6 ? 'Your turn' : `${i} of 5`;
  $('chapter-title').textContent = ch.title;
  app.dataset.accent = ch.accent ? '1' : '0';
  document.title = i === 0 ? 'The Dustbin' : `${ch.label} · The Dustbin`;
}

async function enterChapter(i, { instant = false } = {}) {
  const tk = ++state.token;
  stopVoice(); clearCaption();
  el.decision.hidden = true; el.ask.hidden = true; el.gone.hidden = true;
  state.chapter = i; state.play = null;
  setHeader(i);
  if (world) world.setChapter(i, { instant });
  audio.setChapter(i);
  setPhase(i === 0 || i === 6 ? 'playing' : 'idle');
  if (i === 0 || i === 6) await runNote(i, tk);   // ch6 form appears when the note ends (finishNote) or on skip
}

async function runNote(i, tk) {
  audio.duck(true);
  const ctl = await playSlot(i, {
    onTick,
    onEnd: () => { if (tk === state.token) finishNote(i); },
  });
  if (tk !== state.token) { if (ctl) ctl.stop(); return; }
  state.play = ctl;
}

function finishNote(i) {
  audio.duck(false);
  state.play = null;
  const ch = CHAPTERS[i];
  if (i >= 1 && i <= 5) {
    el.decision.hidden = false;
    $('decision-text').textContent = ch.decision + (ch.placeholder ? ' ' + ch.placeholder : '');
    el.sr.textContent = `${UI.decisionLabel}: ${ch.decision}`;
    setPhase('read');
  } else if (i === 0) setPhase('closed');
  else showAsk();
}

async function openPaper() {
  const i = state.chapter; const tk = state.token;
  if (state.phase !== 'idle') return;
  setPhase('opening');
  audio.sfx('tap', { gain: 0.5 });
  if (i === 5) world.setTremble(true);
  const opened = world.openPaper(i);
  // voice starts as the paper rises; do not wait for the unfold to finish
  setTimeout(() => { if (tk === state.token && state.phase === 'opening') { setPhase('playing'); runNote(i, tk); } }, reduced ? 100 : 900);
  await opened;
}

async function closePaperIf() {
  if (state.chapter >= 1 && state.chapter <= 5 && world) { state.chapter === 5 && world.setTremble(false); await world.closePaper(); }
}

async function skip() {
  if (state.phase !== 'playing') return;
  const i = state.chapter, tk = state.token;
  stopVoice(); audio.duck(false); state.play = null;
  if (i >= 1 && i <= 5) {
    clearCaption(); el.decision.hidden = true;
    setPhase('closing'); await closePaperIf();
    if (tk === state.token) setPhase('closed');
  } else if (i === 0) { clearCaption(); setPhase('closed'); }
  else { clearCaption(); showAsk(); }
}

async function replay() {
  const i = state.chapter;
  stopVoice(); clearCaption(); el.decision.hidden = true;
  if (i === 6 && state.phase === 'thrown') return restart();
  const tk = ++state.token;
  if (i >= 1 && i <= 5) {
    if (state.phase === 'closed' || state.phase === 'closing') { setPhase('idle'); await openPaper(); }
    else { setPhase('playing'); runNote(i, tk); }
  } else { setPhase('playing'); el.ask.hidden = true; runNote(i, tk); }
}

async function go(n) {
  if (n < 0 || n > 6 || state.phase === 'opening' || state.phase === 'closing') return;
  const tk = ++state.token; stopVoice(); audio.duck(false);
  setPhase('closing');
  el.decision.hidden = true; clearCaption(); el.ask.hidden = true;
  await closePaperIf();
  if (tk !== state.token) return;
  enterChapter(n);
}

function showAsk() {
  clearCaption();
  el.ask.hidden = false; el.gone.hidden = true;
  setPhase('ask');
}

async function throwIt(ev) {
  ev.preventDefault();
  const input = $('ask-input');
  const text = input.value.trim().slice(0, 120);
  if (!text) { input.focus(); return; }
  input.blur();
  el.ask.hidden = true; setPhase('closing');
  input.value = '';            // held only in this page's memory; nothing is stored or sent
  await world.submitUserPaper(text);
  el.gone.hidden = false;
  el.sr.textContent = UI.gone;
  setPhase('thrown');
}

function restart() { el.gone.hidden = true; ++state.token; enterChapter(0); }

/* ---------- begin ---------- */
let begun = false;
async function begin() {
  if (begun) return; begun = true;
  $('begin').disabled = true;
  const p = audio.unlock();                       // inside the gesture
  unlockVoice(audio.getContext(), audio.getVoiceBus());
  enableMotion();
  await p; await worldReady;
  audio.sfx('tap', { gain: 0.4 });
  const start = PREVIEW ? Math.min(6, Math.max(0, parseInt(params.get('ch') || '0', 10) || 0)) : 0;
  enterChapter(start);
}
$('begin').addEventListener('click', begin);

/* ---------- controls ---------- */
el.next.addEventListener('click', () => {
  const a = el.next.dataset.action;
  if (a === 'open') openPaper(); else if (a === 'next') go(state.chapter + 1); else if (a === 'restart') restart();
});
el.prev.addEventListener('click', () => go(state.chapter - 1));
el.skip.addEventListener('click', skip);
el.replay.addEventListener('click', replay);
el.mute.addEventListener('click', () => {
  state.muted = !state.muted;
  audio.setMuted(state.muted); setVoiceMuted(state.muted);
  el.mute.setAttribute('aria-pressed', String(state.muted));
  el.mute.setAttribute('aria-label', state.muted ? UI.unmute : UI.mute);
  $('mute-ic').textContent = state.muted ? '✕' : '♪';
});
$('ask').addEventListener('submit', throwIt);
// tap the stage to open the paper
stage.addEventListener('click', () => { if (state.phase === 'idle' && state.chapter >= 1 && state.chapter <= 5) openPaper(); });

addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('textarea,input')) return;
  if (state.phase === 'gate') return;
  const k = e.key;
  if (k === 'ArrowRight') go(state.chapter + 1);
  else if (k === 'ArrowLeft') go(state.chapter - 1);
  else if (k === 'm' || k === 'M') el.mute.click();
  else if (k === 's' || k === 'S') skip();
  else if (k === 'r' || k === 'R') replay();
  else if ((k === 'Enter' || k === ' ') && !e.target.closest('button')) { e.preventDefault(); if (!el.next.hidden) el.next.click(); }
});

/* ---------- parallax: pointer + gyro ---------- */
function setPar(x, y) { if (world) world.setParallax(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y))); }
addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.pointerType === 'pen') setPar((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1); });
function enableMotion() {
  if (reduced) return;
  const attach = () => addEventListener('deviceorientation', (e) => {
    if (e.gamma == null) return;
    setPar(e.gamma / 25, ((e.beta || 45) - 45) / 25);
  }, { passive: true });
  try {
    const D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === 'function') D.requestPermission().then((r) => { if (r === 'granted') attach(); }).catch(() => {});
    else if (D) attach();
  } catch { /* noop */ }
}

/* ---------- viewport, visibility ---------- */
new ResizeObserver(sizeWorld).observe(stage);
if (window.visualViewport) {
  const upd = () => { const v = visualViewport; document.documentElement.style.setProperty('--kb', `${Math.max(0, Math.round(innerHeight - v.height - v.offsetTop))}px`); };
  visualViewport.addEventListener('resize', upd); visualViewport.addEventListener('scroll', upd);
}
document.addEventListener('visibilitychange', () => {
  const hidden = document.hidden;
  if (world) world.setPaused(hidden);
  if (hidden) { audio.suspend(); if (state.play) state.play.pause(); }
  else { audio.resume(); if (state.play) state.play.resume(); }
});

renderControls();
if (PREVIEW) { $('begin').textContent = 'Starting…'; setTimeout(begin, 400); }  // preview: no tap needed (audio may stay locked until first touch)
if (PREVIEW) addEventListener('pointerdown', () => audio.unlock(), { once: true });
window.__dustbin = { state, get world() { return world; }, go, get kind() { return worldKind; } };
