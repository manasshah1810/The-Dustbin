// Voice notes + caption timeline.
// - One shared <audio> element, unlocked inside the first user gesture (iOS/Android autoplay rules).
// - MP3 preferred, OGG fallback (by canPlayType). Loaded lazily, one slot at a time.
// - Missing/blocked audio -> the same cues run on a gentle reading timer. The site works with no audio at all.
import { CHAPTERS } from './story.js';

const WPS = 2.5;          // gentle reading pace, words per second (timer mode)
const CUE_PAUSE = 0.7;    // breath between cues (timer mode)
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

let manifest = null;
let manifestPromise = null;
const el = typeof Audio !== 'undefined' ? new Audio() : null;
if (el) { el.preload = 'auto'; el.playsInline = true; el.setAttribute('playsinline', ''); }
let sourceNode = null;
let unlocked = false;
let muted = false;
let session = 0;

export function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(`${import.meta.env.BASE_URL}audio/manifest.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((m) => { manifest = m && Array.isArray(m.slots) ? m : { slots: [] }; return manifest; });
  }
  return manifestPromise;
}

/** Call inside a user gesture. Primes the shared element so later programmatic play() works on iOS. */
export function unlockVoice(ctx, bus) {
  if (!el) return;
  try {
    if (ctx && bus && !sourceNode) {
      sourceNode = ctx.createMediaElementSource(el);
      sourceNode.connect(bus);
    }
  } catch { sourceNode = null; }
  if (!unlocked) {
    unlocked = true;
    try { el.src = SILENT; const p = el.play(); if (p && p.catch) p.catch(() => {}); } catch { /* noop */ }
  }
}

export function setVoiceMuted(m) { muted = m; if (el) el.muted = m; }

function countWords(t) { return t.trim().split(/\s+/).filter(Boolean).length; }

function pickFile(slot) {
  if (!slot || !el) return null;
  const mp3 = slot.mp3 && el.canPlayType('audio/mpeg');
  const ogg = slot.ogg && el.canPlayType('audio/ogg; codecs="vorbis"');
  const base = import.meta.env.BASE_URL;
  if (mp3) return base + slot.mp3;
  if (ogg) return base + slot.ogg;
  return null;
}

/** Build timed cues: [{start,end,text,words:[{t,w}]}] given a total duration (or null for timer mode). */
function buildCues(raw, duration) {
  // raw: [{t?:number, text:string, words?:[{t,w}]}]
  const timerMode = duration == null;
  const cues = [];
  let cursor = 0;
  const totalWords = raw.reduce((n, c) => n + countWords(c.text), 0) || 1;
  raw.forEach((c, i) => {
    const n = countWords(c.text);
    let start;
    if (typeof c.t === 'number') start = c.t;
    else if (timerMode) start = cursor;
    else start = (raw.slice(0, i).reduce((s, x) => s + countWords(x.text), 0) / totalWords) * duration * 0.96;
    const span = timerMode ? n / WPS : null;
    cues.push({ start, span, text: c.text, exactWords: c.words || null });
    if (timerMode) cursor = start + span + CUE_PAUSE;
  });
  cues.forEach((c, i) => {
    const next = cues[i + 1];
    c.end = timerMode ? c.start + c.span + CUE_PAUSE * 0.6 : next ? next.start : duration;
    const words = c.text.trim().split(/\s+/);
    if (c.exactWords) {
      c.words = c.exactWords.map((w) => ({ t: w.t, w: w.w }));
    } else {
      const reveal = Math.max(0.4, (c.end - c.start) * 0.82);
      const totalChars = words.reduce((s, w) => s + w.length + 1, 0);
      let acc = 0;
      c.words = words.map((w) => { const t = c.start + (acc / totalChars) * reveal; acc += w.length + 1; return { t, w }; });
    }
  });
  return cues;
}

/**
 * Play chapter `i` voice note. Returns controller:
 *  { cues, duration, mode:'audio'|'timer', stop(), time(), done:Promise }
 * Callbacks: onCue(index, cue), onTick(t), onEnd().
 */
export async function playSlot(i, { onTick, onEnd, onMode } = {}) {
  const my = ++session;
  const m = await loadManifest();
  const slot = m.slots[i];
  const chapter = CHAPTERS[i];
  const raw = (slot && Array.isArray(slot.cues) && slot.cues.length)
    ? slot.cues
    : chapter.cues.map((text) => ({ text }));

  let mode = 'timer';
  let duration = null;
  const file = pickFile(slot);

  if (file && el) {
    const ok = await new Promise((resolve) => {
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; clean(); resolve(v); } };
      const onMeta = () => (isFinite(el.duration) && el.duration > 0.3 ? done(true) : done(false));
      const onErr = () => done(false);
      const clean = () => { el.removeEventListener('loadedmetadata', onMeta); el.removeEventListener('error', onErr); clearTimeout(tm); };
      const tm = setTimeout(() => done(false), 4500);
      el.addEventListener('loadedmetadata', onMeta);
      el.addEventListener('error', onErr);
      el.src = file; el.load();
    });
    if (my !== session) return null;
    if (ok) {
      try { el.currentTime = 0; el.muted = muted; await el.play(); mode = 'audio'; duration = el.duration; }
      catch { mode = 'timer'; duration = null; }
    }
  }
  if (mode === 'timer' && el) { try { el.pause(); } catch { /* noop */ } }

  const cues = buildCues(raw, mode === 'audio' ? duration : null);
  const total = mode === 'audio' ? duration : cues[cues.length - 1].end;
  if (onMode) onMode(mode);

  let t0 = performance.now();
  let raf = 0; let ended = false; let paused = false; let pausedAt = 0;
  const time = () => (mode === 'audio' ? el.currentTime : paused ? pausedAt : (performance.now() - t0) / 1000);

  const finish = () => {
    if (ended) return; ended = true; cancelAnimationFrame(raf);
    if (my === session && onEnd) onEnd();
  };
  const loop = () => {
    if (my !== session || ended) return;
    const t = time();
    if (onTick) onTick(t, cues);
    if (t >= total - 0.02 || (mode === 'audio' && el.ended)) { finish(); return; }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return {
    cues, duration: total, mode,
    time,
    pause() { if (mode === 'audio') el.pause(); else { paused = true; pausedAt = time(); } },
    resume() { if (mode === 'audio') el.play().catch(() => {}); else if (paused) { paused = false; t0 = performance.now() - pausedAt * 1000; } },
    stop() { ended = true; cancelAnimationFrame(raf); if (my === session) { try { el.pause(); } catch { /* noop */ } } },
    finishNow() { finish(); },
  };
}

export function stopVoice() { session++; if (el) { try { el.pause(); } catch { /* noop */ } } }
