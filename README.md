# HavenScroll v2.0

Private, fully offline sanctuary PWA. No analytics, no AI generation, no time-gated content.

## File structure

```
havenscroll/
├── index.html              ← markup shell only (no inline CSS/JS)
├── style.css               ← all styling + @font-face + time-of-day themes
├── app.js                  ← all logic
├── data.json               ← ALL content: quotes, book pages, letters,
│                              micro-challenges, grounding steps, podcasts
├── sw.js                   ← service worker (precaches everything for offline)
├── manifest.webmanifest
├── version.json            ← bump this to trigger the in-app update banner
├── .nojekyll
├── icons/                  ← put your existing icon-180/192/512.png here
└── assets/
    ├── fonts/Inter-Variable.ttf, Inter-Italic-Variable.ttf, OFL.txt
    ├── audio/splash-sound.mp3
    └── video/sanctuary-bg.mp4, neuro-bg.mp4, satire-bg.mp4
```

## How the architecture connects

1. `index.html` loads `style.css` and `app.js`.
2. On boot, `app.js` runs `loadContentData()` which `fetch()`es `data.json` and
   populates every module (feed, book, letters, challenges, podcasts).
   **To add a quote or letter, edit only `data.json`** — no code changes.
3. `sw.js` precaches the shell + fonts + videos + audio, so after the first
   visit the entire app (including video backgrounds) works with airplane mode on.
   Shell files are network-first (fresh when online, cached when offline);
   heavy media is cache-first.
4. Bumping `version.json` (e.g. to `2.0.1`) + renaming `CACHE_NAME` in `sw.js`
   shows the "Update Now" banner on her device within 5 minutes.

## v2.0 features

- **Immersive video backgrounds** per card category, lazy-loaded and paused
  off-screen to protect battery; respects `prefers-reduced-motion`.
- **Magnetic glow** follows touch/mouse on every card; **parallax** drifts the
  text and video at different speeds while scrolling.
- **Time-of-day themes**: warm gold mornings, deep indigo evenings,
  near-pitch-black nights (palettes in `style.css`, applied via
  `<body data-daypart>`; re-checked every 10 min).
- **Cinematic splash** with longer eased fades and the local swoosh sound
  (plays on load where allowed, otherwise on first touch — browser autoplay rules).
- **Local Inter variable font** (2 files cover all weights 100–900 + italics).
- **Hidden XP/level engine** (`localStorage` only): saving quotes, micro-tasks,
  breath cycles, page turns, letters and worry-stone use quietly add XP.
- **"Your Journey" drawer** in Oasis: time in Haven, quotes saved, day streak,
  breath cycles, level + progress. Transparent, on-device, never transmitted.
- **Haptic symphony**: 20 ms page-turn tick, double-pulse save, rolling
  inhale/sharp/exhale vibration patterns matched to the 3 s / 0.7 s / 5 s
  pacer phases, soft continuous worry-stone pulses.
- **Worry Stone** canvas in Oasis: drag to create fluid green/gold ripples with
  gentle haptics.

## Deploying (GitHub Pages)

Upload the whole folder contents to your repo (keep `.nojekyll`). The app must
be served over HTTP(S) — opening `index.html` directly from disk blocks
`fetch('./data.json')` and service workers.

## Haptics on iOS

iOS Safari has no `navigator.vibrate`, so the app ships a two-layer bridge:

1. **iOS 17.4 – 26.4**: a hi
