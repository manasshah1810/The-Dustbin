# Module contracts (do not change without telling the lead)

Palette: bg #1C1917, shadow #120F0D, paper #F3EAD7, ink #1A1A1A, body text #EDE6B8, accent amber #E8A33D
(accent ONLY for chapter 4 "small scope" lighting and the final chapter 6 question). No neon.
Stack: vanilla ES modules, three (npm), Vite. NO other runtime deps. Everything procedural: no model files, no textures to download.

## Chapters
0 opening (dim room, spotlight on bin, ONE crumpled paper)   1 "2 out of 30"   2 "55 hands"
3 "Not selected"   4 "Small scope" (heavier, dark, warm amber)   5 "Still crumpled" (half-unfolded, trembling, never fully opens)
6 "What would you throw in the bin?" (visitor's own paper, local only)
Papers 1..5 are story papers. Paper i appears in/around the bin once chapter >= i (chapter 0 shows only paper 1).

## src/scene3d/world.js  (3D agent owns src/scene3d/*)
export async function createWorld(canvas, opts) -> world
 opts: { quality: 'high'|'mid'|'low', reducedMotion: boolean, onSfx(evt), onFrameStats?(fps) }
   onSfx evt: { type: 'lift'|'unfold'|'fold'|'thud'|'puff'|'crumple'|'dirt', pan: -1..1, gain: 0..1 }
 Must THROW if WebGL is unavailable (caller falls back to 2D).
 world.setChapter(i, {instant?:boolean})   // each chapter has its own lighting/camera move; ch4 warm amber + heavier/darker, bin brightens
 world.openPaper(i): Promise<void>         // lift from bin on curved path, face camera, unfold (displacement -> 0 with edge curl). resolves when readable-ready
 world.closePaper(): Promise<void>         // refold, fall back into bin w/ small bounce + dust puff. resolves when settled
 world.setTremble(on:boolean)              // ch5: paper stays half unfolded and trembles (openPaper(5) must stop at ~half unfold and never fully unfold)
 world.submitUserPaper(text:string): Promise<void> // ch6: visitor paper appears, crumples (noise displacement up), drops into bin. text is only drawn onto the paper texture, never stored/sent
 world.setParallax(x,y)                    // -1..1 from pointer/gyro, smoothed internally
 world.resize(w,h,dpr)                     // cap dpr at 2 internally (and lower for 'low')
 world.setPaused(bool)
 world.dispose()
 Paper surface: canvas-generated texture (cream #F3EAD7, faint fold lines, ink #1A1A1A handwritten-ish title text optional). Subdivided plane, vertex displacement by noise in shader or CPU.
 Scene: believable procedural dustbin (lathe geometry, rim torus, subtle dents, handles optional), floor (desert sand, procedural normal/noise in shader), one warm SpotLight w/ soft shadows,
 volumetric light shaft (cone mesh w/ additive gradient shader), floating dust motes (Points), subtle camera drift, parallax, vignette (CSS or cheap pass), optional bloom ONLY on quality 'high' (keep cheap, e.g. custom downsample or skip).
 Quality tiers: low = no shadows, fewer motes, dpr<=1.25, no bloom. Target 60fps on midrange phone. Respect opts.reducedMotion (no drift, no tremble amplitude beyond tiny, shorter tweens).
 Portrait-first: camera framing must work at 9:16 and at 16:9. No flashing.

## src/audio/engine.js  (audio agent owns src/audio/engine.js and src/audio/procedural.js)
export const audio = {
  unlock(): Promise<void>        // call inside a user gesture; creates/resumes AudioContext (iOS safe: also plays a silent buffer)
  getContext(): AudioContext|null
  getVoiceBus(): AudioNode|null  // GainNode voice playback may connect to (for ducking/mute); may be null before unlock
  setMuted(b), isMuted()
  setChapter(i)                  // crossfade procedural ambience beds: room tone/air, soft wind over rock, faint paper-dust hiss. ch4 = low warm drone (no melody), ch5 = unsettled thin tremble tone
  sfx(type, {pan=0, gain=1}={})  // types: lift unfold fold thud puff crumple dirt tap (all synthesised: filtered noise, envelopes; spatial via StereoPannerNode)
  duck(on:boolean)               // lower ambience ~-9dB while a voice note plays
  suspend()/resume()             // on visibilitychange
}
Everything synthesised with Web Audio; no audio files. Must be safe to call every method before unlock (no-op) and never throw.
