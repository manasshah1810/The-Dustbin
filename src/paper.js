// A sheet of paper that is pure SVG: a white polygon lit by a turbulence height-map (feDiffuseLighting).
// u = 0 crumpled, u = 1 open. All greyscale. Text is handwritten (Caveat) and only readable once it opens.
let uid = 0;
const NS = 'http://www.w3.org/2000/svg';
const W = 320, H = 420;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function rng(seed) { let s = seed * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }

// 20 points around the rectangle
const BASE = [];
for (let i = 0; i < 5; i++) BASE.push([(i / 5) * W, 0]);
for (let i = 0; i < 5; i++) BASE.push([W, (i / 5) * H]);
for (let i = 0; i < 5; i++) BASE.push([W - (i / 5) * W, H]);
for (let i = 0; i < 5; i++) BASE.push([0, H - (i / 5) * H]);

export function createPaper(host, { seed = 1, title = '', body = '', foot = '', cap = 1 } = {}) {
  const id = 'pp' + ++uid;
  const rnd = rng(seed);
  const jit = BASE.map(() => [rnd() - 0.5, rnd() - 0.5]);
  const spin = (rnd() - 0.5) * 2;
  const el = document.createElement('div');
  el.className = 'paper';
  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">
      <defs>
        <filter id="${id}" x="0" y="0" width="${W}" height="${H}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
          <feTurbulence type="turbulence" baseFrequency="0.03 0.04" numOctaves="4" seed="${seed * 7}" result="n"/>
          <feDiffuseLighting in="n" surfaceScale="3" diffuseConstant="1.15" lighting-color="#ffffff" result="lit">
            <feDistantLight azimuth="235" elevation="52"/>
          </feDiffuseLighting>
          <feComposite in="lit" in2="SourceAlpha" operator="in"/>
        </filter>
      </defs>
      <polygon class="sheet" fill="#fff" filter="url(#${id})"/>
      <g class="folds" stroke="#000" stroke-width="1" fill="none">
        <line x1="${W / 2}" y1="6" x2="${W / 2}" y2="${H - 6}"/><line x1="6" y1="${H / 3}" x2="${W - 6}" y2="${H / 3}"/><line x1="6" y1="${(H * 2) / 3}" x2="${W - 6}" y2="${(H * 2) / 3}"/>
      </g>
    </svg>
    <div class="ink"><p class="ptitle"></p><p class="pbody"></p><p class="pfoot"></p></div>`;
  host.appendChild(el);
  const poly = el.querySelector('.sheet'), turb = el.querySelector('feTurbulence'), light = el.querySelector('feDiffuseLighting');
  const folds = el.querySelector('.folds'), ink = el.querySelector('.ink');
  const [pt, pb, pf] = ink.children;
  pt.textContent = title; pb.textContent = body; pf.textContent = foot;
  let last = -1;
  const api = {
    el,
    setText({ title: t, body: b, foot: f } = {}) { if (t != null) pt.textContent = t; if (b != null) pb.textContent = b; if (f != null) pf.textContent = f; },
    setU(raw) {
      const u = clamp(raw, 0, cap);
      if (Math.abs(u - last) < 0.004) return;
      last = u;
      const c = 1 - u;
      const amp = 70 * Math.pow(c, 1.1);
      const cx = W / 2, cy = H / 2, pull = 0.34 * c;
      const pts = BASE.map(([x, y], i) => {
        const nx = x + jit[i][0] * amp, ny = y + jit[i][1] * amp;
        return (cx + (nx - cx) * (1 - pull)).toFixed(1) + ',' + (cy + (ny - cy) * (1 - pull)).toFixed(1);
      }).join(' ');
      poly.setAttribute('points', pts);
      turb.setAttribute('baseFrequency', (0.011 + 0.03 * c).toFixed(4) + ' ' + (0.015 + 0.04 * c).toFixed(4));
      light.setAttribute('surfaceScale', (0.5 + 4.5 * c).toFixed(2));
      folds.style.opacity = (ss(0.7, 1, u) * 0.14).toFixed(3);
      const s = 0.62 + 0.38 * ss(0, 0.9, u);
      el.style.transform = `rotate(${(spin * 16 * c).toFixed(2)}deg) scale(${s.toFixed(3)})`;
      ink.style.opacity = ss(0.5, 0.92, u).toFixed(3);
    },
  };
  api.setU(0);
  return api;
}
