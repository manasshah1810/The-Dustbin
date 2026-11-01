// Lighter 2D version of the same world. Same API as scene3d/world.js so main.js doesn't care.
// DOM + CSS clip-path "crumple" (polygon morph) + a tiny canvas for dust. No WebGL.

const LIGHT = [
  // [spotAlpha, spotSize(%), color rgb, darkness]
  { a: 0.34, s: 34, c: '255,214,150', d: 0.55 },
  { a: 0.30, s: 42, c: '236,226,205', d: 0.48 },
  { a: 0.34, s: 48, c: '255,220,165', d: 0.40 },
  { a: 0.26, s: 44, c: '214,214,214', d: 0.55 },
  { a: 0.42, s: 52, c: '232,163,61', d: 0.60 },
  { a: 0.30, s: 40, c: '236,226,205', d: 0.50 },
  { a: 0.32, s: 46, c: '255,214,150', d: 0.42 },
];

// 16-point jagged outline (crumpled) vs clean rectangle (unfolded)
const RECT = '0% 0%,25% 0%,50% 0%,75% 0%,100% 0%,100% 25%,100% 50%,100% 75%,100% 100%,75% 100%,50% 100%,25% 100%,0% 100%,0% 75%,0% 50%,0% 25%';
const jag = (seed) => {
  const base = RECT.split(',').map((p) => p.trim().split(' ').map(parseFloat));
  let s = seed * 9301 + 49297;
  const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  return base.map(([x, y]) => `${(x * 0.74 + 13 + (r() - 0.5) * 14).toFixed(1)}% ${(y * 0.74 + 13 + (r() - 0.5) * 14).toFixed(1)}%`).join(',');
};
const HALF = (seed) => {
  const base = RECT.split(',').map((p) => p.trim().split(' ').map(parseFloat));
  let s = seed * 7919 + 13;
  const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  return base.map(([x, y]) => `${(x * 0.9 + 5 + (r() - 0.5) * 7).toFixed(1)}% ${(y * 0.9 + 5 + (r() - 0.5) * 7).toFixed(1)}%`).join(',');
};
const TITLES = [null, '2 / 30', '55 hands', 'not selected', 'small scope', 'still crumpled'];

export async function createWorld(root, opts = {}) {
  const reduced = !!opts.reducedMotion;
  const sfx = (type, pan = 0, gain = 0.8) => opts.onSfx && opts.onSfx({ type, pan, gain });
  const wrap = document.createElement('div');
  wrap.className = 'w2d';
  wrap.innerHTML = `
    <div class="w2d-light"></div>
    <canvas class="w2d-dust"></canvas>
    <div class="w2d-stage">
      <div class="w2d-papers"></div>
      <svg class="w2d-bin" viewBox="0 0 200 240" aria-hidden="true">
        <defs>
          <linearGradient id="b2" x1="0" x2="1"><stop offset="0" stop-color="#2a2420"/><stop offset=".45" stop-color="#4a3f36"/><stop offset="1" stop-color="#17120f"/></linearGradient>
        </defs>
        <ellipse cx="100" cy="228" rx="78" ry="10" fill="#120F0D" opacity=".8"/>
        <path d="M34 62 L166 62 L150 224 Q100 236 50 224 Z" fill="url(#b2)"/>
        <g stroke="#120F0D" stroke-opacity=".5" stroke-width="2"><path d="M70 66 L64 222"/><path d="M100 66 V228"/><path d="M130 66 L136 222"/></g>
        <ellipse cx="100" cy="62" rx="68" ry="12" fill="#120F0D"/>
        <ellipse cx="100" cy="62" rx="68" ry="12" fill="none" stroke="#6b5e51" stroke-width="5"/>
      </svg>
      <div class="w2d-slot" aria-hidden="true"></div>
    </div>`;
  root.appendChild(wrap);
  const lightEl = wrap.querySelector('.w2d-light');
  const stage = wrap.querySelector('.w2d-stage');
  const papers = wrap.querySelector('.w2d-papers');
  const cv = wrap.querySelector('.w2d-dust');
  const cx = cv.getContext('2d');

  let chapter = 0, par = { x: 0, y: 0 }, cur = { x: 0, y: 0 }, paused = false, open = null, W = 0, H = 0, dpr = 1, raf = 0, tremble = false;
  const motes = Array.from({ length: opts.quality === 'low' ? 18 : 36 }, () => ({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.6, v: 0.01 + Math.random() * 0.03, p: Math.random() * 6.28 }));

  // resting papers in the bin (1..5)
  const rest = [];
  for (let i = 1; i <= 5; i++) {
    const p = document.createElement('div');
    p.className = 'w2d-rest';
    p.style.clipPath = `polygon(${jag(i)})`;
    p.style.setProperty('--x', `${(i - 3) * 9 + (i % 2 ? 3 : -3)}px`);
    p.style.setProperty('--r', `${(i * 47) % 60 - 30}deg`);
    p.style.setProperty('--lift', `${-6 - ((i * 13) % 14)}px`);
    p.hidden = i > 1;
    papers.appendChild(p);
    rest.push(p);
  }

  function setChapter(i, { instant } = {}) {
    chapter = i;
    const L = LIGHT[i] || LIGHT[0];
    wrap.style.setProperty('--spot-a', L.a);
    wrap.style.setProperty('--spot-s', `${L.s}%`);
    wrap.style.setProperty('--spot-c', L.c);
    wrap.style.setProperty('--dark', L.d);
    wrap.dataset.chapter = i;
    if (instant) wrap.classList.add('instant'); else wrap.classList.remove('instant');
    rest.forEach((p, k) => { p.hidden = (k + 1) > Math.max(1, i); });
  }

  function makePaper(title, seed, text) {
    const d = document.createElement('div');
    d.className = 'w2d-paper';
    d.style.clipPath = `polygon(${jag(seed)})`;
    d.innerHTML = `<span class="w2d-ptitle"></span>`;
    d.firstChild.textContent = text != null ? text : title || '';
    if (text != null) d.firstChild.classList.add('w2d-ptext');
    wrap.appendChild(d);
    return d;
  }
  const binTop = () => { const r = wrap.querySelector('.w2d-bin').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.28 }; };
  const anim = (el, kf, ms, easing = 'cubic-bezier(.3,.7,.2,1)') => {
    const a = el.animate(kf, { duration: reduced ? Math.min(ms, 250) : ms, easing, fill: 'forwards' });
    return a.finished.catch(() => {});
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, reduced ? Math.min(ms, 100) : ms));

  async function openPaper(i) {
    if (open) return;
    const bt = binTop();
    const el = makePaper(TITLES[i], i + 3);
    open = { el, i };
    const w = Math.min(W * 0.74, H * 0.5 * 0.74, 360);
    el.style.width = `${w}px`; el.style.height = `${w * 1.32}px`;
    el.style.left = `${bt.x - w / 2}px`; el.style.top = `${bt.y - w * 0.66}px`;
    const dy = H * 0.34 - bt.y; // target center a bit above middle
    sfx('lift', 0, 0.7);
    const target = (HALF(i)); const full = RECT;
    const end = LIGHT && i === 5 ? target : full;
    await anim(el, [
      { transform: 'translate(0,0) scale(.28) rotate(-8deg)', clipPath: `polygon(${jag(i + 3)})` },
      { transform: `translate(${(W * 0.12)}px,${dy * 0.55 - 50}px) scale(.7) rotate(14deg)`, clipPath: `polygon(${jag(i + 9)})`, offset: 0.5 },
      { transform: `translate(0,${dy}px) scale(1) rotate(0deg)`, clipPath: `polygon(${end})` },
    ], 1500);
    sfx('unfold', 0, 0.6);
    el.classList.add('open');
    if (i === 5 || tremble) el.classList.add('tremble');
  }

  async function closePaper() {
    if (!open) return;
    const { el } = open; open = null;
    el.classList.remove('tremble', 'open');
    const bt = binTop();
    sfx('fold', 0, 0.6);
    const cs = el.getBoundingClientRect();
    const dx = bt.x - (cs.left + cs.width / 2), dy = bt.y - (cs.top + cs.height / 2);
    await anim(el, [
      { transform: el.style.transform || 'none' },
      { transform: `translate(${dx * 0.3}px,${dy * 0.3}px) scale(.8) rotate(-10deg)`, clipPath: `polygon(${jag(7)})`, offset: 0.4 },
      { transform: `translate(${dx}px,${dy}px) scale(.28) rotate(6deg)`, clipPath: `polygon(${jag(5)})` },
    ], 1000, 'cubic-bezier(.5,0,.8,.4)');
    el.remove();
    sfx('thud', 0, 0.8); sfx('puff', 0, 0.6);
    stage.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(5px)' }, { transform: 'translateY(0)' }], { duration: reduced ? 1 : 260, easing: 'ease-out' });
  }

  async function submitUserPaper(text) {
    const bt = binTop();
    const el = makePaper(null, 21, text);
    el.style.width = `${Math.min(W * 0.7, 320)}px`; el.style.height = `${Math.min(W * 0.7, 320) * 1.2}px`;
    const w = parseFloat(el.style.width);
    el.style.left = `${bt.x - w / 2}px`; el.style.top = `${H * 0.34 - w * 0.6}px`;
    el.style.clipPath = `polygon(${RECT})`; el.classList.add('open');
    await wait(500);
    sfx('crumple', 0, 0.8);
    await anim(el, [
      { transform: 'scale(1) rotate(0)', clipPath: `polygon(${RECT})` },
      { transform: 'scale(.6) rotate(8deg)', clipPath: `polygon(${jag(2)})`, offset: 0.55 },
      { transform: 'scale(.32) rotate(-6deg)', clipPath: `polygon(${jag(4)})` },
    ], 900);
    el.querySelector('span').style.opacity = 0;
    const cs = el.getBoundingClientRect();
    await anim(el, [
      { transform: 'scale(.32) rotate(-6deg)' },
      { transform: `translate(${bt.x - (cs.left + cs.width / 2)}px,${bt.y - (cs.top + cs.height / 2)}px) scale(.28) rotate(20deg)` },
    ], 700, 'cubic-bezier(.5,0,.9,.5)');
    el.remove();
    sfx('thud', 0, 0.8); sfx('puff', 0, 0.6);
  }

  function resize(w, h, d) {
    W = w; H = h; dpr = Math.min(d || 1, opts.quality === 'low' ? 1.25 : 2);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = `${W}px`; cv.style.height = `${H}px`;
  }

  let last = performance.now(), acc = 0, frames = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (paused) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    cur.x += (par.x - cur.x) * 0.06; cur.y += (par.y - cur.y) * 0.06;
    if (!reduced) {
      stage.style.transform = `translate(${cur.x * -8}px, ${cur.y * -5}px)`;
      lightEl.style.transform = `translate(${cur.x * 14}px, ${cur.y * 8}px)`;
    }
    cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, W, H);
    cx.fillStyle = 'rgba(237,230,184,.5)';
    for (const m of motes) {
      m.y -= m.v * dt * (reduced ? 0.3 : 1); m.p += dt * 0.6;
      if (m.y < -0.05) { m.y = 1.05; m.x = Math.random(); }
      const px = (m.x + Math.sin(m.p) * 0.012) * W, py = m.y * H;
      const near = Math.max(0, 1 - Math.abs(px - W / 2) / (W * 0.45)) * Math.max(0, 1 - Math.abs(py - H * 0.45) / (H * 0.5));
      cx.globalAlpha = 0.08 + near * 0.5;
      cx.beginPath(); cx.arc(px, py, m.r, 0, 6.283); cx.fill();
    }
    cx.globalAlpha = 1;
    acc += dt; frames++;
    if (acc > 1.5) { if (opts.onFrameStats) opts.onFrameStats(frames / acc); acc = 0; frames = 0; }
  }
  raf = requestAnimationFrame(frame);

  setChapter(0, { instant: true });
  resize(root.clientWidth || innerWidth, root.clientHeight || innerHeight, devicePixelRatio);

  return {
    kind: '2d',
    setChapter, openPaper, closePaper, submitUserPaper, resize,
    setTremble(on) { tremble = on; if (open) open.el.classList.toggle('tremble', on); },
    setParallax(x, y) { par.x = x; par.y = y; },
    setPaused(p) { paused = p; wrap.classList.toggle('paused', p); },
    dispose() { cancelAnimationFrame(raf); wrap.remove(); },
  };
}
