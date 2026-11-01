import * as THREE from 'three';
import { smooth } from './util.js';

// Per-chapter look. Colors are hex; amber #E8A33D appears ONLY in ch4 (warm phase). Ch6's question is page-side.
const base = {
  spotI: 95, angle: 0.22, pen: 0.85, spotColor: 0xffdfb0, ambI: 0.2, ambColor: 0x3a4aa6, fog: 0.06,
  bg: 0x0c1233, shaft: 0.22, binEm: 0, camDist: 1.12, pitch: 0.36, ty: 0.72, roll: 0, camX: 0, sx: 0.4, sy: 5.2, sz: 1.4, env: 0.3,
};
const mk = (o) => ({ ...base, ...o });

// Midnight Ember: indigo shadows, champagne key light. Amber #E8A33D appears ONLY in ch4 (warm phase).
export const PRESETS = [
  mk({}),
  mk({ spotI: 100, angle: 0.27, pen: 0.8, spotColor: 0xdbe5ff, ambI: 0.22, ambColor: 0x4a5cc0, fog: 0.055, bg: 0x0a1030, shaft: 0.22, camDist: 1.06, env: 0.32 }),
  mk({ spotI: 125, angle: 0.31, pen: 0.8, spotColor: 0xffe6c2, ambI: 0.26, ambColor: 0x5468c8, fog: 0.05, bg: 0x111a45, shaft: 0.26, camDist: 1.02, pitch: 0.34, env: 0.34 }),
  mk({ spotI: 115, angle: 0.25, pen: 0.45, spotColor: 0xb9cdf5, ambI: 0.16, ambColor: 0x2e3f9a, fog: 0.07, bg: 0x070b24, shaft: 0.26, camDist: 1.0, sx: -0.2, sy: 5.6, sz: 0.8, env: 0.22 }),
  // chapter 4: heavy and dark first; warm amber is blended in over time (see WARM4)
  mk({ spotI: 55, angle: 0.2, pen: 0.9, spotColor: 0x9aa0b8, ambI: 0.08, ambColor: 0x222c78, fog: 0.09, bg: 0x060918, shaft: 0.12, camDist: 0.9, pitch: 0.28, ty: 0.8, sy: 4.6, sx: 0.3, env: 0.14 }),
  mk({ spotI: 85, angle: 0.26, pen: 0.85, spotColor: 0xd4d6e0, ambI: 0.14, ambColor: 0x3a447e, fog: 0.07, bg: 0x10142c, shaft: 0.2, camDist: 1.0, roll: 0.012, env: 0.2 }),
  mk({ spotI: 108, angle: 0.3, pen: 0.8, spotColor: 0xffecd0, ambI: 0.28, ambColor: 0x5a6ed0, fog: 0.05, bg: 0x121c4c, shaft: 0.26, camDist: 1.1, ty: 0.3, env: 0.32 }),
];
const WARM4 = { spotI: 130, angle: 0.24, spotColor: 0xe8a33d, ambI: 0.1, ambColor: 0x3a2a60, shaft: 0.36, binEm: 0.12, env: 0.2, fog: 0.085, bg: 0x2a1308 };

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
