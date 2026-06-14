/* ==========================================================================
   HAVENSCROLL v2.0 — app.js
   Architecture:
     data.json  → all content (quotes, book, letters, challenges, podcasts)
     style.css  → all presentation incl. time-of-day themes
     app.js     → logic only. No analytics, no network calls except same-origin
                  data/version fetches. 100% private.
   ========================================================================== */

'use strict';

/* ==========================================================================
   1. CONTENT STORE — loaded from data.json at boot (Pillar 4)
   ========================================================================== */
let baseCards = [];
let bookPages = [];
let omerLetters = [];
let microChallenges = [];
let groundingSteps = [];
let podcastShows = [];

async function loadContentData() {
  try {
    const res = await fetch('./data.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    baseCards       = data.quotes          || [];
    bookPages       = data.bookPages       || [];
    omerLetters     = data.letters         || [];
    microChallenges = data.microChallenges || [];
    groundingSteps  = data.groundingSteps  || [];
    podcastShows    = data.podcasts        || [];
    return true;
  } catch (e) {
    console.error('data.json failed to load:', e);
    const feed = document.getElementById('feed-container');
    if (feed) feed.innerHTML = '<div class="empty-state"><h3 class="empty-title">Content could not load</h3><p class="empty-desc">data.json is missing or the app is opened as a raw file. Serve the folder over HTTP (or GitHub Pages) and reload.</p></div>';
    return false;
  }
}

/* ==========================================================================
   2. HAPTIC SYMPHONY — distinct tactile profiles (Pillar 3)
   ========================================================================== */
const HAPTIC_PROFILES = {
  tick:   8,                                       // generic ui tick
  page:   20,                                      // light 20ms book page turn
  save:   [30, 70, 30],                            // double pulse — saving a quote
  heavy:  [15, 30, 15],
  wave:   35,
  stone:  12,                                      // continuous soft worry-stone pulse
  inhale: [20, 90, 30, 80, 40, 70, 50, 60, 60],    // rolling build ~3s inhale
  sharp:  [45, 45, 90],                            // quick second inhale
  exhale: [70, 60, 60, 70, 50, 80, 40, 90, 30, 100, 20] // long fading roll ~5s
};
function triggerHaptic(type) {
  const pattern = HAPTIC_PROFILES[type];
  if (pattern === undefined) return;
  if ('vibrate' in navigator) { navigator.vibrate(pattern); return; }
  if (IS_IOS) iosPlayPattern(pattern);
}

/* --- iOS HAPTIC BRIDGE ---------------------------------------------------
   iOS Safari has no navigator.vibrate. But since iOS 17.4, Safari fires a
   real Taptic Engine tick when an <input type="checkbox" switch> toggles.
   Two layers:
   (a) PROGRAMMATIC: a hidden switch we .click() to replay vibration
       patterns as timed tap sequences. Works on iOS 17.4 – 26.4.
       (Apple disabled programmatic clicks triggering the haptic in 26.5.)
   (b) DIRECT-TOUCH: invisible switch overlays injected inside real tap
       targets (stars, tabs, pills, drawers, page margins…). The finger
       physically toggles the switch, so the OS haptic still fires on
       iOS 26.5+. The event bubbles up, so the button works normally.
   ------------------------------------------------------------------------ */
const IS_IOS = /iPhone|iPod|iPad/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  || (/Mac/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

let iosHapticLabel = null, iosPatternTimers = [];

function setupIOSHapticBridge() {
  if (!IS_IOS || ('vibrate' in navigator)) return;
  // (a) hidden programmatic switch
  iosHapticLabel = document.createElement('label');
  iosHapticLabel.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);';
  iosHapticLabel.setAttribute('aria-hidden', 'true');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.tabIndex = -1;
  iosHapticLabel.appendChild(input);
  document.body.appendChild(iosHapticLabel);
  // (b) overlay switches inside tap targets — re-armed whenever the DOM
  // changes (feed re-renders, drawers, podcast lists…)
  armNativeHapticTargets();
  const mo = new MutationObserver(() => {
    if (mo._raf) return;
    mo._raf = requestAnimationFrame(() => { mo._raf = null; armNativeHapticTargets(); });
  });
  mo.observe(document.getElementById('app-wrapper'), { childList: true, subtree: true });
}

function iosTap() {
  if (!iosHapticLabel) return;
  try { iosHapticLabel.click(); } catch (e) { /* ignore */ }
}

// Convert a vibration pattern [on, off, on, …] into discrete Taptic ticks:
// one tick at the start of every ON segment, plus extra ticks every 110ms
// inside long ON segments to emulate "rolling" vibrations.
function iosPlayPattern(pattern) {
  iosPatternTimers.forEach(clearTimeout); iosPatternTimers = [];
  if (typeof pattern === 'number') pattern = [pattern];
  let t = 0;
  pattern.forEach((dur, i) => {
    if (i % 2 === 0) {
      for (let off = 0; off < dur; off += 110) {
        iosPatternTimers.push(setTimeout(iosTap, t + off));
      }
    }
    t += dur;
  });
}

const HAPTIC_TARGET_SELECTOR = '.tab-btn, .filter-pill, .drawer-trigger, .star-btn, .challenge-btn, .empty-cta, .tap-zone-left, .tap-zone-right, .vibe-btn, .ep-btn, .header-btn, .stealth-btn, .play-pause-btn, .player-skip-btn, .player-speed-btn, .letter-item, .podcast-show-header, .grounding-control button, .prayer-tab, .prayer-row, .author-toggle-btn, .author-pill, .stone-mode-btn, .stone-color-btn, .stone-clear-btn, .sky-loc-btn, .reader-back-btn, .book-tile';

function armNativeHapticTargets() {
  if (!IS_IOS) return;
  document.querySelectorAll(HAPTIC_TARGET_SELECTOR).forEach(el => {
    // skip if already armed or element is display:none
    if (el.dataset.hapticArmed) return;
    if (!el.offsetParent && el.style.display === 'none') return;
    const pos = getComputedStyle(el).position;
    if (pos === 'static') el.style.position = 'relative';
    // ensure no overflow:hidden clips the overlay
    if (getComputedStyle(el).overflow === 'hidden') el.style.overflow = 'visible';
    const sw = document.createElement('input');
    sw.type = 'checkbox';
    sw.setAttribute('switch', '');
    sw.className = 'ios-haptic-overlay';
    sw.setAttribute('aria-hidden', 'true');
    sw.tabIndex = -1;
    // prevent the toggle from stealing the event from the real button
    sw.addEventListener('click', e => e.stopPropagation(), { passive: false });
    el.appendChild(sw);
    el.dataset.hapticArmed = '1';
  });
}

/* ==========================================================================
   3. HIDDEN PROGRESSION ENGINE — XP, levels, streak, time (Pillar 2)
   All stored in localStorage only. Never displayed unless the user opens
   the "Your Journey" drawer. No pressure mechanics, no timers.
   ========================================================================== */
const STATS_KEY = 'haven_stats_v2';
const LEVEL_NAMES = ['Seedling', 'Wanderer', 'Pathfinder', 'Haven Keeper', 'Sage', 'Luminary'];
const XP_AWARDS = { save: 10, task: 25, breath: 5, letter: 5, page: 2, grounding: 15, stone: 3 };

let stats = loadStats();

function loadStats() {
  const defaults = { xp: 0, savedCount: 0, tasksDone: 0, breathCycles: 0, pagesTurned: 0, lettersOpened: 0, stoneSessions: 0, timeSeconds: 0, streak: 0, bestStreak: 0, lastActive: null };
  try { return Object.assign(defaults, JSON.parse(localStorage.getItem(STATS_KEY)) || {}); }
  catch (e) { return defaults; }
}
function persistStats() { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); }

function awardXP(type) {
  stats.xp += (XP_AWARDS[type] || 0);
  persistStats();
  if (document.getElementById('drawer-journey')?.classList.contains('expanded')) renderStats();
}

function levelFromXP(xp) { return Math.floor(Math.sqrt(xp / 60)) + 1; }
function xpForLevel(level) { return 60 * Math.pow(level - 1, 2); }

function updateStreak() {
  const today = new Date().toDateString();
  if (stats.lastActive === today) return;
  const yesterday = new Date(Date.now() - 864e5).toDateString();
  stats.streak = (stats.lastActive === yesterday) ? stats.streak + 1 : 1;
  stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
  stats.lastActive = today;
  persistStats();
}

// Quietly accumulate "time spent in Haven" while the app is visible
function startTimeTracking() {
  setInterval(() => {
    if (document.visibilityState === 'visible') {
      stats.timeSeconds += 15;
      persistStats();
    }
  }, 15000);
}

function formatDuration(secs) {
  if (secs < 3600) return Math.floor(secs / 60) + 'm';
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  return h + 'h ' + m + 'm';
}

function renderStats() {
  const lvl = levelFromXP(stats.xp);
  const curBase = xpForLevel(lvl), nextNeed = xpForLevel(lvl + 1);
  const pct = Math.min(100, Math.round(((stats.xp - curBase) / (nextNeed - curBase)) * 100));
  const name = LEVEL_NAMES[Math.min(lvl - 1, LEVEL_NAMES.length - 1)] + (lvl > LEVEL_NAMES.length ? ' ' + (lvl - LEVEL_NAMES.length + 1) : '');
  document.getElementById('stat-time').innerText = formatDuration(stats.timeSeconds);
  document.getElementById('stat-saved').innerText = stats.savedCount;
  document.getElementById('stat-streak').innerText = stats.streak;
  document.getElementById('stat-breaths').innerText = stats.breathCycles;
  document.getElementById('level-badge').innerText = lvl;
  document.getElementById('level-name').innerText = name;
  document.getElementById('level-bar').style.width = pct + '%';
  document.getElementById('level-sub').innerText = pct + '% toward the next bloom · ' + stats.tasksDone + ' micro-tasks · best streak ' + stats.bestStreak + ' days';
}

/* ==========================================================================
   4. DYNAMIC TIME-OF-DAY THEME (Pillar 1)
   Palettes themselves live in style.css under body[data-daypart="…"]
   ========================================================================== */
function applyDaypartTheme() {
  const h = new Date().getHours();
  let part = 'day';
  if (h >= 5 && h < 11) part = 'morning';
  else if (h >= 17 && h < 22) part = 'evening';
  else if (h >= 22 || h < 5) part = 'night';
  document.body.dataset.daypart = part;
}

/* ==========================================================================
   5. CINEMATIC SPLASH — fade + local swoosh audio (Pillar 1)
   ========================================================================== */
function runSplashSequence() {
  const splash = document.getElementById('splash-screen');
  const audio = document.getElementById('splash-audio');
  if (audio) {
    audio.volume = 0.55;
    audio.play().catch(() => {
      // Autoplay blocked — play on the user's very first touch instead
      const unlock = () => {
        if (!splash.classList.contains('hidden')) audio.play().catch(() => {});
        document.removeEventListener('pointerdown', unlock);
      };
      document.addEventListener('pointerdown', unlock, { once: true });
    });
  }
  setTimeout(() => splash.classList.add('hidden'), 2400);
}

/* ==========================================================================
   6. CORE STATE & HELPERS
   ========================================================================== */
let savedIds = JSON.parse(localStorage.getItem('texttube_saved_ids')) || [];
let currentTab = 'stream'; let activeFilter = 'all'; let activeAuthor = null; let observer; let activeIndex = 0;
let activeStreamCards = []; let pacerIntervalId = null;
let isShieldPlaying = false; let ambientAutoStarted = false;
let activeVibe = null; let groundingIndex = 0;
let isAmbientActive = false; let canvas, ctx; let animationFrameId = null; let stars = []; let ambientPacerVal = 0; let ambientPacerDirection = 1;
let currentBookPageIndex = 0; let touchStartX = 0; let touchEndX = 0;

function saveToStorage() { localStorage.setItem('texttube_saved_ids', JSON.stringify(savedIds)); }
function shuffleArray(array) { const arr = [...array]; for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

let toastTimeout;
function showToast(text) { const toast = document.getElementById('toast'); const toastText = document.getElementById('toast-text'); toastText.innerText = text; toast.classList.add('show'); clearTimeout(toastTimeout); toastTimeout = setTimeout(() => { toast.classList.remove('show'); }, 1800); }
function getCategoryStyleClass(cat) { if (cat === "Inner Sanctuary") return "card-sanctuary"; if (cat === "Neuro-Sync") return "card-neuro"; if (cat === "Dry Satire") return "card-satire"; return ""; }
function getStarOutlineSVG() { return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`; }
function getStarFilledSVG() { return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`; }

function createEmptyState() {
  const empty = document.createElement('div'); empty.className = 'empty-state';
  empty.innerHTML = `<svg class="empty-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg><h3 class="empty-title">Stream is empty</h3><p class="empty-desc">Check your filters to discover more quotes.</p><button class="empty-cta" onclick="resetToStreamFeed()">Explore Stream</button>`;
  return empty;
}

/* ==========================================================================
   7. FEED RENDERING + IMMERSIVE VIDEO BACKGROUNDS (Pillar 1)
   Videos are lazy: src attaches only when a card nears the viewport, and
   playback pauses the moment a card scrolls away (battery friendly).
   ========================================================================== */
const CATEGORY_VIDEOS = {
  'card-sanctuary': './video/sanctuary-bg.mp4',
  'card-neuro':     './video/neuro-bg.mp4',
  'card-satire':    './video/satire-bg.mp4'
};

function renderFeed(appendMore = false) {
  const container = document.getElementById('feed-container');
  if (!appendMore) { killPacerEngine(); container.innerHTML = ''; activeStreamCards = []; }
  let pool = baseCards.filter(item => {
    if (activeAuthor && item.author !== activeAuthor) return false;
    if (activeVibe) {
      if (activeVibe === 'overwhelmed') return item.category === 'Inner Sanctuary' || item.category === 'Neuro-Sync';
      if (activeVibe === 'restless') return item.category === 'Neuro-Sync' || item.isPacer;
      if (activeVibe === 'weary') return item.category === 'Inner Sanctuary';
      if (activeVibe === 'frustrated') return item.category === 'Dry Satire';
    }
    if (activeFilter === 'all') return true;
    if (activeFilter === 'sanctuary') return item.category === 'Inner Sanctuary';
    if (activeFilter === 'neuro') return item.category === 'Neuro-Sync' || item.isPacer;
    if (activeFilter === 'satire') return item.category === 'Dry Satire';
    return true;
  });
  let newItems = [];
  if (pool.length > 0) {
    const hasPacer = pool.find(item => item.isPacer);
    let standardPool = pool.filter(item => !item.isPacer);
    let shuffled = shuffleArray(standardPool);
    if (hasPacer && !appendMore && activeFilter === 'all') shuffled.splice(1, 0, hasPacer);
    newItems = shuffled;
  }
  if (!appendMore && newItems.length === 0) { container.appendChild(createEmptyState()); return; }
  const startingIndex = activeStreamCards.length;
  activeStreamCards = activeStreamCards.concat(newItems);
  newItems.forEach((item, index) => {
    const absoluteIndex = startingIndex + index;
    const isSaved = savedIds.includes(item.id);
    const cardElement = createCardElement(item, absoluteIndex, isSaved);
    container.appendChild(cardElement);
  });
  setupIntersectionObserver();
}

function buildVideoLayer(styleClass) {
  const src = CATEGORY_VIDEOS[styleClass];
  if (!src) return '';
  return `<video class="card-bg-video" data-src="${src}" loop muted playsinline preload="none" disablepictureinpicture></video><div class="card-vignette"></div>`;
}

function createCardElement(item, absoluteIndex, isSaved) {
  const styleClass = getCategoryStyleClass(item.category);
  const card = document.createElement('div'); card.className = `card ${styleClass}`; card.dataset.id = item.id; card.dataset.index = absoluteIndex;
  if (item.isPacer) {
    card.className = "card card-neuro pacer-card-root";
    card.innerHTML = `${buildVideoLayer('card-neuro')}<div class="card-glow"></div><div class="card-header"><div class="track-meta"><span class="track-num">BIO-PACER RESET</span><span class="track-origin">${item.author}</span></div><div class="card-badge">≈ Huberman Pacer</div></div><div class="card-body"><p class="quote-text" style="font-size:0.95rem; line-height:1.5; color:var(--text-muted); margin-bottom:1rem; text-align:center;">${item.text}</p><div class="pacer-container"><div class="pacer-view-box" id="pacer-box-target"><div class="pacer-aura-element" id="pacer-aura"></div><div class="pacer-circle-element" id="pacer-circle"></div></div><div class="pacer-instruction-label" id="pacer-label">Tap target circle to begin</div></div></div><div class="card-footer"><div class="curator-credits"><span class="credits-icon">♥</span><span>Tactile Resync Engine</span></div><div class="meta-metrics"><div class="metric-item"><span>BIOLOGICAL HACK</span></div></div><div class="action-btn-container"><button class="star-btn ${isSaved ? 'saved' : ''}" onclick="toggleSaveCard(event, ${item.id})">${isSaved ? getStarFilledSVG() : getStarOutlineSVG()}</button></div></div>`;
    setTimeout(() => { const target = card.querySelector('#pacer-box-target'); if (target) target.addEventListener('click', toggleBreathingEngine); }, 50);
    attachGlowTracking(card);
    return card;
  }
  const wordCount = item.text.split(' ').length; const readTime = Math.max(1, Math.round(wordCount / 180 * 10) / 10);
  card.innerHTML = `${buildVideoLayer(styleClass)}<div class="card-glow"></div><div class="card-header"><div class="track-meta"><span class="track-num">TRACK #${String(item.id).padStart(2, '0')}</span><span class="track-origin">${item.author}</span></div><div class="card-badge"><span>${item.icon}</span><span>${item.category}</span></div></div><div class="card-body"><div class="quote-mark">“</div><p class="quote-text">${item.text}</p><p class="quote-author">${item.author}</p></div><div class="card-footer"><div class="curator-credits"><span class="credits-icon">♥</span><span>Curated for Danna</span></div><div class="meta-metrics"><div class="metric-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg><span>${readTime}m read</span></div><div class="metric-item"><span>OFFLINE</span></div></div><div class="action-btn-container"><button class="star-btn ${isSaved ? 'saved' : ''}" onclick="toggleSaveCard(event, ${item.id})">${isSaved ? getStarFilledSVG() : getStarOutlineSVG()}</button></div></div>`;
  if (absoluteIndex === 0) { const swipe = document.createElement('div'); swipe.className = 'swipe-indicator'; swipe.innerText = 'Swipe Up ▽'; card.appendChild(swipe); }
  attachGlowTracking(card);
  return card;
}

/* --- MAGNETIC GLOW: .card-glow follows finger / mouse (Pillar 1) --- */
function attachGlowTracking(card) {
  const move = (clientX, clientY) => {
    const rect = card.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    card.style.setProperty('--glow-x', x.toFixed(1) + '%');
    card.style.setProperty('--glow-y', y.toFixed(1) + '%');
    card.classList.add('glow-engaged');
  };
  card.addEventListener('mousemove', e => move(e.clientX, e.clientY), { passive: true });
  card.addEventListener('touchmove', e => { const t = e.touches[0]; if (t) move(t.clientX, t.clientY); }, { passive: true });
  const release = () => { card.classList.remove('glow-engaged'); card.style.removeProperty('--glow-x'); card.style.removeProperty('--glow-y'); };
  card.addEventListener('mouseleave', release);
  card.addEventListener('touchend', release);
}

/* --- SUBTLE PARALLAX: text and video drift at different speeds on scroll --- */
function setupParallax() {
  const feed = document.getElementById('feed-container');
  let rafPending = false;
  feed.addEventListener('scroll', () => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      const vh = feed.clientHeight;
      feed.querySelectorAll('.card').forEach(card => {
        const top = card.getBoundingClientRect().top - feed.getBoundingClientRect().top;
        if (top < -vh || top > vh) return; // offscreen
        const ratio = top / vh; // -1..1
        const body = card.querySelector('.card-body');
        const video = card.querySelector('.card-bg-video');
        if (body) body.style.transform = `translateY(${(ratio * -22).toFixed(1)}px)`;
        if (video) video.style.transform = `translateY(${(ratio * 14).toFixed(1)}px) scale(1.05)`;
      });
    });
  }, { passive: true });
}

/* ==========================================================================
   8. HAVEN BOOKSHELF — multi-book 3D reader with saved progress
   Books live in /books/: mybook.txt + mybook.png (same filename) plus an
   entry in books/books.json. Plain-text books are sanitized and paginated
   automatically; progress per book is stored in localStorage.
   ========================================================================== */
let booksCatalog = [];
let currentBook = null;
let currentBookPages = [];
const READING_KEY = 'haven_reading_v1';
const bookTextCache = {};

function readingState() { try { return JSON.parse(localStorage.getItem(READING_KEY)) || { lastBookId: null, books: {} }; } catch (e) { return { lastBookId: null, books: {} }; } }
function saveReadingState(s) { localStorage.setItem(READING_KEY, JSON.stringify(s)); }
function rememberProgress() {
  if (!currentBook) return;
  const s = readingState();
  s.lastBookId = currentBook.id;
  s.books[currentBook.id] = { page: currentBookPageIndex, total: currentBookPages.length, ts: Date.now() };
  saveReadingState(s);
}

async function loadBooksCatalog() {
  try {
    const res = await fetch('./books/books.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    booksCatalog = (await res.json()).books || [];
  } catch (e) {
    console.error('books.json failed to load:', e);
    booksCatalog = [{ id: 'lawful-prohibited', title: 'The Lawful and the Prohibited in Islam', author: 'Sh. Yusuf Qardawi', type: 'builtin', txt: '', cover: '' }];
  }
}

function escapeHTML(str) { return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

/* ==========================================================================
   QURAN PAGINATOR — handles surah|verse|text pipe-delimited format
   ========================================================================== */
const SURAH_NAMES = [
  '',
  'Al-Fatihah','Al-Baqarah','Ali\'Imran','An-Nisa\'','Al-Ma\'idah',
  'Al-An\'am','Al-A\'raf','Al-Anfal','At-Tawbah','Yunus',
  'Hud','Yusuf','Ar-Ra\'d','Ibrahim','Al-Hijr',
  'An-Nahl','Al-Isra\'','Al-Kahf','Maryam','Ta-Ha',
  'Al-Anbiya\'','Al-Hajj','Al-Mu\'minun','An-Nur','Al-Furqan',
  'Ash-Shu\'ara\'','An-Naml','Al-Qasas','Al-\'Ankabut','Ar-Rum',
  'Luqman','As-Sajdah','Al-Ahzab','Saba\'','Fatir',
  'Ya-Sin','As-Saffat','Sad','Az-Zumar','Ghafir',
  'Fussilat','Ash-Shura','Az-Zukhruf','Ad-Dukhan','Al-Jathiyah',
  'Al-Ahqaf','Muhammad','Al-Fath','Al-Hujurat','Qaf',
  'Adh-Dhariyat','At-Tur','An-Najm','Al-Qamar','Ar-Rahman',
  'Al-Waqi\'ah','Al-Hadid','Al-Mujadila','Al-Hashr','Al-Mumtahanah',
  'As-Saf','Al-Jumu\'ah','Al-Munafiqun','At-Taghabun','At-Talaq',
  'At-Tahrim','Al-Mulk','Al-Qalam','Al-Haqqah','Al-Ma\'arij',
  'Nuh','Al-Jinn','Al-Muzzammil','Al-Muddaththir','Al-Qiyamah',
  'Al-Insan','Al-Mursalat','An-Naba\'','An-Nazi\'at','\'Abasa',
  'At-Takwir','Al-Infitar','Al-Mutaffifin','Al-Inshiqaq','Al-Buruj',
  'At-Tariq','Al-A\'la','Al-Ghashiyah','Al-Fajr','Al-Balad',
  'Ash-Shams','Al-Layl','Ad-Duha','Ash-Sharh','At-Tin',
  'Al-\'Alaq','Al-Qadr','Al-Bayyinah','Az-Zalzalah','Al-\'Adiyat',
  'Al-Qari\'ah','At-Takathur','Al-\'Asr','Al-Humazah','Al-Fil',
  'Quraysh','Al-Ma\'un','Al-Kawthar','Al-Kafirun','An-Nasr',
  'Al-Masad','Al-Ikhlas','Al-Falaq','An-Nas'
];

function paginateQuranText(raw, book) {
  var surahs = {};
  raw.trim().split('\n').forEach(function(line) {
    var parts = line.split('|');
    if (parts.length < 3) return;
    var s = parts[0].trim(), v = parts[1].trim(), t = parts.slice(2).join('|').trim();
    if (!surahs[s]) surahs[s] = [];
    surahs[s].push({ v: v, t: t });
  });

  var PAGE_BUDGET = 620;
  var pages = [];

  Object.keys(surahs).sort(function(a,b){ return parseInt(a)-parseInt(b); }).forEach(function(sNum) {
    var verses = surahs[sNum];
    var name = SURAH_NAMES[parseInt(sNum)] || ('Surah ' + sNum);
    var buf = '', size = 0;

    var flush = function() {
      if (buf) { pages.push('<div class="txt-page">' + buf + '</div>'); buf = ''; size = 0; }
    };

    // Surah header always starts fresh
    flush();
    buf += '<div class="quran-surah-head"><span class="quran-surah-num">Surah ' + sNum + '</span><h3 class="quran-surah-title">' + escapeHTML(name) + '</h3>';
    if (sNum !== '9') {
      buf += '<p class="quran-bismillah">بِسْمِ اللهِ الرَّحْمٰنِ الرَّحِيْمِ</p>';
      buf += '<p class="quran-bismillah-en">In the name of Allah, the Most Gracious, the Most Merciful</p>';
    }
    buf += '</div>';
    size = 80;

    verses.forEach(function(vObj) {
      var html = '<p class="quran-verse"><span class="quran-vnum">' + sNum + ':' + vObj.v + '</span> ' + escapeHTML(vObj.t) + '</p>';
      if (size > 0 && size + vObj.t.length > PAGE_BUDGET) flush();
      buf += html; size += vObj.t.length;
    });
    flush();
  });

  var coverPage = '<div style="text-align:center; margin-top:2rem; padding:1rem;">'
    + '<div style="font-size:0.72rem; color:var(--accent-gold); letter-spacing:0.2em; text-transform:uppercase; margin-bottom:1.5rem;">Oasis Library</div>'
    + '<h2 style="font-family:var(--font-serif); font-size:1.9rem; line-height:1.35; margin-bottom:0.5rem; color:#FFF;">The Qur\'an</h2>'
    + '<p style="font-size:0.8rem; color:var(--accent-gold); letter-spacing:0.08em; margin-bottom:0.5rem;">القرآن الكريم</p>'
    + '<div style="width:40px; height:1px; background:var(--accent-gold); margin:1.5rem auto;"></div>'
    + '<p style="font-size:0.82rem; color:var(--text-muted); font-style:italic; margin-bottom:0.25rem;">English Meanings and Notes by</p>'
    + '<p style="font-weight:700; color:var(--text-primary); letter-spacing:0.05em;">SAHEEH INTERNATIONAL</p>'
    + '<p style="font-size:0.7rem; color:var(--text-muted); margin-top:1.5rem;">114 Surahs · 6236 Verses</p>'
    + '<div style="margin-top:3rem; font-size:0.72rem; color:var(--text-muted); animation: heartbeat 2s infinite;">Tap the right margin to start reading →</div>'
    + '</div>';
  pages.unshift(coverPage);
  return pages;
}

/* Convert a raw .txt into sanitized, phone-comfortable pages */
function paginateText(raw, book) {
  let text = raw.replace(/\r\n/g, '\n');
  const endMark = text.search(/\*\*\*\s*END OF THE PROJECT GUTENBERG/i);
  if (endMark > -1) text = text.slice(0, endMark);
  const startMatch = text.match(/\*\*\*\s*START OF THE PROJECT GUTENBERG[^\n]*\n/i);
  if (startMatch) text = text.slice(startMatch.index + startMatch[0].length);
  const paragraphs = text.split(/\n\s*\n/).map(p => p.replace(/\s*\n\s*/g, ' ').trim()).filter(p => p.length);

  const PAGE_BUDGET = 850; // chars per page — comfortable, not tiny
  const pages = [];
  let buf = '', size = 0;
  const flush = () => { if (buf) { pages.push('<div class="txt-page">' + buf + '</div>'); buf = ''; size = 0; } };

  paragraphs.forEach(p => {
    const isHeading = /^(CHAPTER|EPILOGUE|ETYMOLOGY|EXTRACTS|CONTENTS|PROLOGUE|THE END)/i.test(p) && p.length < 90;
    const chunks = [];
    if (p.length > 1300) {
      let rest = p;
      while (rest.length > 1300) {
        let cut = rest.lastIndexOf('. ', 1200);
        if (cut < 400) cut = 1200;
        chunks.push(rest.slice(0, cut + 1).trim());
        rest = rest.slice(cut + 1).trim();
      }
      if (rest) chunks.push(rest);
    } else { chunks.push(p); }

    chunks.forEach(chunk => {
      const html = isHeading
        ? '<h3 class="txt-heading">' + escapeHTML(chunk) + '</h3>'
        : '<p class="txt-para">' + escapeHTML(chunk) + '</p>';
      if (size > 0 && (size + chunk.length > PAGE_BUDGET || (isHeading && size > PAGE_BUDGET * 0.4))) flush();
      buf += html; size += chunk.length;
    });
  });
  flush();
  const coverPage = '<div style="text-align:center; margin-top:2rem; padding:1rem;"><div style="font-size:0.72rem; color:var(--accent-gold); letter-spacing:0.2em; text-transform:uppercase; margin-bottom:1.5rem;">Oasis Library</div><h2 style="font-family:var(--font-serif); font-size:1.7rem; line-height:1.35; margin-bottom:1rem; color:#FFF;">' + escapeHTML(book.title) + '</h2><div style="width:40px; height:1px; background:var(--accent-gold); margin:1.5rem auto;"></div><p style="font-size:0.82rem; color:var(--text-muted); font-style:italic; margin-bottom:0.25rem;">by</p><p style="font-weight:700; color:var(--text-primary); letter-spacing:0.05em;">' + escapeHTML((book.author || 'Unknown').toUpperCase()) + '</p><div style="margin-top:4.5rem; font-size:0.72rem; color:var(--text-muted); animation: heartbeat 2s infinite;">Tap the right margin to start reading →</div></div>';
  pages.unshift(coverPage);
  return pages;
}

function renderBookshelf() {
  const grid = document.getElementById('bookshelf-grid');
  const slot = document.getElementById('continue-reading-slot');
  if (!grid) return;
  grid.innerHTML = ''; slot.innerHTML = '';
  const s = readingState();
  const last = s.lastBookId ? booksCatalog.find(b => b.id === s.lastBookId) : null;
  const lastProg = last ? s.books[last.id] : null;
  if (last && lastProg && lastProg.page > 0) {
    slot.innerHTML = '<div class="continue-card" onclick="openBook(\'' + last.id + '\')">'
      + '<div class="continue-thumb">' + (last.cover ? '<img src="' + last.cover + '" alt="" onerror="this.remove()">' : '📖') + '</div>'
      + '<div class="continue-info"><div class="continue-label">Continue where you left off</div>'
      + '<div class="continue-title">' + escapeHTML(last.title) + '</div>'
      + '<div class="continue-progress">Page ' + (lastProg.page + 1) + ' of ' + lastProg.total + '</div></div>'
      + '<div class="continue-resume">Resume ›</div></div>';
  }
  booksCatalog.forEach(book => {
    const prog = s.books[book.id];
    const tile = document.createElement('div');
    tile.className = 'book-tile';
    tile.onclick = () => openBook(book.id);
    tile.innerHTML = '<div class="book-tile-cover">'
      + (book.cover ? '<img src="' + book.cover + '" alt="" loading="lazy" onerror="this.parentElement.classList.add(\'cover-fallback\'); this.remove();">' : '')
      + '<span class="cover-fallback-title">' + escapeHTML(book.title) + '</span>'
      + (prog && prog.total ? '<div class="book-tile-bar"><div style="width:' + Math.round(((prog.page + 1) / prog.total) * 100) + '%"></div></div>' : '')
      + '</div><div class="book-tile-title">' + escapeHTML(book.title) + '</div>'
      + '<div class="book-tile-author">' + escapeHTML(book.author || '') + '</div>';
    if (!book.cover) tile.querySelector('.book-tile-cover').classList.add('cover-fallback');
    grid.appendChild(tile);
  });
}

async function openBook(id) {
  const book = booksCatalog.find(b => b.id === id);
  if (!book) return;
  triggerHaptic('heavy');
  if (!bookTextCache[id]) {
    if (book.type === 'builtin') {
      bookTextCache[id] = bookPages.map(p => p.content);
    } else {
      try {
        const res = await fetch(book.txt);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const raw = await res.text();
        bookTextCache[id] = book.type === 'quran' ? paginateQuranText(raw, book) : paginateText(raw, book);
      } catch (e) { showToast('Book could not load'); return; }
    }
  }
  currentBook = book;
  currentBookPages = bookTextCache[id];
  const saved = readingState().books[id];
  currentBookPageIndex = (saved && saved.page < currentBookPages.length) ? saved.page : 0;
  document.getElementById('reader-book-title').innerText = book.title;
  document.getElementById('reader-book-author').innerText = book.author || '';
  document.getElementById('book-author-tag').innerText = (book.author || 'Haven Library').toUpperCase();
  document.getElementById('bookshelf-view').style.display = 'none';
  document.getElementById('book-reader-view').style.display = 'flex';
  renderBook();
  rememberProgress();
}

function closeReader() {
  rememberProgress();
  currentBook = null;
  document.getElementById('book-reader-view').style.display = 'none';
  document.getElementById('bookshelf-view').style.display = 'flex';
  renderBookshelf();
  triggerHaptic('tick');
}

function showBooksTab() {
  if (currentBook) {
    document.getElementById('bookshelf-view').style.display = 'none';
    document.getElementById('book-reader-view').style.display = 'flex';
    renderBook();
  } else {
    document.getElementById('book-reader-view').style.display = 'none';
    document.getElementById('bookshelf-view').style.display = 'flex';
    loadBooksCatalog().then(renderBookshelf);
  }
}

/* Windowed render: only prev/active/next pages live in the DOM, so even a
   1,400-page novel stays featherlight while keeping the 3D page-turn look. */
function renderBook() {
  const container = document.getElementById('book-page-slider');
  if (!container || currentBookPages.length === 0) return;
  container.innerHTML = '';
  for (let i = Math.max(0, currentBookPageIndex - 1); i <= Math.min(currentBookPages.length - 1, currentBookPageIndex + 1); i++) {
    const pageDiv = document.createElement('div');
    pageDiv.className = 'book-page ' + (i < currentBookPageIndex ? 'page-prev' : i === currentBookPageIndex ? 'page-active' : 'page-next');
    pageDiv.innerHTML = currentBookPages[i];
    container.appendChild(pageDiv);
  }
  document.getElementById('book-progress-text').innerText = 'Page ' + (currentBookPageIndex + 1) + ' of ' + currentBookPages.length;
}

function turnPage(direction) {
  if (!currentBook) return;
  const container = document.getElementById('book-page-slider');
  if (direction === 'next') {
    if (currentBookPageIndex >= currentBookPages.length - 1) { showToast("End of book reached"); return; }
    const active = container.querySelector('.page-active');
    const next = container.querySelector('.page-next');
    currentBookPageIndex++;
    if (active) { active.classList.remove('page-active'); active.classList.add('page-prev'); }
    if (next) { next.classList.remove('page-next'); next.classList.add('page-active'); }
    triggerHaptic('page'); stats.pagesTurned++; awardXP('page');
  } else if (direction === 'prev') {
    if (currentBookPageIndex <= 0) return;
    const active = container.querySelector('.page-active');
    const prev = container.querySelector('.page-prev');
    currentBookPageIndex--;
    if (active) { active.classList.remove('page-active'); active.classList.add('page-next'); }
    if (prev) { prev.classList.remove('page-prev'); prev.classList.add('page-active'); }
    triggerHaptic('page');
  }
  document.getElementById('book-progress-text').innerText = 'Page ' + (currentBookPageIndex + 1) + ' of ' + currentBookPages.length;
  rememberProgress();
  clearTimeout(turnPage._t);
  turnPage._t = setTimeout(renderBook, 750); // rebuild 3-page window after the flip completes
}

function handleTouchStart(e) { touchStartX = e.changedTouches[0].screenX; }
function handleTouchEnd(e) { touchEndX = e.changedTouches[0].screenX; if (touchEndX < touchStartX - 50) turnPage('next'); if (touchEndX > touchStartX + 50) turnPage('prev'); }

/* ==========================================================================
   9. SAVED QUOTES / OASIS MODULES
   ========================================================================== */
function renderSavedQuotesList() {
  const container = document.getElementById('saved-quotes-container'); container.innerHTML = '';
  const savedItems = baseCards.filter(item => savedIds.includes(item.id));
  if (savedItems.length === 0) { container.innerHTML = `<div style="text-align:center; padding:1.5rem; border:1px dashed rgba(255,255,255,0.05); border-radius:8px; color:var(--text-muted); font-size:0.75rem;">No starred items yet. Tap the star icon (★) at the bottom right of any card in your Quotes tab!</div>`; return; }
  savedItems.forEach(item => {
    const itemCard = document.createElement('div'); itemCard.className = 'saved-quote-card';
    const cardStyle = getCategoryStyleClass(item.category); let borderAccent = 'var(--accent-gold)';
    if (cardStyle === 'card-neuro') borderAccent = 'var(--accent-sage)'; if (cardStyle === 'card-satire') borderAccent = 'var(--accent-silver)';
    itemCard.style.borderLeft = `3px solid ${borderAccent}`;
    itemCard.innerHTML = `<p style="font-size: 0.82rem; line-height: 1.5; font-style: ${cardStyle === 'card-satire' ? 'italic' : 'normal'}; font-family: ${cardStyle === 'card-sanctuary' ? 'var(--font-serif)' : 'var(--font-sans)'}; color: var(--text-primary);">"${item.text}"</p><div style="display: flex; justify-content: space-between; align-items: center; margin-top:0.25rem;"><span style="font-size: 0.72rem; color: ${borderAccent}; font-weight: 700; letter-spacing:0.02em;">- ${item.author}</span><button class="star-btn saved" onclick="toggleSaveCard(event, ${item.id})" style="padding: 0.25rem;">${getStarFilledSVG()}</button></div>`;
    container.appendChild(itemCard);
  });
}

function toggleSaveCard(event, id) {
  event.stopPropagation(); const index = savedIds.indexOf(id); let actionMsg = "";
  if (index === -1) {
    savedIds.push(id); actionMsg = "Saved to Oasis favorites";
    triggerHaptic('save');                       // double pulse profile
    stats.savedCount++; awardXP('save');          // hidden XP
  } else {
    savedIds.splice(index, 1); actionMsg = "Removed from favorites"; triggerHaptic('tick');
    stats.savedCount = Math.max(0, stats.savedCount - 1); persistStats();
  }
  saveToStorage(); showToast(actionMsg);
  document.querySelectorAll(`.card[data-id="${id}"] .star-btn`).forEach(btn => { if (savedIds.includes(id)) { btn.classList.add('saved'); btn.innerHTML = getStarFilledSVG(); } else { btn.classList.remove('saved'); btn.innerHTML = getStarOutlineSVG(); } });
  if (currentTab === 'oasis') renderSavedQuotesList();
}

function switchTab(tab) {
  if (currentTab === tab) return; currentTab = tab; triggerHaptic('tick');
  document.getElementById('tab-stream').classList.toggle('active', tab === 'stream');
  document.getElementById('tab-books').classList.toggle('active', tab === 'books');
  document.getElementById('tab-oasis').classList.toggle('active', tab === 'oasis');
  const topBar = document.getElementById('top-bar'); const feedContainer = document.getElementById('feed-container');
  const oasisView = document.getElementById('oasis-view'); const booksView = document.getElementById('books-view');
  if (tab === 'oasis') { topBar.style.display = 'none'; feedContainer.style.display = 'none'; booksView.style.display = 'none'; oasisView.style.display = 'flex'; setupDailyChallenge(); renderSavedQuotesList(); renderLetters(); renderPodcasts(); renderStats(); }
  else if (tab === 'books') { topBar.style.display = 'none'; feedContainer.style.display = 'none'; oasisView.style.display = 'none'; booksView.style.display = 'flex'; showBooksTab(); }
  else { topBar.style.display = 'flex'; document.getElementById('filter-container').style.display = 'flex'; feedContainer.style.display = 'block'; oasisView.style.display = 'none'; booksView.style.display = 'none'; renderFeed(); }
}

function setFilter(filter) {
  if (activeFilter === filter) return; activeFilter = filter; triggerHaptic('tick');
  if (activeVibe) { activeVibe = null; document.querySelectorAll('.vibe-btn').forEach(btn => btn.classList.remove('active')); }
  document.querySelectorAll('.filter-pill').forEach(pill => { pill.classList.toggle('active', pill.getAttribute('data-filter') === filter); });
  renderFeed();
}

function resetToStreamFeed() { activeFilter = 'all'; document.querySelectorAll('.filter-pill').forEach(p => p.classList.toggle('active', p.getAttribute('data-filter') === 'all')); switchTab('stream'); }

/* ---------- Author search / filter ---------- */
function toggleAuthorPanel() {
  const panel = document.getElementById('author-panel');
  const isOpen = panel.classList.toggle('author-panel--open');
  if (isOpen) { renderAuthorList(document.getElementById('author-search').value || ''); }
}

function renderAuthorList(query) {
  const q = query.toLowerCase();
  const authors = [...new Set(
    baseCards.filter(function(c) { return !c.isPacer && c.author; }).map(function(c) { return c.author; })
  )].sort();
  const filtered = q ? authors.filter(function(a) { return a.toLowerCase().includes(q); }) : authors;
  document.getElementById('author-list').innerHTML = filtered.map(function(a) {
    return '<button class="author-pill' + (a === activeAuthor ? ' author-pill--active' : '') +
           '" onclick="setAuthorFilter(\'' + a.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + '\')">' + a + '</button>';
  }).join('');
}

function setAuthorFilter(author) {
  activeAuthor = (activeAuthor === author) ? null : author;
  document.getElementById('author-panel').classList.remove('author-panel--open');
  _updateAuthorBadge();
  renderFeed();
}

function clearAuthorFilter() {
  activeAuthor = null;
  _updateAuthorBadge();
  renderFeed();
}

function _updateAuthorBadge() {
  const row = document.getElementById('author-badge-row');
  const btn = document.getElementById('author-toggle-btn');
  if (!row) return;
  if (activeAuthor) {
    row.style.display = 'flex';
    row.querySelector('.author-badge-name').textContent = activeAuthor;
    if (btn) btn.classList.add('author-toggle-btn--active');
  } else {
    row.style.display = 'none';
    if (btn) btn.classList.remove('author-toggle-btn--active');
  }
}

function scrollToPacerCard() { if (currentTab !== 'stream') switchTab('stream'); setFilter('all'); setTimeout(() => { const pacerCard = document.querySelector('.pacer-card-root'); if (pacerCard) pacerCard.scrollIntoView({ behavior: 'smooth' }); }, 150); }

/* ==========================================================================
   10. SOUND SHIELD — local forest-rain ambience (audio/haven-ambient.mp3)
   Replaces the old procedural rain generator. One reusable <audio> element,
   looped, routed through a Web Audio gain node for premium fade in/out
   (plain playback fallback). Starts only on user tap — iOS autoplay safe.
   ========================================================================== */
let shieldAudio = null, shieldCtx = null, shieldGain = null;

function initShieldAudio() {
  if (shieldAudio) return;
  shieldAudio = new Audio('./audio/haven-ambient.mp3');
  shieldAudio.loop = true;
  shieldAudio.preload = 'auto';
  try {
    shieldCtx = new (window.AudioContext || window.webkitAudioContext)();
    const srcNode = shieldCtx.createMediaElementSource(shieldAudio);
    shieldGain = shieldCtx.createGain();
    srcNode.connect(shieldGain); shieldGain.connect(shieldCtx.destination);
  } catch (e) { shieldCtx = null; shieldGain = null; }
}

function shieldFade(target, seconds) {
  if (!shieldGain || !shieldCtx) return;
  const now = shieldCtx.currentTime;
  shieldGain.gain.cancelScheduledValues(now);
  shieldGain.gain.setValueAtTime(shieldGain.gain.value, now);
  shieldGain.gain.linearRampToValueAtTime(target, now + seconds);
}

async function startSoundShield(quiet) {
  initShieldAudio();
  try {
    if (shieldCtx && shieldCtx.state === 'suspended') await shieldCtx.resume();
    if (shieldGain) shieldGain.gain.value = 0;
    await shieldAudio.play();
  } catch (e) { showToast('Tap the Sound Shield button to start audio'); return false; }
  shieldFade(1, 1.5);
  isShieldPlaying = true;
  const shieldBtn = document.getElementById('sound-shield-btn'); const shieldBtnText = document.getElementById('sound-btn-text');
  if (shieldBtn) { shieldBtn.classList.add('active-shield'); shieldBtnText.innerText = 'Shield Active'; }
  if (!quiet) { showToast('Sound Shield activated (Forest Rain)'); triggerHaptic('heavy'); }
  return true;
}

function stopSoundShield(quiet) {
  if (!shieldAudio) return;
  isShieldPlaying = false;
  if (shieldGain) {
    shieldFade(0, 1.2);
    setTimeout(() => { if (!isShieldPlaying && shieldAudio) shieldAudio.pause(); }, 1250);
  } else {
    shieldAudio.pause();
  }
  const shieldBtn = document.getElementById('sound-shield-btn'); const shieldBtnText = document.getElementById('sound-btn-text');
  if (shieldBtn) { shieldBtn.classList.remove('active-shield'); shieldBtnText.innerText = 'Sound Shield'; }
  if (!quiet) { showToast('Sound Shield deactivated'); triggerHaptic('tick'); }
}

function toggleSoundShield() { if (isShieldPlaying) stopSoundShield(); else startSoundShield(); }

/* ==========================================================================
   11. BREATHING PACER — with rolling haptics + cycle XP
   ========================================================================== */
function toggleBreathingEngine() {
  const box = document.getElementById('pacer-box-target'); const label = document.getElementById('pacer-label'); const pacerBtn = document.getElementById('pacer-shortcut');
  if (!box) return;
  if (pacerIntervalId !== null) { killPacerEngine(); triggerHaptic('heavy'); label.innerText = "Paused. Tap to restart."; label.style.color = "var(--text-muted)"; if (pacerBtn) pacerBtn.classList.remove('active-pacer'); return; }
  triggerHaptic('heavy'); label.style.color = "var(--accent-sage)"; if (pacerBtn) pacerBtn.classList.add('active-pacer');
  runBreathingSequenceLoop();
}

function runBreathingSequenceLoop() {
  const box = document.getElementById('pacer-box-target'); const label = document.getElementById('pacer-label');
  if (!box || !label) return;
  function executeCycleSequence() {
    box.className = "pacer-view-box inhale-primary"; label.innerText = "Inhale deeply (Nose)..."; label.style.color = "var(--accent-sage)"; triggerHaptic('inhale');
    setTimeout(() => { if (pacerIntervalId === null) return; box.className = "pacer-view-box inhale-secondary"; label.innerText = "Sharp inhale again!"; label.style.color = "#AED581"; triggerHaptic('sharp'); }, 3000);
    setTimeout(() => {
      if (pacerIntervalId === null) return;
      box.className = "pacer-view-box exhale-release"; label.innerText = "Exhale slowly... Let it go"; label.style.color = "#818CF8"; triggerHaptic('exhale');
      stats.breathCycles++; awardXP('breath');   // a full physiological sigh counted
    }, 3700);
  }
  executeCycleSequence(); pacerIntervalId = setInterval(executeCycleSequence, 8700);
}
function killPacerEngine() { if (pacerIntervalId !== null) { clearInterval(pacerIntervalId); pacerIntervalId = null; } const box = document.getElementById('pacer-box-target'); if (box) box.className = "pacer-view-box"; const pacerBtn = document.getElementById('pacer-shortcut'); if (pacerBtn) pacerBtn.classList.remove('active-pacer'); }

/* ==========================================================================
   12. OASIS DRAWERS, VIBES, GROUNDING, CHALLENGES, LETTERS
   ========================================================================== */
function toggleDrawer(id) {
  document.querySelectorAll('.oasis-drawer').forEach(drawer => { if (drawer.id === id) { drawer.classList.toggle('expanded'); triggerHaptic('tick'); } else { drawer.classList.remove('expanded'); } });
  if (id === 'drawer-journey' && document.getElementById(id).classList.contains('expanded')) renderStats();
  if (id === 'drawer-stone' && document.getElementById(id).classList.contains('expanded')) setTimeout(initWorryStone, 420);
}

function setVibeSync(vibe) { const buttons = document.querySelectorAll('.vibe-btn'); if (activeVibe === vibe) { activeVibe = null; buttons.forEach(btn => btn.classList.remove('active')); showToast("Vibe sync cleared"); } else { activeVibe = vibe; buttons.forEach(btn => { if (btn.getAttribute('data-vibe') === vibe) btn.classList.add('active'); else btn.classList.remove('active'); }); showToast(`Feed customized to: ${vibe}`); } triggerHaptic('heavy'); renderFeed(); }

function nextGroundingStep() {
  const numElem = document.getElementById('grounding-num'); const txtElem = document.getElementById('grounding-txt'); const stepElem = document.getElementById('grounding-step'); const actionBtn = document.getElementById('grounding-action-btn');
  groundingIndex++;
  if (groundingIndex >= groundingSteps.length) {
    groundingIndex = 0; triggerHaptic('wave'); showToast("Sensory reset complete"); awardXP('grounding');
    numElem.innerText = groundingSteps[0].num; txtElem.innerText = groundingSteps[0].inst; stepElem.innerText = groundingSteps[0].stepText; actionBtn.innerText = "Acknowledge & Continue";
  } else {
    triggerHaptic('tick'); const currentData = groundingSteps[groundingIndex];
    numElem.innerText = currentData.num; txtElem.innerText = currentData.inst; stepElem.innerText = currentData.stepText;
    if (groundingIndex === groundingSteps.length - 1) actionBtn.innerText = "Complete Reset Sequence"; else actionBtn.innerText = "Acknowledge & Continue";
  }
}

function setupDailyChallenge() {
  const savedDate = localStorage.getItem('havenscroll_challenge_date'); const today = new Date().toDateString(); let index = parseInt(localStorage.getItem('havenscroll_challenge_index'), 10);
  if (savedDate !== today || isNaN(index)) { index = Math.floor(Math.random() * microChallenges.length); localStorage.setItem('havenscroll_challenge_index', index); localStorage.setItem('havenscroll_challenge_date', today); localStorage.removeItem('havenscroll_challenge_completed'); }
  document.getElementById('challenge-display').innerText = microChallenges[index];
  const isCompleted = localStorage.getItem('havenscroll_challenge_completed') === 'true'; const btn = document.getElementById('challenge-btn');
  if (isCompleted) { btn.classList.add('completed'); btn.innerText = "Completed ✓"; } else { btn.classList.remove('completed'); btn.innerText = "Complete Task"; }
}

function completeDailyChallenge() {
  const isCompleted = localStorage.getItem('havenscroll_challenge_completed') === 'true'; const btn = document.getElementById('challenge-btn');
  if (!isCompleted) {
    localStorage.setItem('havenscroll_challenge_completed', 'true'); btn.classList.add('completed'); btn.innerText = "Completed ✓"; showToast("Micro-challenge completed! Proud of you."); triggerHaptic('heavy');
    stats.tasksDone++; awardXP('task');
  }
  else { localStorage.removeItem('havenscroll_challenge_completed'); btn.classList.remove('completed'); btn.innerText = "Complete Task"; showToast("Progress reset"); triggerHaptic('tick'); }
}

function renderLetters() {
  const container = document.getElementById('letters-container'); container.innerHTML = '';
  omerLetters.forEach(letter => { const item = document.createElement('div'); item.className = 'letter-item'; item.onclick = () => openLetter(letter.id); item.innerHTML = `<span class="letter-title">✉️ ${letter.title}</span><span class="letter-meta">${letter.date}</span>`; container.appendChild(item); });
}

function openLetter(id) { const letter = omerLetters.find(l => l.id === id); if (!letter) return; document.getElementById('letter-text-box').innerText = letter.text; document.getElementById('letter-modal').style.display = 'flex'; triggerHaptic('heavy'); stats.lettersOpened++; awardXP('letter'); }
function closeLetter() { document.getElementById('letter-modal').style.display = 'none'; triggerHaptic('tick'); }

/* ==========================================================================
   13. TACTILE WORRY STONE — canvas ripples + continuous soft haptics (Pillar 3)
   ========================================================================== */
let stoneCanvas = null, stoneCtx = null, stoneRipples = [], stoneRafId = null, lastStoneHaptic = 0, stoneInited = false, stoneSessionCounted = false;
let stoneMode = 'ripple', stoneSpiroColor = '#D4AF37', stoneSpiroRafId = null;

const SPIRO_PRESETS = [
  { R:90, r:30, d:28, T:3  },  // 3-petal classic
  { R:80, r:20, d:18, T:4  },  // 4-petal
  { R:75, r:15, d:14, T:5  },  // 5-petal
  { R:84, r:14, d:13, T:6  },  // 6-star
  { R:77, r:11, d:10, T:7  },  // 7-star fine
  { R:90, r:36, d:27, T:5  },  // 5-petal (2 rev)
  { R:84, r:36, d:24, T:7  },  // 7-petal (3 rev)
  { R:70, r:20, d:18, T:7  },  // 7-loop
  { R:72, r:27, d:18, T:8  },  // 8-petal
  { R:72, r:32, d:22, T:9  },  // 9-spoke
  { R:80, r:48, d:30, T:5  },  // open 5-loop
  { R:84, r:48, d:28, T:7  },  // dense 7
  { R:90, r:10, d: 9, T:9  },  // 9-petal fine
  { R:78, r:26, d:24, T:3  },  // chunky 3
];

function initWorryStone() {
  stoneCanvas = document.getElementById('worry-stone-canvas');
  if (!stoneCanvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = stoneCanvas.getBoundingClientRect();
  if (rect.width === 0) return; // drawer still closed
  stoneCanvas.width = rect.width * dpr;
  stoneCanvas.height = rect.height * dpr;
  stoneCtx = stoneCanvas.getContext('2d');
  stoneCtx.scale(dpr, dpr);
  if (stoneInited) return;
  stoneInited = true;

  const onDown = (clientX, clientY) => {
    document.getElementById('worry-stone-wrap').classList.add('touched');
    if (!stoneSessionCounted) { stoneSessionCounted = true; stats.stoneSessions++; awardXP('stone'); setTimeout(() => stoneSessionCounted = false, 30000); }
    if (stoneMode === 'spiro') {
      newSpirograph();
    } else if (stoneMode === 'sculpt') {
      sculptSpirograph(clientX, clientY);
    } else {
      const r = stoneCanvas.getBoundingClientRect();
      const x = clientX - r.left, y = clientY - r.top;
      stoneRipples.push({ x, y, radius: 4, alpha: 0.5 });
      const now = performance.now();
      if (now - lastStoneHaptic > 70) { triggerHaptic('stone'); lastStoneHaptic = now; }
      if (!stoneRafId) stoneLoop();
    }
  };

  const onMove = (clientX, clientY) => {
    if (stoneMode === 'spiro') return;
    if (stoneMode === 'sculpt') { sculptSpirograph(clientX, clientY); return; }
    const r = stoneCanvas.getBoundingClientRect();
    const x = clientX - r.left, y = clientY - r.top;
    stoneRipples.push({ x, y, radius: 4, alpha: 0.5 });
    if (stoneRipples.length > 60) stoneRipples.shift();
    const now = performance.now();
    if (now - lastStoneHaptic > 70) { triggerHaptic('stone'); lastStoneHaptic = now; }
    if (!stoneRafId) stoneLoop();
  };

  stoneCanvas.addEventListener('touchstart',  e => { const t = e.touches[0]; if (t) onDown(t.clientX, t.clientY); }, { passive: true });
  stoneCanvas.addEventListener('touchmove',   e => { if (stoneMode !== 'spiro') { e.preventDefault(); const t = e.touches[0]; if (t) onMove(t.clientX, t.clientY); } }, { passive: false });
  stoneCanvas.addEventListener('mousedown',   e => onDown(e.clientX, e.clientY));
  stoneCanvas.addEventListener('mousemove',   e => { if (e.buttons === 1) onMove(e.clientX, e.clientY); });
}

/* ---------- Spirograph engine ---------- */
function newSpirograph() {
  if (stoneSpiroRafId) { cancelAnimationFrame(stoneSpiroRafId); stoneSpiroRafId = null; }
  if (!stoneCtx || !stoneCanvas) return;
  const rect = stoneCanvas.getBoundingClientRect();
  stoneCtx.clearRect(0, 0, rect.width, rect.height);

  const p    = SPIRO_PRESETS[Math.floor(Math.random() * SPIRO_PRESETS.length)];
  const hw   = Math.min(rect.width, rect.height) * 0.46;
  const unit = hw / 90;
  const R = p.R * unit, r = p.r * unit, d = p.d * unit;
  const cx = rect.width / 2, cy = rect.height / 2;
  const totalT = 2 * Math.PI * p.T;
  const steps  = Math.ceil(p.T * 200);
  const dt     = totalT / steps;
  const framesTarget = 180;
  const batchSize = Math.max(2, Math.ceil(steps / framesTarget));
  const color  = stoneSpiroColor;
  let t = 0, lastX = null, lastY = null;

  const step = () => {
    stoneCtx.beginPath();
    stoneCtx.strokeStyle = color;
    stoneCtx.lineWidth   = 1.3;
    stoneCtx.globalAlpha = 0.70;
    if (lastX !== null) stoneCtx.moveTo(lastX, lastY);

    for (let i = 0; i < batchSize && t <= totalT; i++) {
      const x = cx + (R - r) * Math.cos(t) + d * Math.cos((R - r) / r * t);
      const y = cy + (R - r) * Math.sin(t) - d * Math.sin((R - r) / r * t);
      if (lastX === null) stoneCtx.moveTo(x, y); else stoneCtx.lineTo(x, y);
      lastX = x; lastY = y;
      t += dt;
    }
    stoneCtx.stroke();
    stoneCtx.globalAlpha = 1;

    stoneSpiroRafId = (t <= totalT) ? requestAnimationFrame(step) : null;
  };

  stoneSpiroRafId = requestAnimationFrame(step);
  triggerHaptic('tick');
}

/* ---------- Sculpt spirograph — drag finger to morph in real time ---------- */
// 12-color rainbow palette — each pen is a fully distinct hue, like a real rainbow spirograph
const SCULPT_COLORS = [
  '#FF2020', '#FF5500', '#FF9900', '#FFD700',
  '#AAFF00', '#00DD55', '#00BBBB', '#0088FF',
  '#3344FF', '#7700EE', '#CC00BB', '#FF0066'
];

function sculptSpirograph(clientX, clientY) {
  if (stoneSpiroRafId) { cancelAnimationFrame(stoneSpiroRafId); stoneSpiroRafId = null; }
  if (!stoneCtx || !stoneCanvas) return;
  const rect = stoneCanvas.getBoundingClientRect();
  const xn = Math.max(0, Math.min(1, (clientX - rect.left)  / rect.width));
  const yn = Math.max(0, Math.min(1, (clientY - rect.top)   / rect.height));
  const petals   = 3 + xn * 8;
  const openness = 0.35 + (1 - yn) * 0.60;
  const hw   = Math.min(rect.width, rect.height) * 0.46;
  const unit = hw / 90;
  const R  = 90 * unit;
  const r  = R / (petals + 1);
  const d  = r * openness;
  const cx = rect.width / 2, cy = rect.height / 2;
  const T      = Math.ceil(petals);
  const totalT = 2 * Math.PI * T;
  const steps  = Math.ceil(T * 240);
  const dt     = totalT / steps;
  stoneCtx.clearRect(0, 0, rect.width, rect.height);
  // Draw each tiny segment with a continuously-cycling hue — true rainbow gradient along path
  let prevX, prevY;
  for (let i = 0; i <= steps; i++) {
    const t = i * dt;
    const x = cx + (R - r) * Math.cos(t) + d * Math.cos((R - r) / r * t);
    const y = cy + (R - r) * Math.sin(t) - d * Math.sin((R - r) / r * t);
    if (i > 0) {
      const hue = (i / steps) * 360;
      stoneCtx.beginPath();
      stoneCtx.strokeStyle = 'hsl(' + hue + ',100%,55%)';
      stoneCtx.moveTo(prevX, prevY);
      stoneCtx.lineTo(x, y);
      stoneCtx.stroke();
    }
    prevX = x; prevY = y;
  }
  stoneCtx.globalAlpha = 1;
  const now = performance.now();
  if (now - lastStoneHaptic > 80) { triggerHaptic('tick'); lastStoneHaptic = now; }
}

function toggleStoneMode(mode) {
  stoneMode = mode;
  document.getElementById('stone-mode-ripple').classList.toggle('stone-mode-btn--active', mode === 'ripple');
  document.getElementById('stone-mode-spiro').classList.toggle('stone-mode-btn--active', mode === 'spiro');
  document.getElementById('stone-mode-sculpt').classList.toggle('stone-mode-btn--active', mode === 'sculpt');
  document.getElementById('stone-draw-tools').style.display = (mode !== 'ripple') ? 'flex' : 'none';
  // In sculpt mode all 4 colors fire simultaneously — hide individual picker
  document.querySelectorAll('.stone-color-btn').forEach(b => { b.style.display = (mode === 'sculpt') ? 'none' : ''; });
  // Update action button label contextually
  const actionBtn = document.querySelector('.stone-clear-btn');
  if (actionBtn) actionBtn.textContent = (mode === 'sculpt') ? '✕ Clear' : '↺ New Pattern';
  stoneRipples = [];
  if (stoneSpiroRafId) { cancelAnimationFrame(stoneSpiroRafId); stoneSpiroRafId = null; }
  if (stoneCtx) { const r = stoneCanvas.getBoundingClientRect(); stoneCtx.clearRect(0, 0, r.width, r.height); }
  if (mode === 'spiro') newSpirograph();
  triggerHaptic('tick');
}

function setStoneColor(color, btn) {
  stoneSpiroColor = color;
  document.querySelectorAll('.stone-color-btn').forEach(b => b.classList.remove('stone-color-btn--active'));
  btn.classList.add('stone-color-btn--active');
  if (stoneMode === 'spiro') newSpirograph();
  triggerHaptic('tick');
}

function clearStoneDrawing() {
  if (stoneSpiroRafId) { cancelAnimationFrame(stoneSpiroRafId); stoneSpiroRafId = null; }
  if (stoneCtx) { const r = stoneCanvas.getBoundingClientRect(); stoneCtx.clearRect(0, 0, r.width, r.height); }
  triggerHaptic('tick');
}

function stoneLoop() {
  const r = stoneCanvas.getBoundingClientRect();
  stoneCtx.clearRect(0, 0, r.width, r.height);
  stoneRipples.forEach(rp => {
    rp.radius += 1.6;
    rp.alpha *= 0.955;
    // outer fluid ring
    stoneCtx.beginPath();
    stoneCtx.arc(rp.x, rp.y, rp.radius, 0, Math.PI * 2);
    stoneCtx.strokeStyle = `rgba(129, 199, 132, ${rp.alpha.toFixed(3)})`;
    stoneCtx.lineWidth = 1.5;
    stoneCtx.stroke();
    // warm inner shimmer
    stoneCtx.beginPath();
    stoneCtx.arc(rp.x, rp.y, rp.radius * 0.55, 0, Math.PI * 2);
    stoneCtx.strokeStyle = `rgba(255, 183, 77, ${(rp.alpha * 0.6).toFixed(3)})`;
    stoneCtx.lineWidth = 1;
    stoneCtx.stroke();
  });
  stoneRipples = stoneRipples.filter(rp => rp.alpha > 0.01);
  if (stoneRipples.length > 0) { stoneRafId = requestAnimationFrame(stoneLoop); }
  else { stoneRafId = null; stoneCtx.clearRect(0, 0, r.width, r.height); }
}

/* ==========================================================================
   14. PODCASTS (rendered from data.json) + GLOBAL PLAYER
   ========================================================================== */
function renderPodcasts() {
  const container = document.getElementById('podcast-container');
  container.innerHTML = '';
  podcastShows.forEach(show => {
    const showDiv = document.createElement('div');
    showDiv.className = 'podcast-show-item';
    const epHtml = show.episodes.map(ep => {
      const safeTitle = ep.title.replace(/'/g, "\\'");
      const safeShow = show.title.replace(/'/g, "\\'");
      const safeImg = (show.image || '').replace(/'/g, "\\'");
      return `
        <div class="episode-item">
          <div style="flex:1; min-width:0; padding-right:0.5rem;">
            <div class="ep-title">${ep.title}</div>
            <div class="ep-meta">${ep.duration}</div>
          </div>
          <div class="ep-actions">
            <button class="ep-btn" onclick="playAudioTrack('${ep.url}','${safeTitle}','${safeShow}','${safeImg}')" title="Play">▶</button>
            <button class="ep-btn" onclick="downloadPodcast('${ep.url}','${safeTitle}')" title="Share / Save">↓</button>
          </div>
        </div>`;
    }).join('');
    showDiv.innerHTML = `
      <div class="podcast-show-header" onclick="this.parentElement.classList.toggle('open'); triggerHaptic('tick');">
        <div class="podcast-thumb">
          ${show.image ? `<img src="${show.image}" alt="" onerror="this.parentElement.innerHTML='🎙️'">` : '🎙️'}
        </div>
        <div class="podcast-info">
          <div class="podcast-title">${show.title}</div>
          <div class="podcast-author">${show.author}</div>
        </div>
        <span style="color:var(--text-muted); font-size:0.75rem; flex-shrink:0; margin-left:0.5rem;">▾</span>
      </div>
      <div class="podcast-episodes">${epHtml}</div>`;
    container.appendChild(showDiv);
  });
}

const nativeAudio = document.getElementById('native-audio');
const globalPlayer = document.getElementById('global-audio-player');
const playBtn = document.getElementById('player-play-btn');
const scrubber = document.getElementById('player-scrubber');
const currentTimeEl = document.getElementById('player-current');
const durationEl = document.getElementById('player-duration');
const speedBtn = document.getElementById('player-speed-btn');

const SPEED_STEPS = [1, 1.25, 1.5, 1.75, 2];
let currentSpeedIndex = 0;
let isScrubbing = false;

function formatTime(secs) {
  if (isNaN(secs) || secs < 0) return '0:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function updateScrubberBackground(pct) {
  scrubber.style.background = `linear-gradient(to right, var(--accent-gold) ${pct}%, rgba(255,255,255,0.1) ${pct}%)`;
}

nativeAudio.addEventListener('timeupdate', () => {
  if (isScrubbing) return;
  const pct = nativeAudio.duration ? (nativeAudio.currentTime / nativeAudio.duration) * 100 : 0;
  scrubber.value = pct;
  updateScrubberBackground(pct);
  currentTimeEl.textContent = formatTime(nativeAudio.currentTime);
});
nativeAudio.addEventListener('loadedmetadata', () => { durationEl.textContent = formatTime(nativeAudio.duration); });
nativeAudio.addEventListener('ended', () => { playBtn.innerHTML = '▶'; scrubber.value = 0; updateScrubberBackground(0); currentTimeEl.textContent = '0:00'; });
nativeAudio.addEventListener('play', () => { playBtn.innerHTML = '<span style="letter-spacing:-1px">❚❚</span>'; });
nativeAudio.addEventListener('pause', () => { playBtn.innerHTML = '▶'; });

function onScrubberInput(value) {
  isScrubbing = true;
  const pct = parseFloat(value);
  updateScrubberBackground(pct);
  if (nativeAudio.duration) currentTimeEl.textContent = formatTime((pct / 100) * nativeAudio.duration);
}
function onScrubberChange(value) {
  isScrubbing = false;
  if (nativeAudio.duration) nativeAudio.currentTime = (parseFloat(value) / 100) * nativeAudio.duration;
  triggerHaptic('tick');
}
function skipPodcast(seconds) {
  nativeAudio.currentTime = Math.max(0, Math.min(nativeAudio.duration || 0, nativeAudio.currentTime + seconds));
  triggerHaptic('tick');
}
function cyclePlaybackSpeed() {
  currentSpeedIndex = (currentSpeedIndex + 1) % SPEED_STEPS.length;
  const speed = SPEED_STEPS[currentSpeedIndex];
  nativeAudio.playbackRate = speed;
  speedBtn.textContent = speed === 1 ? '1×' : `${speed}×`;
  speedBtn.style.color = speed === 1 ? '' : 'var(--accent-gold)';
  speedBtn.style.borderColor = speed === 1 ? '' : 'var(--accent-gold)';
  showToast(`Speed: ${speed}×`);
  triggerHaptic('tick');
}
function playAudioTrack(url, title, author, image) {
  document.getElementById('player-title').innerText = title;
  document.getElementById('player-author').innerText = author;
  const thumb = document.querySelector('#global-audio-player .player-thumb');
  if (thumb) {
    thumb.innerHTML = image
      ? `<img src="${image}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px;display:block;" onerror="this.parentElement.innerHTML='🎙️'">`
      : '🎙️';
  }
  scrubber.value = 0; updateScrubberBackground(0);
  currentTimeEl.textContent = '0:00'; durationEl.textContent = '0:00';
  currentSpeedIndex = 0; nativeAudio.playbackRate = 1;
  speedBtn.textContent = '1×'; speedBtn.style.color = ''; speedBtn.style.borderColor = '';
  nativeAudio.src = url;
  nativeAudio.play();
  globalPlayer.style.display = 'flex';
  triggerHaptic('heavy');
}
function togglePodcastPlay() { if (nativeAudio.paused) nativeAudio.play(); else nativeAudio.pause(); triggerHaptic('tick'); }
function closePodcastPlayer() { nativeAudio.pause(); nativeAudio.src = ''; globalPlayer.style.display = 'none'; scrubber.value = 0; updateScrubberBackground(0); triggerHaptic('tick'); }

async function downloadPodcast(url, title) {
  triggerHaptic('wave');
  const isIOS = /iP(hone|od|ad)/.test(navigator.userAgent);
  if (isIOS) {
    if (navigator.share) {
      try { await navigator.share({ title: title || 'Podcast Episode', url: url }); showToast("Share sheet opened ✓"); }
      catch (e) { if (e.name !== 'AbortError') { window.open(url, '_blank'); showToast("Tap & hold the audio to save"); } }
    } else { window.open(url, '_blank'); showToast("Hold the audio to save to Files"); }
    return;
  }
  showToast("Downloading... this may take a moment");
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = (title || 'episode').replace(/[^a-z0-9 ]/gi, '_') + '.mp3';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    showToast("Download saved ✓");
  } catch (e) { window.open(url, '_blank'); showToast("Opened — save manually if needed"); }
  triggerHaptic('heavy');
}

/* ==========================================================================
   15. AMBIENT STARFIELD & STEALTH MODE
   ========================================================================== */
async function toggleAmbientStarfield(activate) {
  const overlay = document.getElementById('ambient-starfield-overlay'); isAmbientActive = activate;
  if (activate) {
    overlay.style.display = 'flex'; initStarfield(); triggerHaptic('heavy');
    if (!isShieldPlaying) ambientAutoStarted = await startSoundShield(true);
    else ambientAutoStarted = false;
  } else {
    overlay.style.display = 'none'; if (animationFrameId) cancelAnimationFrame(animationFrameId); stars = []; triggerHaptic('tick');
    if (ambientAutoStarted) { stopSoundShield(true); ambientAutoStarted = false; }
  }
}
function initStarfield() {
  canvas = document.getElementById('starfield-canvas'); ctx = canvas.getContext('2d'); resizeCanvas(); window.addEventListener('resize', resizeCanvas);
  stars = []; const starCount = 120;
  for (let i = 0; i < starCount; i++) { stars.push({ x: Math.random() * canvas.width - canvas.width / 2, y: Math.random() * canvas.height - canvas.height / 2, z: Math.random() * canvas.width, color: Math.random() > 0.3 ? '#81C784' : '#FFB74D' }); }
  runStarfieldLoop();
}
function resizeCanvas() { if (!canvas) return; const rect = canvas.parentElement.getBoundingClientRect(); canvas.width = rect.width; canvas.height = rect.height; }
function runStarfieldLoop() {
  if (!isAmbientActive) return;
  ctx.fillStyle = 'rgba(2, 4, 8, 0.25)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ambientPacerVal += 0.007 * ambientPacerDirection;
  if (ambientPacerVal >= 1) { ambientPacerVal = 1; ambientPacerDirection = -1; } else if (ambientPacerVal <= 0.02) { ambientPacerVal = 0.02; ambientPacerDirection = 1; }
  const label = document.getElementById('ambient-pacer-label');
  if (ambientPacerDirection === 1) { label.innerText = "Breathe in deeply..."; label.style.color = "var(--accent-sage)"; } else { label.innerText = "Exhale slowly... Let go"; label.style.color = "var(--accent-indigo)"; }
  const centerX = canvas.width / 2; const centerY = canvas.height / 2;
  stars.forEach(star => {
    star.z -= 1.5 + (ambientPacerVal * 6);
    if (star.z <= 0) { star.z = canvas.width; star.x = Math.random() * canvas.width - canvas.width / 2; star.y = Math.random() * canvas.height - canvas.height / 2; }
    const k = 128.0 / star.z; const px = star.x * k + centerX; const py = star.y * k + centerY;
    if (px >= 0 && px <= canvas.width && py >= 0 && py <= canvas.height) { const size = (1 - star.z / canvas.width) * (2 + ambientPacerVal * 4); ctx.beginPath(); ctx.arc(px, py, size, 0, Math.PI * 2); ctx.fillStyle = star.color; ctx.fill(); }
  });
  animationFrameId = requestAnimationFrame(runStarfieldLoop);
}

function activateStealthMode() { document.getElementById('stealth-overlay').style.display = 'flex'; killPacerEngine(); triggerHaptic('heavy'); }
function handleStealthScreenTap(event) { const triggerElement = document.getElementById('stealth-exit-trigger'); if (event.target === triggerElement || triggerElement.contains(event.target)) { document.getElementById('stealth-overlay').style.display = 'none'; triggerHaptic('heavy'); showToast("Sanctuary restored"); } }

/* ==========================================================================
   16. INTERSECTION OBSERVER — feed paging + lazy video play/pause
   ========================================================================== */
function setupIntersectionObserver() {
  if (observer) observer.disconnect();
  const options = { root: document.getElementById('feed-container'), threshold: 0.5 };
  observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const video = entry.target.querySelector('.card-bg-video');
      if (entry.isIntersecting) {
        const index = parseInt(entry.target.dataset.index, 10); activeIndex = index;
        if (video) {
          if (!video.src && video.dataset.src) video.src = video.dataset.src;
          video.play().then(() => video.classList.add('video-live')).catch(() => {});
        }
        if (currentTab === 'stream' && index >= activeStreamCards.length - 3) renderFeed(true);
      } else {
        if (video && !video.paused) video.pause();
        if (entry.target.classList.contains('pacer-card-root')) { killPacerEngine(); const label = document.getElementById('pacer-label'); if (label) { label.innerText = "Tap target circle to begin"; label.style.color = "var(--text-muted)"; } }
      }
    });
  }, options);
  document.querySelectorAll('.card').forEach(card => observer.observe(card));
}

/* ==========================================================================
   17. SERVICE WORKER + VERSION-BASED UPDATE DETECTION
   ========================================================================== */
let pendingUpdateWorker = null;
const CURRENT_VERSION_KEY = 'havenscroll_installed_version';

function showUpdateBanner() { const banner = document.getElementById('update-banner'); if (banner) banner.style.display = 'flex'; }
function dismissUpdateBanner() { const banner = document.getElementById('update-banner'); if (banner) banner.style.display = 'none'; }
function applyUpdate() {
  localStorage.removeItem(CURRENT_VERSION_KEY);
  dismissUpdateBanner();
  showToast("Updating Haven Scroll...");
  if (pendingUpdateWorker) { pendingUpdateWorker.postMessage({ type: 'SKIP_WAITING' }); pendingUpdateWorker = null; }
  setTimeout(() => window.location.reload(true), 800);
}
async function checkForVersionUpdate() {
  try {
    const res = await fetch('./version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    const serverVersion = data.version;
    const installedVersion = localStorage.getItem(CURRENT_VERSION_KEY);
    if (!installedVersion) { localStorage.setItem(CURRENT_VERSION_KEY, serverVersion); return; }
    if (serverVersion !== installedVersion) showUpdateBanner();
  } catch (e) { /* offline - silently ignore */ }
}
function registerAndWatchSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').then(reg => {
    if (reg.waiting) { pendingUpdateWorker = reg.waiting; showUpdateBanner(); }
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) { pendingUpdateWorker = newWorker; showUpdateBanner(); }
      });
    });
  }).catch(err => console.log('SW registration failed:', err));
}

/* ==========================================================================
   19. SAME SKY — Moon phase + parallactic angle + location buttons
   Pure offline. No GPS. No external libraries. Julian date math only.
   Parallactic angle: how the terminator tilts per observer latitude.
   ========================================================================== */

const SAME_SKY_TRANSITION_DATE = new Date(2026, 5, 21); // June 21 → Norway

// Hardcoded coordinates (private — city names never shown in app)
const _SKY_LOCS_PRE  = { a: { lat: 43.485, lng: 43.604, name: 'Russia' },
                          b: { lat: 57.307, lng: 13.537, name: 'Sweden' } };
const _SKY_LOCS_POST = { a: { lat: 59.913, lng: 10.752, name: 'Norway' },
                          b: { lat: 57.307, lng: 13.537, name: 'Sweden' } };

let _sameSkyActiveLoc = 'a'; // default: Danna's location
let _sameSkyJD        = null;
let _sameSkyPhase     = null;

function _getSkyLocs() {
  const today = new Date(); today.setHours(0,0,0,0);
  const t = new Date(SAME_SKY_TRANSITION_DATE); t.setHours(0,0,0,0);
  return today >= t ? _SKY_LOCS_POST : _SKY_LOCS_PRE;
}

function _computeJD(date) {
  const y = date.getUTCFullYear(), m = date.getUTCMonth() + 1, d = date.getUTCDate();
  const A = Math.floor((14 - m) / 12);
  const Y = y + 4800 - A, M2 = m + 12 * A - 3;
  const jdn = d + Math.floor((153*M2+2)/5) + 365*Y + Math.floor(Y/4)
            - Math.floor(Y/100) + Math.floor(Y/400) - 32045;
  return jdn - 0.5 + (date.getUTCHours() + date.getUTCMinutes()/60) / 24;
}

function getMoonPhase(date) {
  const JD_EPOCH = 2451550.1, SYNODIC = 29.53058867;
  const jd    = _computeJD(date);
  const age   = ((jd - JD_EPOCH) % SYNODIC + SYNODIC) % SYNODIC;
  const phase = age / SYNODIC;
  const illum = Math.round((0.5 - 0.5 * Math.cos(phase * 2 * Math.PI)) * 100);
  let name;
  if      (phase < 0.025) name = 'New Moon';
  else if (phase < 0.25)  name = 'Waxing Crescent';
  else if (phase < 0.275) name = 'First Quarter';
  else if (phase < 0.50)  name = 'Waxing Gibbous';
  else if (phase < 0.525) name = 'Full Moon';
  else if (phase < 0.75)  name = 'Waning Gibbous';
  else if (phase < 0.775) name = 'Last Quarter';
  else                    name = 'Waning Crescent';
  return { phase, illum, name, age, jd };
}

// Simplified lunar RA/Dec (~1° accuracy) — Meeus Ch.47 abridged
function _getMoonRaDec(jd) {
  const D2R = Math.PI / 180;
  const T  = (jd - 2451545.0) / 36525;
  const L0 = 218.3164477 + 481267.88123421 * T;
  const Ms = 357.5291092 +  35999.0502909  * T;
  const M1 = 134.9633964 + 477198.8675055  * T;
  const Dv = 297.8501921 + 445267.1114034  * T;
  const F  =  93.2720950 + 483202.0175233  * T;
  const dL = 6.289*Math.sin(M1*D2R) + 1.274*Math.sin((2*Dv-M1)*D2R)
           + 0.658*Math.sin(2*Dv*D2R) - 0.186*Math.sin(Ms*D2R)
           - 0.059*Math.sin((2*Dv-2*M1)*D2R) - 0.057*Math.sin((2*Dv-Ms-M1)*D2R)
           + 0.053*Math.sin((2*Dv+M1)*D2R);
  const dB = 5.128*Math.sin(F*D2R) + 0.281*Math.sin((M1+F)*D2R)
           - 0.281*Math.sin((M1-F)*D2R) - 0.173*Math.sin((2*Dv-F)*D2R);
  const lam = (L0 + dL) * D2R;
  const bet = dB * D2R;
  const eps = 23.4393 * D2R;
  const ra  = Math.atan2(Math.sin(lam)*Math.cos(eps) - Math.tan(bet)*Math.sin(eps), Math.cos(lam));
  const dec = Math.asin(Math.sin(bet)*Math.cos(eps) + Math.cos(bet)*Math.sin(eps)*Math.sin(lam));
  return { ra, dec };
}

// q = atan2(sin H, tan φ · cos δ − sin δ · cos H)
function _getParallacticAngle(lat_deg, lng_deg, jd) {
  const D2R = Math.PI / 180;
  const { ra, dec } = _getMoonRaDec(jd);
  const gmst = ((280.46061837 + 360.98564736629*(jd-2451545.0)) % 360 + 360) % 360 * D2R;
  const H   = gmst + lng_deg * D2R - ra;
  const phi = lat_deg * D2R;
  return Math.atan2(Math.sin(H), Math.tan(phi)*Math.cos(dec) - Math.sin(dec)*Math.cos(H));
}

function renderMoonCanvas(canvas, phase, rotAngle) {
  const W = canvas.width, Hc = canvas.height;
  const cx = W/2, cy = Hc/2;
  const r  = Math.min(W, Hc) * 0.44;
  const PI = Math.PI;

  // Render everything on an offscreen canvas first — no rotation, clean compositing.
  // Then blit to main canvas with parallactic rotation. This avoids all composite quirks.
  const oc = document.createElement('canvas');
  oc.width = W; oc.height = Hc;
  const c = oc.getContext('2d');

  /* ── 1. Surface: canvas gradient moon ── */
  c.save();
  c.beginPath(); c.arc(cx, cy, r, 0, 2*PI); c.clip();
  const grad = c.createRadialGradient(cx-r*0.18, cy-r*0.2, r*0.04, cx, cy, r);
  grad.addColorStop(0,    '#F5EDCC');
  grad.addColorStop(0.28, '#D4B86A');
  grad.addColorStop(0.62, '#9A7B42');
  grad.addColorStop(0.86, '#6B5530');
  grad.addColorStop(1,    '#3A2E1A');
  c.beginPath(); c.arc(cx, cy, r, 0, 2*PI); c.fillStyle = grad; c.fill();
  [ {dx:-0.30,dy:-0.40,dr:0.13}, {dx: 0.32,dy:-0.15,dr:0.085},
    {dx:-0.08,dy: 0.32,dr:0.17}, {dx: 0.50,dy: 0.12,dr:0.072},
    {dx:-0.48,dy: 0.18,dr:0.09}, {dx: 0.14,dy: 0.52,dr:0.105},
    {dx:-0.18,dy:-0.10,dr:0.052},{dx: 0.22,dy:-0.52,dr:0.08 }
  ].forEach(function(p) {
    if (Math.sqrt(p.dx*p.dx+p.dy*p.dy)+p.dr > 0.92) return;
    var ix=cx+p.dx*r, iy=cy+p.dy*r, ir=p.dr*r;
    var cg=c.createRadialGradient(ix-ir*0.2,iy-ir*0.2,0,ix,iy,ir);
    cg.addColorStop(0,'rgba(45,30,12,0.50)');
    cg.addColorStop(0.7,'rgba(25,18,8,0.32)');
    cg.addColorStop(1,'rgba(255,235,150,0.10)');
    c.beginPath(); c.arc(ix,iy,ir,0,2*PI); c.fillStyle=cg; c.fill();
  });
  c.restore();

  /* ── 2. Phase shadow — fully opaque, clipped to disc ── */
  if (phase < 0.49 || phase > 0.51) {
    const cos_a = Math.cos(phase * 2 * PI);
    c.save();
    c.beginPath(); c.arc(cx, cy, r, 0, 2*PI); c.clip();
    c.fillStyle = 'rgb(10,14,23)';  // fully opaque — no bleed-through
    c.beginPath();
    if (phase < 0.5) {
      // Waxing: shadow on LEFT
      c.arc(cx, cy, r, 1.5*PI, 0.5*PI, true);  // CCW left arc: top→left→bottom
      cos_a >= 0
        ? c.ellipse(cx, cy, cos_a*r,  r, 0, 0.5*PI, 1.5*PI, true)   // crescent: RIGHT terminator (large shadow)
        : c.ellipse(cx, cy, -cos_a*r, r, 0, 0.5*PI, 1.5*PI, false);  // gibbous:  LEFT terminator (thin shadow)
    } else {
      // Waning: shadow on RIGHT
      c.arc(cx, cy, r, 1.5*PI, 0.5*PI, false); // CW right arc: top→right→bottom
      cos_a >= 0
        ? c.ellipse(cx, cy, cos_a*r,  r, 0, 0.5*PI, 1.5*PI, false)  // crescent: LEFT terminator (large shadow)
        : c.ellipse(cx, cy, -cos_a*r, r, 0, 0.5*PI, 1.5*PI, true);   // gibbous:  RIGHT terminator (thin shadow)
    }
    c.closePath(); c.fill();
    c.restore();
  }

  /* ── 3. Earthshine on dark limb ── */
  if (phase>0.04 && phase<0.96 && !(phase>0.46 && phase<0.54)) {
    c.save();
    c.beginPath(); c.arc(cx, cy, r, 0, 2*PI); c.clip();
    const esCx = phase<0.5 ? cx-r*0.28 : cx+r*0.28;
    const esG = c.createRadialGradient(esCx, cy+r*0.08, 0, esCx, cy+r*0.08, r*0.85);
    esG.addColorStop(0,   'rgba(70,115,180,0.13)');
    esG.addColorStop(0.5, 'rgba(50,95,160,0.06)');
    esG.addColorStop(1,   'rgba(35,75,140,0.00)');
    c.fillStyle = esG; c.fillRect(cx-r, cy-r, r*2, r*2);
    c.restore();
  }

  /* ── 4. Limb darkening ── */
  const limb = c.createRadialGradient(cx, cy, r*0.86, cx, cy, r);
  limb.addColorStop(0, 'rgba(0,0,0,0)');
  limb.addColorStop(1, 'rgba(0,0,0,0.32)');
  c.save();
  c.beginPath(); c.arc(cx, cy, r, 0, 2*PI); c.fillStyle = limb; c.fill();
  c.restore();

  /* ── 5. Copy to main canvas with parallactic rotation ── */
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, Hc);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotAngle || 0);
  ctx.translate(-cx, -cy);
  ctx.drawImage(oc, 0, 0);
  ctx.restore();
}

// Called by onclick="switchSkyView('a')" / "switchSkyView('b')"
function switchSkyView(locKey) {
  if (_sameSkyPhase === null || _sameSkyJD === null) return;
  _sameSkyActiveLoc = locKey;
  const loc = _getSkyLocs()[locKey];
  const angle = _getParallacticAngle(loc.lat, loc.lng, _sameSkyJD);
  const canvas = document.getElementById('moon-canvas');
  if (canvas) renderMoonCanvas(canvas, _sameSkyPhase, angle);
  ['a','b'].forEach(k => {
    const btn = document.getElementById('btn-sky-' + k);
    if (btn) btn.classList.toggle('active', k === locKey);
  });
}

function initSameSky() {
  const canvas  = document.getElementById('moon-canvas');
  const nameEl  = document.getElementById('moon-phase-name');
  const illumEl = document.getElementById('moon-illum-pct');
  if (!canvas) return;

  const { phase, illum, name, jd } = getMoonPhase(new Date());
  _sameSkyPhase = phase;
  _sameSkyJD    = jd;

  if (nameEl)  nameEl.textContent  = name;
  if (illumEl) illumEl.textContent = illum + '% illuminated';

  // Set button labels to current location names
  const locs = _getSkyLocs();
  const btnA = document.getElementById('btn-sky-a');
  const btnB = document.getElementById('btn-sky-b');
  if (btnA) { btnA.textContent = locs.a.name; btnA.classList.add('active'); }
  if (btnB) { btnB.textContent = locs.b.name; }

  // Render with Danna's parallactic angle by default
  const angle0 = _getParallacticAngle(locs.a.lat, locs.a.lng, jd);
  renderMoonCanvas(canvas, phase, angle0);

}

/* ==========================================================================
   18. PRAYER TIMES — MWL offline calculation, no GPS / API required
   ========================================================================== */

// Russia tab hidden on/after this date; auto-switch to Norway
const PRAYER_HIDE_RUSSIA = new Date(2026, 5, 22); // June 22 2026

const PRAYER_LOCS = {
  russia: { lat: 43.49806, lng: 43.61889, tz: 3, label: 'Russia'  },
  sweden: { lat: 57.3044,  lng: 13.5408,  tz: 2, label: 'Sweden'  },
  norway: { lat: 59.91149, lng: 10.75793, tz: 2, label: 'Norway'  }
};

const PRAYER_QUOTES = [
  { ref: 'Quran 20:14',  text: 'Establish prayer for My remembrance.'              },
  { ref: 'Quran 13:28',  text: 'In the remembrance of Allah, hearts find comfort.' },
  { ref: 'Quran 2:152',  text: 'Remember Me; I will remember you.'                 },
  { ref: 'Quran 2:153',  text: 'Seek comfort in patience and prayer.'              },
  { ref: 'Quran 11:114', text: 'Good deeds wipe away misdeeds.'                    },
  { ref: 'Quran 23:1',   text: 'Successful indeed are the believers.'              },
  { ref: 'Quran 14:40',  text: 'Our Lord, accept my prayer.'                       },
  { ref: 'Quran 29:45',  text: 'The remembrance of Allah is greater.'              },
  { ref: 'Quran 94:5',   text: 'With every hardship comes ease.'                   },
  { ref: 'Quran 4:103',  text: 'Prayer is prescribed at appointed times.'          }
];

const PRAYER_NAMES  = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const PRAYER_LABELS = { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };
const PRAYER_KEY    = 'haven_prayers_v1';
// MWL angles — edit here to switch method
const _PM = { fa: 18, is: 17 };

let _prSelLoc = null;

/* ── Solar position helpers ── */
function _prSunPos(date) {
  const doy = Math.round((date - new Date(date.getFullYear(), 0, 1)) / 86400000) + 1;
  const B   = (360 / 365) * (doy - 81) * Math.PI / 180;
  const dec = 23.45 * Math.sin(B);
  const eqt = (9.87 * Math.sin(2*B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B)) / 60;
  return { dec, eqt };
}

function _prHA(lat, dec, angle) {
  const D2R = Math.PI / 180;
  const cosH = (Math.sin(angle*D2R) - Math.sin(lat*D2R)*Math.sin(dec*D2R))
             / (Math.cos(lat*D2R)*Math.cos(dec*D2R));
  return (cosH >= 1 || cosH <= -1) ? null : Math.acos(cosH) / D2R;
}

function calcPrayerTimes(date, key) {
  const L = PRAYER_LOCS[key], D2R = Math.PI / 180;
  const { dec, eqt } = _prSunPos(date);
  const noon    = 12 + L.tz - L.lng / 15 - eqt;
  const srHA    = _prHA(L.lat, dec, -0.833);
  const sunrise = noon - srHA / 15;
  const sunset  = noon + srHA / 15;
  const night   = (sunrise + 24) - sunset; // hours from tonight's sunset to tomorrow's sunrise

  // Asr — standard (shadow factor 1)
  const asrDeg = Math.atan(1 / (1 + Math.tan(Math.abs(L.lat - dec) * D2R))) / D2R;
  const asrHA  = _prHA(L.lat, dec, asrDeg);
  const asr    = noon + asrHA / 15;

  // Fajr / Isha with AngleBased high-latitude fallback
  const faHA = _prHA(L.lat, dec, -_PM.fa);
  const isHA = _prHA(L.lat, dec, -_PM.is);
  let fajr, isha, faEst = false, isEst = false;

  if (faHA !== null) { fajr = noon - faHA / 15; }
  else               { faEst = true;  fajr = sunrise - (_PM.fa / 60) * night; }
  if (isHA !== null) { isha = noon + isHA / 15; }
  else               { isEst = true;  isha = sunset  + (_PM.is / 60) * night; }

  return { fajr, dhuhr: noon, asr, maghrib: sunset, isha, faEst, isEst };
}

/* ── Format / storage helpers ── */
function _prFmt(h) {
  const w = ((h % 24) + 24) % 24;
  const hh = Math.floor(w);
  const mm = Math.round((w - hh) * 60);
  if (mm === 60) return `${String(hh + 1).padStart(2,'0')}:00`;
  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
}

function _prDK(d) { return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; }
function _prLoad() { try { return JSON.parse(localStorage.getItem(PRAYER_KEY)) || {}; } catch(e) { return {}; } }
function _prSave(data) { try { localStorage.setItem(PRAYER_KEY, JSON.stringify(data)); } catch(e) {} }
function _prRussiaHidden() { const t = new Date(); t.setHours(0,0,0,0); return t >= PRAYER_HIDE_RUSSIA; }

/* ── Interaction ── */
function prayerTick(locKey, name) {
  const data = _prLoad(), dk = _prDK(new Date());
  if (!data[dk]) data[dk] = {};
  if (!data[dk][locKey]) data[dk][locKey] = {};
  data[dk][locKey][name] = !data[dk][locKey][name];
  _prSave(data);
  // Sound placeholder — drop your mp3 here when ready:
  // try { new Audio('./assets/prayer-tick.mp3').play(); } catch(e) {}
  triggerHaptic('tick');
  renderPrayerUI();
}

function setPrayerLoc(key) { _prSelLoc = key; renderPrayerUI(); }

/* ── Render ── */
function renderPrayerUI() {
  const tabs   = document.getElementById('prayer-loc-tabs');
  const dateRow  = document.getElementById('prayer-date-row');
  const list     = document.getElementById('prayer-list');
  const statsRow = document.getElementById('prayer-stats-row');
  const quoteEl  = document.getElementById('prayer-quote');
  if (!tabs) return;

  // Auto-select first visible location
  const russiaHidden = _prRussiaHidden();
  const visible = Object.keys(PRAYER_LOCS).filter(k => !(k === 'russia' && russiaHidden));
  if (!_prSelLoc || (russiaHidden && _prSelLoc === 'russia')) _prSelLoc = visible[0];
  tabs.innerHTML = visible.map(k =>
    `<button class="prayer-tab${k === _prSelLoc ? ' prayer-tab--active' : ''}" onclick="setPrayerLoc('${k}')">${PRAYER_LOCS[k].label}</button>`
  ).join('');
  const today = new Date();
  if (dateRow) dateRow.textContent = today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const times  = calcPrayerTimes(today, _prSelLoc);
  const saved  = _prLoad();
  const dk     = _prDK(today);
  const done   = (saved[dk] && saved[dk][_prSelLoc]) || {};
  if (list) list.innerHTML = PRAYER_NAMES.map(name => {
    const t   = times[name];
    const est = (name === 'fajr' && times.faEst) || (name === 'isha' && times.isEst);
    const cls = done[name] ? 'prayer-row prayer-row--done' : 'prayer-row';
    return `<div class="${cls}" onclick="prayerTick('${_prSelLoc}','${name}')">
      <span class="prayer-name">${PRAYER_LABELS[name]}</span>
      <span class="prayer-time">${_prFmt(t)}${est ? '<sup> ~</sup>' : ''}</span>
      <span class="prayer-tick">${done[name] ? '\u2713' : ''}</span>
    </div>`;
  }).join('');
  const doneCount = PRAYER_NAMES.filter(n => done[n]).length;
  if (statsRow) statsRow.innerHTML = doneCount > 0
    ? `<span class="prayer-stats-text">${doneCount} / 5 prayed today</span>` : '';
  if (quoteEl) {
    const q = PRAYER_QUOTES[today.getDate() % PRAYER_QUOTES.length];
    quoteEl.innerHTML = q ? `<em>"${q.text}"</em> <small>${q.ref}</small>` : '';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  applyDaypartTheme();
  setInterval(applyDaypartTheme, 10 * 60 * 1000);
  runSplashSequence();
  setupIOSHapticBridge();
  await loadContentData();
  renderFeed();
  renderPrayerUI();
  initSameSky();
  registerAndWatchSW();
  setTimeout(checkForVersionUpdate, 3000);
  setInterval(checkForVersionUpdate, 5 * 60 * 1000);
});
/* HavenScroll v2.5.0 */