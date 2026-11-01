import anime from 'animejs/lib/anime.es.js';
import './style.css';
import { CHAPTERS, UI } from './story.js';
import { playSlot, stopVoice, unlockVoice, setVoiceMuted } from './voice.js';
import audio from './audio/engine.js';
import { createPaper } from './paper.js';

const $ = (s, r = document) => r.querySelector(s);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const story = $('#story');
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const words = (t) => t.trim().split(/\s+/).map((w) => `<span class="w">${esc(w)}</span> `).join('');
const mask = (t) => t.split(' ').map((w) => `<span class="ln"><span class="in">${esc(w)}</span></span>`).join(' ');

/* ---------- build ---------- */
const secs = [];
CHAPTERS.forEach((c, i) => {
  const s = document.createElement('section');
  s.className = 'chap' + (c.paperTitle ? ' has-paper' : '') + (i === 0 ? ' hero' : '') + (i === 6 ? ' ask' : '');
  s.id = 'c' + i; s.dataset.i = i; s.dataset.n = String(i).padStart(2, '0');
  s.setAttribute('aria-labelledby', 'h' + i);
  const Tag = i === 0 ? 'h1' : 'h2';
  s.innerHTML = `
    <div class="col">
      <p class="eyebrow code"><span class="cm">// ${i === 0 ? 'a story, in my own voice' : 'chapter ' + String(i).padStart(2, '0') + ' of 06'}</span></p>
      <p class="code line"><span class="kw">const</span> <span class="id">${esc(c.key.replace(/-/g, '_'))}</span> <span class="op">=</span> <span class="br">{</span></p>
      <${Tag} class="head" id="h${i}" aria-label="${esc(c.title)}"><span aria-hidden="true">${mask(c.title)}</span></${Tag}>
      <div class="cues">${c.cues.map((t) => `<p class="cue">${words(t)}</p>`).join('')}</div>
      ${c.decision ? `<p class="decision"><span class="code"><span class="cm">// ${UI.decisionLabel.toLowerCase()}</span></span>${esc(c.decision)}</p>` : ''}
      ${c.placeholder ? `<p class="note">${esc(c.placeholder)}</p>` : ''}
      ${i < 6 ? `<p class="next"><button type="button" class="link soft" data-next>next();</button><button type="button" class="link soft" data-replay>replay();</button></p>` : ''}
      <p class="code line close"><span class="br">}</span><span class="op">;</span></p>
      ${i === 0 ? `<p class="begin-row"><button type="button" id="b-begin" class="link">begin<span class="op">(</span><span class="str">&quot;with sound&quot;</span><span class="op">)</span><span class="op">;</span></button><span class="or code"><span class="cm">// or just scroll</span></span></p>` : ''}
    </div>
    <div class="side">${i === 0 ? `<figure class="portrait"><svg id="portrait" viewBox="0 0 200 230" role="img" aria-label="A friendly cartoon of the author: round glasses, short dark hair, a smile">
<path d="M18 230c4-38 34-52 82-52s78 14 82 52z" fill="var(--cardink)"/>
<rect x="84" y="150" width="32" height="36" rx="12" fill="#c9c6bf"/>
<ellipse cx="100" cy="102" rx="60" ry="66" fill="#d6d3cc" stroke="var(--cardink)" stroke-width="5"/>
<path d="M38 96C30 40 70 20 104 22c38 2 66 22 58 76-6-24-20-38-30-40-22 10-60 12-82-2-8 8-10 22-12 40z" fill="var(--cardink)"/>
<g fill="none" stroke="var(--cardink)" stroke-width="5" stroke-linecap="round"><circle cx="72" cy="104" r="19" fill="#ecebe6" fill-opacity=".55"/><circle cx="128" cy="104" r="19" fill="#ecebe6" fill-opacity=".55"/><path d="M91 102q9-6 18 0M53 98l-14-4M147 98l14-4"/><path d="M76 136q24 22 48 0" stroke-width="6"/></g>
<g class="eyes" fill="var(--cardink)"><circle cx="72" cy="106" r="5"/><circle cx="128" cy="106" r="5"/></g>
<path d="M60 128q-6 4-4 10M140 128q6 4 4 10" fill="none" stroke="var(--cardink)" stroke-width="3" stroke-linecap="round" opacity=".5"/>
</svg><span class="bubble" aria-hidden="true">that’s me</span><svg class="doodle" viewBox="0 0 60 60" aria-hidden="true"><path d="M30 4l5 17 17 5-17 5-5 17-5-17-17-5 17-5z"/></svg></figure>` : ''}</div>`;
  story.appendChild(s);
  const sec = { el: s, i, c, paper: null, played: false, cueEls: [...s.querySelectorAll('.cue')], intro: false };
  if (c.paperTitle) {
    sec.paper = createPaper($('.side', s), {
      seed: i + 2, cap: c.neverUnfold ? 0.72 : 1,
      title: c.paperTitle, body: '', foot: c.decision || '',
    });
    if (c.neverUnfold) sec.paper.el.classList.add('tremble');
  }
  const g = ['{ }', ';', ':', '( )', '=>', '[ ]', '/>', '&&', '//', '=== ', '<>', '"…"', 'fn', '0;'];
  let sd = i * 97 + 13; const rr = () => ((sd = (sd * 9301 + 49297) % 233280) / 233280);
  const glyphs = document.createElement('div'); glyphs.className = 'glyphs'; glyphs.setAttribute('aria-hidden', 'true');
  for (let k = 0; k < 16; k++) { const e = document.createElement('i'); e.textContent = g[(rr() * g.length) | 0]; e.style.cssText = `left:${(rr() * 96).toFixed(1)}%;top:${(rr() * 94).toFixed(1)}%;font-size:${(18 + rr() * 38) | 0}px;animation-delay:${(-rr() * 14).toFixed(1)}s;animation-duration:${(11 + rr() * 10).toFixed(1)}s`; glyphs.appendChild(e); }
  s.appendChild(glyphs);
  secs.push(sec);
});

/* chapter 6: the bin */
(() => {
  const s = secs[6], side = $('.side', s.el);
  side.innerHTML = '';
  const sheetHost = document.createElement('div'); sheetHost.className = 'sheet-host'; side.appendChild(sheetHost);
  s.paper = createPaper(sheetHost, { seed: 11, title: '', body: '' });
  s.paper.setU(1);
  s.paper.el.classList.add('live');
  side.insertAdjacentHTML('beforeend', `
    <svg class="bin" viewBox="0 0 160 190" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
      <path d="M22 44h116M58 44V32h44v12"/><path d="M30 44l10 134h80l10-134"/><path d="M62 62l4 100M80 62v100M98 62l-4 100"/>
    </svg>`);
  $('.col', s.el).insertAdjacentHTML('beforeend', `
    <form id="ask-form" autocomplete="off">
      <label for="ask-input" class="sr-only">${esc(CHAPTERS[6].question)}</label>
      <textarea id="ask-input" rows="3" maxlength="140" placeholder="${esc(UI.placeholderInput)}"></textarea>
      <div class="row"><button type="submit" class="link" id="ask-go">throwInBin<span class="op">(</span><span class="op">)</span><span class="op">;</span></button><span class="priv">${UI.privacy}</span></div>
    </form>
    <p id="gone" class="gone" hidden><span>${UI.gone}</span> <button type="button" class="link" id="again">${UI.again}</button></p>`);
})();

/* ---------- state ---------- */
let begun = false, soundOn = false, cur = 0, ctrl = null, startTimer = 0;
const bSound = $('#b-sound');

function go(i, instant) {
  i = Math.max(0, Math.min(secs.length - 1, i));
  secs[i].el.scrollIntoView({ behavior: reduce || instant ? 'auto' : 'smooth', block: 'start' });
}

/* ---------- text animation ---------- */
function intro(sec, force) {
  if (sec.intro && !force) return; sec.intro = true;
  const ins = sec.el.querySelectorAll('.head .in'), rest = sec.el.querySelectorAll('.cue, .decision, .note, .begin-row, #ask-form, .eyebrow, .next, .line');
  if (reduce) { ins.forEach((e) => { e.style.transform = 'none'; }); rest.forEach((e) => { e.style.opacity = 1; e.style.transform = 'none'; }); return; }
  anime.remove([...ins, ...rest]);
  anime.set(ins, { translateY: '110%' }); anime.set(rest, { opacity: 0, translateY: 18 });
  anime({ targets: ins, translateY: ['110%', '0%'], duration: 950, easing: 'cubicBezier(.19,1,.22,1)', delay: anime.stagger(70) });
  anime({ targets: rest, opacity: [0, 1], translateY: [18, 0], duration: 800, easing: 'cubicBezier(.19,1,.22,1)', delay: anime.stagger(90, { start: 260 }) });
}
if (!reduce) { document.querySelectorAll('.head .in').forEach((e) => (e.style.transform = 'translateY(110%)')); document.querySelectorAll('.cue,.decision,.note,.begin-row,#ask-form,.eyebrow,.next,.line').forEach((e) => (e.style.opacity = 0)); }

/* ---------- voice + karaoke ---------- */
function sameText(sec, cues) {
  return cues.length === sec.c.cues.length && cues.every((c, k) => c.text === sec.c.cues[k]);
}
function clearListening(sec) { sec.el.classList.remove('listening'); sec.el.querySelectorAll('.w').forEach((w) => w.classList.remove('on')); }
function stopAll() { clearTimeout(startTimer); if (ctrl) { ctrl.stop(); ctrl = null; } stopVoice(); secs.forEach(clearListening); document.body.classList.remove('speaking'); }

async function speak(i) {
  stopAll();
  if (!begun) return;
  const sec = secs[i];
  const my = (speak.n = (speak.n || 0) + 1);
  const c = await playSlot(i, {
    onTick(t, cues) {
      if (!sec._flat) return;
      const f = sec._flat; let p = sec._ptr || 0;
      while (p < f.length && f[p].t <= t) { f[p].el.classList.add('on'); p++; }
      sec._ptr = p;
    },
    onEnd() { if (speak.n === my) { clearListening(sec); document.body.classList.remove('speaking'); ctrl = null; } },
  });
  if (!c || speak.n !== my) { if (c) c.stop(); return; }
  ctrl = c;
  if (!sameText(sec, c.cues)) { // real transcript differs from the default copy: show the transcript
    const box = $('.cues', sec.el);
    box.innerHTML = c.cues.map((q) => `<p class="cue" style="opacity:1">${words(q.text)}</p>`).join('');
    sec.cueEls = [...box.querySelectorAll('.cue')];
  }
  sec._flat = []; sec._ptr = 0;
  c.cues.forEach((q, a) => { const ws = sec.cueEls[a] ? sec.cueEls[a].querySelectorAll('.w') : []; q.words.forEach((w, b) => ws[b] && sec._flat.push({ t: w.t, el: ws[b] })); });
  sec.el.classList.add('listening'); document.body.classList.add('speaking');
}

async function begin() {
  if (begun) return;
  begun = true; soundOn = true;
  try { await audio.unlock(); unlockVoice(audio.getContext(), audio.getVoiceBus()); } catch { /* sound is optional */ }
  setSound(true); audio.setChapter(cur);
  const b = $('#b-begin'); if (b) { b.textContent = 'listening…'; b.disabled = true; }
  speak(cur);
}
function setSound(on) {
  soundOn = on; bSound.textContent = on ? 'sound: on' : 'sound: off'; bSound.setAttribute('aria-pressed', on);
  audio.setMuted(!on); setVoiceMuted(!on);
}

/* ---------- active chapter ---------- */
function setActive(i) {
  if (i === cur && secs[i].el.classList.contains('active')) return;
  cur = i;
  secs.forEach((s) => s.el.classList.toggle('active', s.i === i));
  $('#progress i').style.transform = `scaleY(${(i + 1) / secs.length})`;
  audio.setChapter(i);
  intro(secs[i]);
  stopAll();
  if (begun) startTimer = setTimeout(() => speak(i), 450);
}
const io = new IntersectionObserver((es) => {
  es.forEach((e) => { if (e.isIntersecting) setActive(+e.target.dataset.i); });
}, { rootMargin: '-45% 0px -50% 0px' });
secs.forEach((s) => io.observe(s.el));
const ioIntro = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) intro(secs[+e.target.dataset.i]); }), { threshold: 0.15 });
secs.forEach((s) => ioIntro.observe(s.el));

/* ---------- paper unfolds with scroll ---------- */
let tick = false;
function frame() {
  tick = false;
  const vh = innerHeight;
  secs.forEach((s) => {
    if (!s.paper || s.i === 6) return;
    const r = s.el.getBoundingClientRect();
    if (r.bottom < -100 || r.top > vh + 100) return;
    const p = (vh * 0.55 - r.top) / Math.max(1, r.height * 0.6);
    s.paper.setU(Math.max(0, Math.min(1, p)));
  });
}
addEventListener('scroll', () => { if (!tick) { tick = true; requestAnimationFrame(frame); } }, { passive: true });
addEventListener('resize', frame);

/* ---------- controls ---------- */
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-next]')) go(cur + 1);
  if (e.target.closest('[data-replay]')) replay();
});
function replay() {
  const s = secs[cur]; s.el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  intro(s, true); if (begun) { s._ptr = 0; speak(cur); }
}
bSound.addEventListener('click', () => { if (!begun) begin(); else { setSound(!soundOn); } });
$('#b-begin').addEventListener('click', begin);
/* theme: follows the system until the visitor picks one */
const root = document.documentElement, bTheme = $('#b-theme');
function setTheme(t) { root.dataset.theme = t; bTheme.textContent = 'theme: ' + t; document.querySelector('meta[name=theme-color]').content = t === 'dark' ? '#121212' : '#ecebe7'; }
let saved = null; try { saved = localStorage.getItem('dustbin-theme'); } catch { /* private mode */ }
setTheme(saved || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
bTheme.addEventListener('click', () => { const t = root.dataset.theme === 'dark' ? 'light' : 'dark'; setTheme(t); try { localStorage.setItem('dustbin-theme', t); } catch { /* noop */ } });
addEventListener('keydown', (e) => {
  if (/input|textarea/i.test(e.target.tagName)) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown' && false || e.key === 'j') go(cur + 1);
  if (e.key === 'ArrowLeft' || e.key === 'k') go(cur - 1);
});
document.addEventListener('visibilitychange', () => { document.hidden ? audio.suspend() : audio.resume(); if (ctrl) document.hidden ? ctrl.pause() : ctrl.resume(); });

/* ---------- chapter 6: throw it in the bin ---------- */
(() => {
  const s = secs[6], form = $('#ask-form'), input = $('#ask-input'), gone = $('#gone');
  const side = $('.side', s.el), sheet = s.paper;
  input.addEventListener('input', () => { sheet.setText({ body: input.value }); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!input.value.trim()) { input.focus(); return; }
    input.disabled = true; $('#ask-go').disabled = true;
    audio.sfx('crumple');
    const o = { u: 1 };
    const finish = () => { audio.sfx('thud'); gone.hidden = false; anime({ targets: gone, opacity: [0, 1], duration: 600, easing: 'linear' }); input.value = ''; sheet.setText({ body: '' }); };
    if (reduce) { sheet.el.style.opacity = 0; return finish(); }
    anime({ targets: o, u: 0, duration: 900, easing: 'easeInOutQuad', update: () => sheet.setU(o.u) });
    anime({ targets: sheet.el, translateY: [0, 190], opacity: [1, 0], duration: 700, delay: 950, easing: 'easeInQuad', complete: finish });
  });
  $('#again').addEventListener('click', () => {
    gone.hidden = true; input.disabled = false; $('#ask-go').disabled = false;
    sheet.el.style.transform = ''; sheet.el.style.opacity = 1; sheet.setU(0); sheet.setU(1); anime.set(sheet.el, { translateY: 0 }); go(0);
  });
})();

/* ---------- portrait: a blink every few seconds, a tiny bob while the voice plays ---------- */
if (!reduce) {
  anime({ targets: '.portrait .eyes', scaleY: [1, 0.1, 1], duration: 220, easing: 'linear', loop: true, loopDelay: 3200 });
  anime({ targets: '.portrait .doodle', rotate: 360, duration: 9000, easing: 'linear', loop: true });
}
setActive(0); frame();
