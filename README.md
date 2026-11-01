# The Dustbin

A voice-driven interactive story. At 12 I got 2 out of 30 in a computer exam and hid the paper for years.
Here, each failure is a crumpled paper in a dustbin. Open one, hear the voice note, read the line about what I decided next.
Built as a hiring submission for Wispr Flow's India growth team. No accounts, no backend, no database, no tracking. Static site.

## Run

```bash
npm install
npm run dev          # http://localhost:5173 (also on your LAN, for phone testing)
```

Test shortcuts (query string):

| URL | What it does |
|---|---|
| `/?preview` | Skips tap-to-begin (for your testing). `/?preview&ch=4` jumps to a chapter (0–6). |
| `/?mode=2d` | Forces the lighter 2D version. |
| `/?q=low` · `q=mid` · `q=high` | Forces a quality tier. |

Keyboard: `Enter/Space` primary action · `←/→` chapters · `M` mute · `S` skip paper · `R` replay.

## Build

```bash
npm run build        # outputs dist/
npm run check:size   # prints transfer before the first voice note (budget 5 MB)
npm run preview      # serve dist/ locally
```

## Deploy (static)

```bash
npm run deploy               # build + size check + Vercel prod deploy
npm run deploy -- netlify    # same, to Netlify
```

Or just drag `dist/` into Netlify Drop, or connect the repo (build `npm run build`, output `dist`). `vercel.json` / `netlify.toml` set cache headers.
The build uses relative paths, so it also works from a sub-folder.

## Adding your voice notes

Drop files in `public/audio/` named `slot-0` … `slot-6`, as `.mp3` (preferred) and `.ogg` (fallback). Mono 64 kbps is plenty.
`public/audio/manifest.json` lists the slots. For exact caption sync, add `cues` to a slot:

```json
{ "mp3": "audio/slot-1.mp3", "ogg": "audio/slot-1.ogg",
  "cues": [ { "t": 0.0, "text": "Seventh grade. Computer exam." },
            { "t": 3.2, "text": "I got 2 out of 30.", "words": [ {"t":3.2,"w":"I"}, {"t":3.4,"w":"got"} ] } ] }
```

Without `cues`, the default script in `src/story.js` is spread across the audio's duration.
**With no audio file at all**, captions run on a gentle timer (~2.5 words/sec), so the site works silent.
Slots: 0 opening · 1 "2 out of 30" · 2 "55 hands" · 3 "Not selected" · 4 "Small scope" · 5 "Still crumpled" · 6 the question.

## How it's built

- Vanilla ES modules + Vite + three.js. No framework. The 3D scene is a separate lazy chunk, so the first paint is a tiny shell.
- Everything is procedural: geometry, textures, and all sound design (Web Audio: room tone, wind over rock, paper rustle, dirt, thuds). No models or images to download.
- Quality tiers (low / mid / high) from cores, memory, DPR, save-data, and reduced-motion. Sustained low FPS steps the tier down; WebGL failure switches to a 2D version with the same audio and captions.
- Accessibility: captions always on, screen-reader live region, keyboard control, reduced motion respected, nothing flashes.

## Copy to double-check (voice-dictation garbles in the original brief)

I did not guess these. They are written conservatively in `src/story.js`; please read them against your memory:

1. Chapter 4: the CEO line (the brief had a garbled phrase after "thinking small"), and the project name. The project is never named.
2. Chapter 3: "I cried, wanting just one" (brief said "cried while playing for just one"), and the "explainable" remark about the DataHack win was left out.
3. Chapter 5: the closing placeholder wording.
4. Chapter 6: the spoken intro is my wording, not a fact.
