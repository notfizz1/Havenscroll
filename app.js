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
const IS_IOS = /iP(hone|od|ad)/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

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

const HAPTIC_TARGET_SELECTOR = '.tab-btn, .filter-pill, .drawer-trigger, .star-btn, .challenge-btn, .empty-cta, .tap-zone-left, .tap-zone-right, .vibe-btn, .ep-btn, .header-btn, .stealth-btn, .play-pause-btn, .player-skip-btn, .player-speed-btn, .letter-item, .podcast-show-header, .grounding-control button';

function armNativeHapticTargets() {
  document.querySelectorAll(HAPTIC_TARGET_SELECTOR).forEach(el => {
    if (el.querySelector(':scope > .ios-haptic-overlay')) return;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const sw = document.createElement('input');
    sw.type = 'checkbox';
    sw.setAttribute('switch', '');
    sw.className = 'ios-haptic-overlay';
    sw.setAttribute('aria-hidden', 'true');
    sw.tabIndex = -1;
    el.appendChild(sw);
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
let currentTab = 'stream'; let activeFilter = 'all'; let observer; let activeIndex = 0;
let activeStreamCards = []; let pacerIntervalId = null;
let audioCtx = null; let noiseNode = null; let filterNode = null; let isShieldPlaying = false;
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
  'card-sanctuary': './assets/video/sanctuary-bg.mp4',
  'card-neuro':     './assets/video/neuro-bg.mp4',
  'card-satire':    './assets/video/satire-bg.mp4'
};

function renderFeed(appendMore = false) {
  const container = document.getElementById('feed-container');
  if (!appendMore) { killPacerEngine(); container.innerHTML = ''; activeStreamCards = []; }
  let pool = baseCards.filter(item => {
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
   8. 3D BOOK READER
   ========================================================================== */
function renderBook() {
  const container = document.getElementById('book-page-slider'); container.innerHTML = '';
  bookPages.forEach((page, index) => {
    const pageDiv = document.createElement('div'); pageDiv.className = 'book-page';
    if (index < currentBookPageIndex) pageDiv.classList.add('page-prev');
    else if (index === currentBookPageIndex) pageDiv.classList.add('page-active');
    else pageDiv.classList.add('page-next');
    pageDiv.innerHTML = page.content; container.appendChild(pageDiv);
  });
  document.getElementById('book-progress-text').innerText = `Page ${currentBookPageIndex + 1} of ${bookPages.length}`;
}

function turnPage(direction) {
  if (direction === 'next') { if (currentBookPageIndex < bookPages.length - 1) { currentBookPageIndex++; triggerHaptic('page'); stats.pagesTurned++; awardXP('page'); } else { showToast("End of book reached"); return; } }
  else if (direction === 'prev') { if (currentBookPageIndex > 0) { currentBookPageIndex--; triggerHaptic('page'); } else { return; } }
  renderBook();
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
  else if (tab === 'books') { topBar.style.display = 'none'; feedContainer.style.display = 'none'; oasisView.style.display = 'none'; booksView.style.display = 'flex'; renderBook(); }
  else { topBar.style.display = 'flex'; document.getElementById('filter-container').style.display = 'flex'; feedContainer.style.display = 'block'; oasisView.style.display = 'none'; booksView.style.display = 'none'; renderFeed(); }
}

function setFilter(filter) {
  if (activeFilter === filter) return; activeFilter = filter; triggerHaptic('tick');
  if (activeVibe) { activeVibe = null; document.querySelectorAll('.vibe-btn').forEach(btn => btn.classList.remove('active')); }
  document.querySelectorAll('.filter-pill').forEach(pill => { pill.classList.toggle('active', pill.getAttribute('data-filter') === filter); });
  renderFeed();
}

function resetToStreamFeed() { activeFilter = 'all'; document.querySelectorAll('.filter-pill').forEach(p => p.classList.toggle('active', p.getAttribute('data-filter') === 'all')); switchTab('stream'); }
function scrollToPacerCard() { if (currentTab !== 'stream') switchTab('stream'); setFilter('all'); setTimeout(() => { const pacerCard = document.querySelector('.pacer-card-root'); if (pacerCard) pacerCard.scrollIntoView({ behavior: 'smooth' }); }, 150); }

/* ==========================================================================
   10. SOUND SHIELD (procedural rain — fully offline, no files)
   ========================================================================== */
function toggleSoundShield() {
  const shieldBtn = document.getElementById('sound-shield-btn'); const shieldBtnText = document.getElementById('sound-btn-text');
  if (isShieldPlaying) {
    if (audioCtx) { audioCtx.close().then(() => { audioCtx = null; noiseNode = null; filterNode = null; isShieldPlaying = false; shieldBtn.classList.remove('active-shield'); shieldBtnText.innerText = "Sound Shield"; showToast("Sound Shield deactivated"); triggerHaptic('tick'); }); }
  } else {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const bufferSize = 2 * audioCtx.sampleRate; const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate); const output = noiseBuffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179; b1 = 0.99332 * b1 + white * 0.0750759; b2 = 0.96900 * b2 + white * 0.1538520; b3 = 0.86650 * b3 + white * 0.3104856; b4 = 0.55000 * b4 + white * 0.5329522; b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362; output[i] *= 0.08; b6 = white * 0.115926;
      }
      noiseNode = audioCtx.createBufferSource(); noiseNode.buffer = noiseBuffer; noiseNode.loop = true;
      filterNode = audioCtx.createBiquadFilter(); filterNode.type = 'lowpass'; filterNode.frequency.value = 1100;
      const highPass = audioCtx.createBiquadFilter(); highPass.type = 'highpass'; highPass.frequency.value = 250;
      const lfo = audioCtx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.12;
      const lfoGain = audioCtx.createGain(); lfoGain.gain.value = 350;
      lfo.connect(lfoGain); lfoGain.connect(filterNode.frequency); lfo.start();
      noiseNode.connect(highPass); highPass.connect(filterNode); filterNode.connect(audioCtx.destination);
      noiseNode.start(0); isShieldPlaying = true;
      shieldBtn.classList.add('active-shield'); shieldBtnText.innerText = "Shield Active"; showToast("Sound Shield activated (Heavy Rain)"); triggerHaptic('heavy');
    } catch (e) { showToast("Audio context not supported on this browser"); }
  }
}

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

  const onMove = (clientX, clientY) => {
    const r = stoneCanvas.getBoundingClientRect();
    const x = clientX - r.left, y = clientY - r.top;
    stoneRipples.push({ x, y, radius: 4, alpha: 0.5 });
    if (stoneRipples.length > 60) stoneRipples.shift();
    document.getElementById('worry-stone-wrap').classList.add('touched');
    const now = performance.now();
    if (now - lastStoneHaptic > 70) { triggerHaptic('stone'); lastStoneHaptic = now; }
    if (!stoneSessionCounted) { stoneSessionCounted = true; stats.stoneSessions++; awardXP('stone'); setTimeout(() => stoneSessionCounted = false, 30000); }
    if (!stoneRafId) stoneLoop();
  };
  stoneCanvas.addEventListener('touchmove', e => { e.preventDefault(); const t = e.touches[0]; if (t) onMove(t.clientX, t.clientY); }, { passive: false });
  stoneCanvas.addEventListener('mousemove', e => { if (e.buttons === 1) onMove(e.clientX, e.clientY); });
  stoneCanvas.addEventListener('mousedown', e => onMove(e.clientX, e.clientY));
  stoneCanvas.addEventListener('touchstart', e => { const t = e.touches[0]; if (t) onMove(t.clientX, t.clientY); }, { passive: true });
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
function toggleAmbientStarfield(activate) {
  const overlay = document.getElementById('ambient-starfield-overlay'); isAmbientActive = activate;
  if (activate) { overlay.style.display = 'flex'; initStarfield(); if (!isShieldPlaying) toggleSoundShield(); triggerHaptic('heavy'); }
  else { overlay.style.display = 'none'; if (animationFrameId) cancelAnimationFrame(animationFrameId); stars = []; triggerHaptic('tick'); }
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
   18. BOOT SEQUENCE
   ========================================================================== */
window.addEventListener('DOMContentLoaded', async () => {
  applyDaypartTheme();
  setInterval(applyDaypartTheme, 10 * 60 * 1000);  // re-check palette every 10 min
  setupIOSHapticBridge();
  runSplashSequence();
  updateStreak();
  startTimeTracking();

  await loadContentData();
  renderFeed();
  setupParallax();

  const touchSurface = document.getElementById('book-touch-surface');
  if (touchSurface) { touchSurface.addEventListener('touchstart', handleTouchStart, { passive: true }); touchSurface.addEventListener('touchend', handleTouchEnd, { passive: true }); }

  registerAndWatchSW();
  setTimeout(checkForVersionUpdate, 3000);
  setInterval(checkForVersionUpdate, 5 * 60 * 1000);
});
/* HavenScroll v2.1.0 */
