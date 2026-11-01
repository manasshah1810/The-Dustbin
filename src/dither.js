// Photo -> pure 1-bit (black / white) portrait. Atkinson dither on a small canvas, shown pixelated.
// Looks for public/narrator/face.(png|jpg|jpeg|webp). Falls back to a plain silhouette.
const SRC = ['face.png', 'face.jpg', 'face.jpeg', 'face.webp'];
// crop as fractions of the source image: head + neck + a little shoulder
const CROP = { x: 0.06, y: 0.02, w: 0.88, h: 0.7 };
const INK = [27, 27, 27], PAPER = [233, 231, 226]; // soft black and warm off-white, never pure
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function loadImg(url) {
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
}
async function findPhoto() {
  for (const f of SRC) { const i = await loadImg(import.meta.env.BASE_URL + 'narrator/' + f); if (i && i.naturalWidth > 32) return i; }
  return null;
}

function blur(g, w, h, r) {
  const t = new Float32Array(g.length), o = new Float32Array(g.length), n = r * 2 + 1;
  for (let y = 0; y < h; y++) { let s = 0; for (let x = -r; x <= r; x++) s += g[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) { t[y * w + x] = s / n; s += g[y * w + Math.min(w - 1, x + r + 1)] - g[y * w + Math.max(0, x - r)]; } }
  for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) { o[y * w + x] = s / n; s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; } }
  return o;
}

function ditherInto(canvas, draw, W, H) {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#e9e7e2'; ctx.fillRect(0, 0, W, H);
  draw(ctx, W, H);
  const d = ctx.getImageData(0, 0, W, H), px = d.data;
  let g = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) g[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
  // local contrast (unsharp) so eyes, glasses and mouth survive the 1-bit squeeze
  const b = blur(g, W, H, Math.round(W / 9));
  for (let i = 0; i < g.length; i++) g[i] = g[i] + 1.5 * (g[i] - b[i]);
  // level stretch by percentile, then lift the midtones a little (skin would otherwise go solid black)
  const sorted = Float32Array.from(g).sort();
  const lo = sorted[Math.floor(g.length * 0.02)], hi = sorted[Math.floor(g.length * 0.97)];
  for (let i = 0; i < g.length; i++) g[i] = Math.pow(Math.min(1, Math.max(0, (g[i] - lo) / (hi - lo || 1))), 0.7);
  // flatten the backdrop to clean paper so only the face and hair carry dots
  for (let i = 0; i < g.length; i++) { const t = Math.min(1, Math.max(0, (g[i] - 0.1) / 0.62)); g[i] = t * t * (3 - 2 * t); }
  // chunky ordered dither (Bayer 4x4): few, big dots so it reads as a playful pixel drawing, not a photo
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, th = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
    const on = g[i] > th, c = on ? PAPER : INK;
    px[i * 4] = c[0]; px[i * 4 + 1] = c[1]; px[i * 4 + 2] = c[2]; px[i * 4 + 3] = 255;
  }
  ctx.putImageData(d, 0, 0);
}

function silhouette(ctx, W, H) {
  ctx.fillStyle = '#d8d8d8'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#333';
  ctx.beginPath(); ctx.ellipse(W / 2, H * 0.42, W * 0.27, H * 0.3, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(W / 2, H * 1.02, W * 0.46, H * 0.3, 0, 0, 7); ctx.fill();
}

/** Renders the portrait into `canvas` (1 canvas px = 1 big dither dot). Resolves true if a real photo was used. */
export async function drawPortrait(canvas, W = 104) {
  const img = await findPhoto();
  const ratio = img ? (img.naturalHeight * CROP.h) / (img.naturalWidth * CROP.w) : 1.2;
  const H = Math.round(W * ratio);
  ditherInto(canvas, (ctx, w, h) => {
    if (!img) return silhouette(ctx, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, img.naturalWidth * CROP.x, img.naturalHeight * CROP.y, img.naturalWidth * CROP.w, img.naturalHeight * CROP.h, 0, 0, w, h);
  }, W, H);
  return !!img;
}
