// Turns the gate's two labels into particles that stream to the top-right and form the speaker icon.
export const SPEAKER = {
  body: 'M4 9h4l5-4v14l-5-4H4z',
  waves: ['M16 8.5a5 5 0 010 7', 'M18.6 6a8.6 8.6 0 010 12'],
  slash: 'M4 4l16 16',
};
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function sample(draw, w, h, step) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true }); draw(x);
  const d = x.getImageData(0, 0, w, h).data, pts = [];
  for (let j = 0; j < h; j += step) for (let i = 0; i < w; i += step) if (d[(j * w + i) * 4 + 3] > 120) pts.push([i, j]);
  return pts;
}

export function morph({ canvas, labels, muted, color = '#e8e6e1', onDone }) {
  const W = innerWidth, H = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);

  // source points: the actual text, where it sits on screen
  let src = [];
  for (const l of labels) {
    src = src.concat(sample((x) => { x.font = l.font; x.fillStyle = '#fff'; x.textBaseline = 'alphabetic'; x.fillText(l.text, l.x, l.baseline); }, W, H, 3));
  }
  // target points: the speaker, 44px, top-right, same place as the real button
  const S = 44, ox = W - 18 - S, oy = 16;
  const tgt = sample((x) => {
    x.translate(ox, oy); x.scale(S / 24, S / 24); x.strokeStyle = x.fillStyle = '#fff'; x.lineWidth = 1.9; x.lineJoin = x.lineCap = 'round';
    x.stroke(new Path2D(SPEAKER.body)); if (!muted) SPEAKER.waves.forEach((p) => x.stroke(new Path2D(p))); else x.stroke(new Path2D(SPEAKER.slash));
  }, W, H, 1);
  if (src.length > 2600) src = src.filter((_, i) => i % Math.ceil(src.length / 2600) === 0);
  const P = src.map(([x, y], i) => {
    const t = tgt[(Math.random() * tgt.length) | 0];
    const dx = t[0] - x, dy = t[1] - y, len = Math.hypot(dx, dy);
    const side = Math.random() < 0.5 ? -1 : 1, bend = (0.12 + Math.random() * 0.3) * len * side;
    return { x0: x, y0: y, tx: t[0] + (Math.random() - .5) * 1.2, ty: t[1] + (Math.random() - .5) * 1.2,
      cx: x + dx * 0.4 - dy / len * bend, cy: y + dy * 0.4 + dx / len * bend,
      jx: (Math.random() - .5) * 46, jy: (Math.random() - .5) * 46 - 10,
      delay: Math.random() * 0.45 + (x / W) * 0.25, a: 0.55 + Math.random() * 0.45, r: 0.8 + Math.random() * 1.1 };
  });
  const T = 2.3; let start = 0, raf = 0, finished = false;
  function frame(now) {
    if (!start) start = now; const s = (now - start) / 1000;
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = color;
    let allDone = true;
    for (const p of P) {
      const u = Math.max(0, Math.min(1, (s - p.delay) / (T - 0.7)));
      let x, y;
      if (u === 0) { x = p.x0; y = p.y0; }
      else {
        // first a little scatter ("the words come apart"), then the curved flight to the corner
        const k = ease(u), burst = Math.sin(Math.min(u * 2.2, 1) * Math.PI) * (1 - u);
        const bx = (1 - k) * (1 - k) * p.x0 + 2 * (1 - k) * k * p.cx + k * k * p.tx;
        const by = (1 - k) * (1 - k) * p.y0 + 2 * (1 - k) * k * p.cy + k * k * p.ty;
        x = bx + p.jx * burst; y = by + p.jy * burst;
      }
      if (u < 1) allDone = false;
      ctx.globalAlpha = p.a * (u === 0 ? 1 : 0.9);
      ctx.fillRect(x - p.r / 2, y - p.r / 2, p.r, p.r);
    }
    ctx.globalAlpha = 1;
    if (allDone && !finished) { finished = true; onDone && onDone(); cancelAnimationFrame(raf); return; }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
