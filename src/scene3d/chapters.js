import * as THREE from 'three';
import { smooth } from './util.js';

// Per-chapter look. Colors are hex; amber #E8A33D appears ONLY in ch4 (warm phase). Ch6's question is page-side.
const base = {
  spotI: 90, angle: 0.21, pen: 0.85, spotColor: 0xffe3bd, ambI: 0.2, ambColor: 0x4a63d6, fog: 0.07, bg: 0x1738b8,
  shaft: 0.2, binEm: 0, camDist: 1.12, pitch: 0.36, ty: 0.72, roll: 0, camX: 0, sx: 0.4, sy: 5.2, sz: 1.4, env: 0.18,
};
const mk = (o) => ({ ...base, ...o });

export const PRESETS = [
  mk({}),
  mk({ spotI: 100, angle: 0.27, pen: 0.8, spotColor: 0xe6e8ea, ambI: 0.16, ambColor: 0x5870e0, fog: 0.06, shaft: 0.22, camDist: 1.06, env: 0.22 }),
  mk({ spotI: 125, angle: 0.31, pen: 0.8, spotColor: 0xf3e6cf, ambI: 0.22, ambColor: 0x6a80ea, fog: 0.055, shaft: 0.26, camDist: 1.02, pitch: 0.34, env: 0.26 }),
  mk({ spotI: 115, angle: 0.25, pen: 0.4, spotColor: 0xc4d4ee, ambI: 0.14, ambColor: 0x3550c0, fog: 0.075, bg: 0x102a8c, shaft: 0.26, camDist: 1.0, sx: -0.2, sy: 5.6, sz: 0.8, env: 0.12 }),
  // chapter 4: heavy and dark first; warm amber is blended in over time (see `warm`)
  mk({ spotI: 50, angle: 0.2, pen: 0.9, spotColor: 0x9a8a78, ambI: 0.1, ambColor: 0x2a3fa8, fog: 0.09, bg: 0x0a1c6e, shaft: 0.12, camDist: 0.9, pitch: 0.28, ty: 0.8, sy: 4.6, sx: 0.3, env: 0.08 }),
  mk({ spotI: 85, angle: 0.26, pen: 0.85, spotColor: 0xd9d4cc, ambI: 0.18, ambColor: 0x4458c4, fog: 0.075, bg: 0x132fa6, shaft: 0.2, camDist: 1.0, roll: 0.012, env: 0.14 }),
  mk({ spotI: 105, angle: 0.3, pen: 0.8, spotColor: 0xeeeae2, ambI: 0.26, ambColor: 0x5a70e0, fog: 0.05, bg: 0x1a40c8, shaft: 0.24, camDist: 1.1, ty: 0.3, env: 0.22 }),
];
const WARM4 = { spotI: 125, angle: 0.24, spotColor: 0xe8a33d, ambI: 0.12, ambColor: 0x2c3ca0, shaft: 0.34, binEm: 0.14, env: 0.14, fog: 0.1 };

export const COLOR_KEYS = ['spotColor', 'ambColor', 'bg'];
export const NUM_KEYS = Object.keys(base).filter((k) => !COLOR_KEYS.includes(k));

export function makeState() {
  const s = {};
  for (const k of NUM_KEYS) s[k] = base[k];
  for (const k of COLOR_KEYS) s[k] = new THREE.Color(base[k]);
  return s;
}
const tmpC = new THREE.Color();
export function resolveTarget(out, chapter, chT) {
  const P = PRESETS[Math.max(0, Math.min(6, chapter))];
  const w = chapter === 4 ? smooth((chT - 2.2) / 4.5) : 0;
  for (const k of NUM_KEYS) out[k] = w > 0 && k in WARM4 ? P[k] + (WARM4[k] - P[k]) * w : P[k];
  for (const k of COLOR_KEYS) {
    out[k].set(P[k]);
    if (w > 0 && k in WARM4) out[k].lerp(tmpC.set(WARM4[k]), w);
  }
  return out;
}
