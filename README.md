# HavenScroll PWA - Launch Package

This folder is ready to deploy as a private HTTPS Progressive Web App.

## Files

- `index.html` - main app, now wired for PWA install, iPhone safe areas, service worker registration, toast fix, loader fix, and IndexedDB state.
- `manifest.webmanifest` - app identity, icon metadata, theme color, standalone display.
- `sw.js` - offline cache/service worker.
- `icons/` - placeholder app icons. Replace these before final launch if you want custom branding.

## What is stored offline

The app now stores these user states in IndexedDB:

- saved/starred cards
- daily challenge state
- current book page
- active vibe filter

It also migrates old saved `localStorage` values once if they exist.

## How to launch for one iPhone user

1. Upload this whole folder to an HTTPS host such as Netlify, Vercel, Cloudflare Pages, or GitHub Pages.
2. Open the deployed URL in Safari on the iPhone.
3. Tap Share → Add to Home Screen.
4. Open HavenScroll from the new home-screen icon while online once.
5. Turn on Airplane Mode and reopen it to confirm offline mode.

## Updating later

When you change app files, update the version inside `sw.js`:

```js
const CACHE_VERSION = '1.0.1';
```

Then redeploy. The iPhone may need one or two app opens to refresh the cached version.

## Privacy note

This is private and local-first, but it is not password-encrypted. The app no longer claims encryption. Data is stored on the device under the website origin using IndexedDB.
