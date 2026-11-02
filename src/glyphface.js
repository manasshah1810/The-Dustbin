// The author's portrait, re-typed in code characters. A tone map of the photo (no photo shipped) is
// drawn as brackets, colons, semicolons and slashes — dense characters where it's dark, light ones
// where it's bright. Eyes follow the cursor, the head leans, and it "generates" itself on first show.
import { FW, FH, FD } from './facedata.js';
const TONE = Uint8Array.from(atob(FD), (c) => c.charCodeAt(0));
const POOL = '{}[]();:<>/\\=&|'.split('');
const RAMP = ['.', ':', ';', '/', '(', '[', '{', '&', '@'];
const PAIR = { '(': ')', '[': ']', '{': '}', '/': '\\' };
const rnd = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const EYES = [[36.6, 39.6], [56.4, 39]];
const look = { x: 0, y: 0, tx: 0, ty: 0, still: true, px: null, py: null };
let lastMove = 0;
addEventListener('pointermove', (e) => { look.px = e.clientX; look.py = e.clientY; lastMove = performance.now(); look.still = false; }, { passive: true });

export function glyphFace(canvas, { hero = false } = {}) {
  const ctx = canvas.getContext('2d');
  const step = hero ? 1 : 3;
  const cols = Math.floor(FW / step), rows = Math.floor(FH / step);
  let cw = 0, ch = 0, cell = 5, visible = true, color = '#ddd', dark = false;
  const t0 = performance.now(), flick = new Float32Array(cols * rows);

  function size() {
    const r = canvas.getBoundingClientRect(); const dpr = Math.min(devicePixelRatio || 1, 2);
    cw = r.width; cell = cw / cols; ch = cell * rows;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr); canvas.style.height = ch + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    color = getComputedStyle(document.documentElement).getPropertyValue('--fg').trim() || '#ddd';
    dark = document.documentElement.dataset.theme !== 'light';
  }
  new ResizeObserver(size).observe(canvas); size();
  new MutationObserver(size).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; }, { threshold: 0 }).observe(canvas);

  function sample(fx, fy) {                                  // bilinear-ish: nearest is fine at this size
    const x = Math.round(fx), y = Math.round(fy);
    if (x < 0 || y < 0 || x >= FW || y >= FH) return 0;
    return TONE[y * FW + x];
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    const r = canvas.getBoundingClientRect();
    if (!look.still && now - lastMove < 4000) {
      look.tx = Math.max(-1, Math.min(1, (look.px - (r.left + r.width / 2)) / Math.max(innerWidth * 0.45, 1)));
      look.ty = Math.max(-1, Math.min(1, (look.py - (r.top + r.height * 0.4)) / Math.max(innerHeight * 0.45, 1)));
    } else { look.tx = Math.sin(now / 2300) * 0.7; look.ty = Math.sin(now / 3100) * 0.25; }
    look.x += (look.tx - look.x) * 0.12; look.y += (look.ty - look.y) * 0.12;
    const lx = reduce ? 0 : look.x, ly = reduce ? 0 : look.y;
    const sway = lx * 2.4 + Math.sin(now / 1700) * 0.8;

    const dpr = Math.min(devicePixelRatio || 1, 2), SX = 1.6;
    ctx.setTransform(dpr * SX, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cw, ch);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${cell * 1.2}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
    ctx.fillStyle = color;
    const age = (now - t0) / (hero ? 1800 : 1200);
    const mx = look.px != null ? (look.px - r.left) / cell : -99, my = look.py != null ? (look.py - r.top) / cell : -99;
    const blinkOn = (now % 4200) < 140;

    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const gx = x * step + step / 2, gy = y * step + step / 2;
      // head leans with the cursor (more at the top), iris cells are dragged toward it
      let sx = gx - sway * (1 - gy / FH), sy = gy;
      for (const [ex, ey] of EYES) {
        const d = Math.hypot(gx - ex, gy - ey);
        if (d < 7) { const f = (1 - d / 7); sx -= lx * 3.4 * f; sy -= ly * 2.6 * f; }
      }
      let v = sample(sx, sy);
      if (!v) continue;
      if (blinkOn && !reduce) for (const [ex, ey] of EYES) if (Math.abs(gy - ey) < 2.2 && Math.abs(gx - ex) < 7) v = Math.min(255, v + 120);
      const order = rnd(x * 7 + y * 131) * 0.6 + Math.hypot(x - cols / 2, y - rows * 0.4) / (cols * 0.9) * 0.4;
      if (!reduce && age < order * 1.4 + 0.05) continue;
      const settling = !reduce && age < order * 1.4 + 0.3;
      // tone → density. Light theme: dark pixels are heavy ink. Dark theme: light pixels glow, with a floor so hair still shows.
      const t = v / 255;
      let dens = dark ? Math.max(0.34, Math.pow(t, 0.7)) : Math.pow(1 - t, 1.1) + 0.04;
      if (v === 215) dens = dark ? 0.2 : 0.14;                   // shirt: faint
      dens = Math.min(1, dens);
      let c = RAMP[Math.min(RAMP.length - 1, (dens * RAMP.length) | 0)];
      if (PAIR[c] && (x + y) % 2) c = PAIR[c];
      if (v === 215) c = (x + y) % 3 ? ((x + y) % 2 ? '[' : ']') : '/';
      if (v < 70 && !dark && (x * 5 + y * 3) % 7 === 0) c = (x + y) % 2 ? '}' : '{';
      const near = Math.hypot(x - mx, y - my);
      if (near < 5 && !reduce) flick[y * cols + x] = 1;
      if (flick[y * cols + x] > 0) { c = POOL[(rnd(x * 3 + y * 17 + Math.floor(now / 90)) * POOL.length) | 0]; flick[y * cols + x] -= 0.05; }
      if (settling) c = POOL[(rnd(x + y * 9 + Math.floor(now / 60)) * POOL.length) | 0];
      ctx.globalAlpha = Math.min(1, 0.25 + dens * 0.85) * (settling ? 0.6 : 1);
      ctx.fillText(c, (x * cell + cell / 2) / SX, y * cell + cell / 2);
    }
    ctx.globalAlpha = 1;
  }
  requestAnimationFrame(frame);
}
