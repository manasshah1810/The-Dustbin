// A face made of code characters. Drawn as shapes to a tiny offscreen canvas, then every cell
// is re-typed as a bracket / colon / semicolon / slash. Eyes follow the cursor, the head leans
// left and right, and the whole thing "generates" itself character by character on first show.
const W = 40, H = 46, K = 40 / 54;
const POOL = '{}[]();:<>/\\=&|;:'.split('');
const rnd = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const look = { x: 0, y: 0, tx: 0, ty: 0, still: true };
let lastMove = 0;
addEventListener('pointermove', (e) => { look.px = e.clientX; look.py = e.clientY; lastMove = performance.now(); look.still = false; }, { passive: true });

export function glyphFace(canvas, { mood = 0.6, hero = false } = {}) {
  const ctx = canvas.getContext('2d');
  const off = document.createElement('canvas'); off.width = W; off.height = H;
  const o = off.getContext('2d', { willReadFrequently: true });
  let cw = 0, ch = 0, cell = 8, t0 = performance.now(), born = reduce ? 1e9 : 0, visible = true, blink = 0, nextBlink = 2500, color = '#ddd';
  const flick = new Float32Array(W * H); let HX = 27;

  function size() {
    const r = canvas.getBoundingClientRect(); const dpr = Math.min(devicePixelRatio || 1, 2);
    cw = r.width; cell = cw / W; ch = cell * H * 1.0;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr); canvas.style.height = ch + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); color = getComputedStyle(document.documentElement).getPropertyValue('--fg').trim() || '#ddd';
  }
  new ResizeObserver(size).observe(canvas); size();
  new MutationObserver(size).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; }, { threshold: 0 }).observe(canvas);

  function shapes(now) {
    const sway = Math.sin(now / 1700) * 1.6 + look.x * 5;           // head leans left / right
    const bob = Math.sin(now / 900) * 0.6;
    const hx = 27 + sway, hy = 26 + bob + look.y * 1.5;
    const bx = 27 + sway * 0.35;
    o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, W, H); o.setTransform(K, 0, 0, K, 0, 0); HX = hx;
    const fill = (id) => { o.fillStyle = `rgb(${id},0,0)`; o.strokeStyle = o.fillStyle; };
    // body & neck
    fill(6); o.beginPath(); o.moveTo(bx - 25, 62); o.quadraticCurveTo(bx - 22, 46, bx, 45); o.quadraticCurveTo(bx + 22, 46, bx + 25, 62); o.fill();
    fill(7); o.fillRect(bx - 4 + sway * 0.2, 38, 8, 9);
    // head
    fill(2); o.beginPath(); o.ellipse(hx, hy, 15.5, 18.5, look.x * 0.12, 0, 7); o.fill();
    // ears
    o.beginPath(); o.ellipse(hx - 15.5, hy + 2, 2.2, 3.4, 0, 0, 7); o.ellipse(hx + 15.5, hy + 2, 2.2, 3.4, 0, 0, 7); o.fill();
    // hair
    fill(1); o.beginPath(); o.moveTo(hx - 16, hy - 2); o.bezierCurveTo(hx - 19, hy - 24, hx + 19, hy - 24, hx + 16, hy - 2);
    o.bezierCurveTo(hx + 14, hy - 10, hx + 6, hy - 12, hx, hy - 12 + look.x * 1.5); o.bezierCurveTo(hx - 8, hy - 12, hx - 13, hy - 10, hx - 16, hy - 2); o.fill();
    // glasses rims (rings)
    const ex = 7.4, ey = hy - 1;
    fill(3); o.lineWidth = 2.1;
    for (const s of [-1, 1]) { o.beginPath(); o.arc(hx + s * ex, ey, 5.2, 0, 7); o.stroke(); }
    o.beginPath(); o.moveTo(hx - 2.2, ey); o.lineTo(hx + 2.2, ey); o.stroke();
    // pupils follow the cursor
    const bl = blink > 0 ? 0.15 : 1;
    fill(4);
    for (const s of [-1, 1]) { o.beginPath(); o.ellipse(hx + s * ex + look.x * 2.6, ey + look.y * 2.2, 2.6, 2.6 * bl, 0, 0, 7); o.fill(); }
    // brows lift a little toward the cursor
    fill(8); o.lineWidth = 1.6;
    for (const s of [-1, 1]) { o.beginPath(); o.moveTo(hx + s * ex - 3, ey - 7.5 - look.y * 0.8); o.lineTo(hx + s * ex + 3, ey - 8 + look.y * 0.8 - mood * 0.4); o.stroke(); }
    // mouth: curvature = mood, a little wider when the cursor is close
    const m = mood * (4 + Math.max(0, 1 - Math.hypot(look.x, look.y)) * 1.2);
    fill(5); o.lineWidth = 2.4; o.beginPath(); o.moveTo(hx - 5.5 + look.x, hy + 9); o.quadraticCurveTo(hx + look.x * 1.5, hy + 9 + m, hx + 5.5 + look.x, hy + 9); o.stroke();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    // where is the cursor relative to this face? (on touch / idle, it drifts around on its own)
    const r = canvas.getBoundingClientRect();
    if (!look.still && now - lastMove < 4000) {
      const dx = (look.px - (r.left + r.width / 2)) / Math.max(innerWidth * 0.45, 1), dy = (look.py - (r.top + r.height * 0.4)) / Math.max(innerHeight * 0.45, 1);
      look.tx = Math.max(-1, Math.min(1, dx)); look.ty = Math.max(-1, Math.min(1, dy));
    } else { look.tx = Math.sin(now / 2300) * 0.7; look.ty = Math.sin(now / 3100) * 0.25; }
    look.x += (look.tx - look.x) * 0.12; look.y += (look.ty - look.y) * 0.12;
    if (reduce) { look.x = look.y = 0; }
    nextBlink -= 16; if (nextBlink < 0) { blink = 7; nextBlink = 2400 + Math.random() * 2400; } if (blink > 0) blink--;

    shapes(now);
    const d = o.getImageData(0, 0, W, H).data;
    ctx.clearRect(0, 0, cw, ch);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${cell * 1.3}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
    ctx.fillStyle = color;
    const age = (now - t0) / (hero ? 1700 : 1100);
    const mx = look.px != null ? (look.px - r.left) / cell : -99, my = look.py != null ? (look.py - r.top) / (cell) : -99;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4; if (d[i + 3] < 100) continue;
      const id = d[i];
      // "generating": cells settle in a scattered order from the middle outward
      const order = rnd(x * 7 + y * 131) * 0.6 + Math.hypot(x - 20, y - 22) / 45 * 0.4;
      if (!reduce && age < order * 1.4 + 0.05) continue;
      let ch1, a;
      const settling = !reduce && age < order * 1.4 + 0.3;
      switch (id) {
        case 1: ch1 = (x + y) % 2 ? '{' : '}'; a = 1; break;
        case 2: ch1 = (x * 3 + y * 5) % 7 < 3 ? ':' : ((x + y) % 3 ? ';' : '.'); a = 0.3; break;
        case 3: ch1 = x < HX * K ? '(' : ')'; a = 1; break;
        case 4: ch1 = '@'; a = 1; break;
        case 5: ch1 = x < HX * K - 1.6 ? '\\' : x > HX * K + 1.6 ? '/' : '_'; a = 1; break;
        case 8: ch1 = '-'; a = 0.9; break;
        case 6: ch1 = (x + y) % 3 === 0 ? '/' : ((x + y) % 3 === 1 ? '[' : ']'); a = 0.6; break;
        case 7: ch1 = '|'; a = 0.6; break;
        default: ch1 = ';'; a = 0.5;
      }
      
      // cells near the cursor re-type themselves
      const near = Math.hypot(x - mx, y - my);
      if (near < 6 && !reduce) { flick[y * W + x] = 1; }
      if (flick[y * W + x] > 0) { ch1 = POOL[(rnd(x * 3 + y * 17 + Math.floor(now / 90)) * POOL.length) | 0]; flick[y * W + x] -= 0.05; }
      if (settling) ch1 = POOL[(rnd(x + y * 9 + Math.floor(now / 60)) * POOL.length) | 0];
      ctx.globalAlpha = a * (settling ? 0.6 : 1);
      ctx.fillText(ch1, x * cell + cell / 2, y * cell + cell / 2);
    }
    ctx.globalAlpha = 1;
  }
  requestAnimationFrame(frame);
}
