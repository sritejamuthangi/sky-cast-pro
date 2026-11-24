/**
 * SkyCast: app bootstrap and state.
 * Loads a place (from the URL, your last visit, or a default), fetches the
 * forecast, renders everything, and keeps it fresh.
 */
import { ApiError, fetchAir, fetchCurrentMany, fetchForecast, reverseGeocode, searchPlaces } from './api.js';
import { condition, skyGroup, skyPhase } from './conditions.js';
import { pointer, initDepth } from './depth.js';
import { ago, HOUR, temp, wallNow } from './format.js';
import { buildInsights, buildSummary } from './insights.js';
import { buildModel, today } from './model.js';
import {
  renderClock, renderDaily, renderHero, renderHourly, renderInsights, renderMini, renderSaved, renderTiles,
} from './render.js';
import { createSearch } from './search.js';
import { createSky } from './sky.js';
import * as store from './storage.js';

const DEFAULT_PLACE = { name: 'Hyderabad', admin1: 'Telangana', country: 'India', lat: 17.385, lon: 78.4867, source: 'default' };
const REFRESH_AFTER = 10 * 60 * 1000;

const $ = id => document.getElementById(id);
const motion = matchMedia('(prefers-reduced-motion: reduce)');

const state = {
  place: null,
  model: null,
  fetchedAt: 0,
  hourKey: 0,
  prefs: store.getPrefs(),
  saved: store.getSaved(),
  savedTemps: new Map(),
  loading: null,
  target: null,
  scene: null,
};

let sky;

init();

function init() {
  $('year').textContent = String(new Date().getFullYear());
  sky = createSky({ el: $('sky'), canvas: $('skyCanvas'), flash: $('skyFlash') });
  const localHour = new Date().getHours();
  sky.set({ group: 'clear', phase: localHour >= 7 && localHour < 18 ? 'day' : 'night', kind: 'partly' });

  initDepth();
  setupSearch();
  setupUnits();
  setupActions();
  setupHourlyScroll();
  setupTopbar();
  registerServiceWorker();
  start();
}

async function start() {
  const place = await resolveInitialPlace();
  await loadPlace(place, { initial: true });
  refreshSavedTemps();

  setInterval(tick, 30_000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    tick();
    if (Date.now() - state.fetchedAt > REFRESH_AFTER) refresh();
  });
  window.addEventListener('online', () => refresh());
  window.addEventListener('offline', () => {
    if (state.model) showBanner(`You're offline. Showing the forecast from ${ago(state.fetchedAt)}.`);
  });
  motion.addEventListener?.('change', () => renderAll());
}

/* ---------- Places ---------- */

async function resolveInitialPlace() {
  const params = new URLSearchParams(location.search);
  const lat = parseFloat(params.get('lat'));
  const lon = parseFloat(params.get('lon'));
  if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    return {
      name: params.get('name') || 'Shared location',
      admin1: params.get('region') || '',
      country: params.get('country') || '',
      lat,
      lon,
      source: 'url',
    };
  }

  const city = params.get('city');
  if (city) {
    const found = await findPlace(city);
    if (found) return found;
    toast(`Couldn't find “${city}”.`);
  }

  const last = store.getLastPlace();
  if (last) return last;

  // Visitors from the previous version of SkyCast stored a city name.
  let legacy = null;
  try {
    legacy = localStorage.getItem('lastWeatherCity');
  } catch {
    /* ignore */
  }
  if (legacy) {
    const found = await findPlace(legacy);
    if (found) return found;
  }
  return DEFAULT_PLACE;
}

async function findPlace(name) {
  try {
    const [first] = await searchPlaces(name);
    return first || null;
  } catch {
    return null;
  }
}

async function loadPlace(place, { initial = false, silent = false } = {}) {
  state.loading?.abort();
  const ctrl = new AbortController();
  state.loading = ctrl;
  state.target = place;
  const key = store.placeKey(place);
  const cached = store.cacheGet(key);

  // Paint instantly from cache on first load; fresh data replaces it below.
  if (cached && (initial || !state.model)) applyData(place, cached.forecast, cached.air, cached.t);
  if (!silent) document.body.classList.add('is-busy');

  try {
    if (navigator.onLine === false) throw new ApiError('You appear to be offline.', { offline: true });
    const [forecast, air] = await Promise.allSettled([
      fetchForecast(place, { signal: ctrl.signal }),
      fetchAir(place, { signal: ctrl.signal }),
    ]);
    if (ctrl.signal.aborted) return;
    if (forecast.status === 'rejected') throw forecast.reason;
    const airData = air.status === 'fulfilled' ? air.value : cached?.air ?? null;
    const t = Date.now();
    store.cacheSet(key, { t, forecast: forecast.value, air: airData });
    applyData(place, forecast.value, airData, t);
    hideBanner();
  } catch (err) {
    if (ctrl.signal.aborted || err?.name === 'AbortError') return;
    if (cached) {
      applyData(place, cached.forecast, cached.air, cached.t);
      showBanner(`${err.offline ? "You're offline." : "Couldn't refresh."} Showing the forecast from ${ago(cached.t)}.`);
    } else if (state.model) {
      toast(`${err.message || 'Something went wrong.'} Still showing ${state.place.name}.`);
    } else {
      showError(err);
    }
  } finally {
    if (state.loading === ctrl) {
      state.loading = null;
      document.body.classList.remove('is-busy');
    }
  }
}

function refresh() {
  if (!state.place || state.loading) return;
  loadPlace(state.place, { silent: true });
  refreshSavedTemps();
}

function applyData(place, forecast, air, fetchedAt) {
  const firstPaint = !state.model;
  state.place = place;
  state.model = buildModel(forecast, air);
  state.fetchedAt = fetchedAt;

  const c = state.model.current;
  state.savedTemps.set(store.placeKey(place), { temp: c.temp, code: c.code, isDay: c.isDay });
  store.setLastPlace(place);
  updateURL(place);
  renderAll();

  if (firstPaint) {
    document.body.classList.remove('is-loading', 'has-error');
    if (!motion.matches) {
      document.body.classList.add('reveal');
      setTimeout(() => document.body.classList.remove('reveal'), 2200);
    }
    // The 3D icon is an enhancement. Start it when the person interacts, or after
    // 4 s, so its shader compilation never competes with the first render.
    scheduleHero3D();
  }
  $('errorCard').hidden = true;
  document.body.classList.remove('has-error');
  $('announcer').textContent = `Weather for ${place.name}: ${temp(c.temp, state.prefs.temp)}, ${condition(c.code, c.isDay).label}.`;
}

/* ---------- Rendering ---------- */

function context() {
  const nowW = wallNow(state.model.offset);
  return { model: state.model, place: state.place, prefs: state.prefs, nowW, animated: !motion.matches };
}

function renderAll() {
  if (!state.model) return;
  const ctx = context();
  const isSaved = state.saved.some(p => store.placeKey(p) === store.placeKey(ctx.place));
  state.hourKey = Math.floor(ctx.nowW / HOUR);

  renderHero({ ...ctx, isSaved, summary: buildSummary(ctx) });
  renderMini(ctx);
  renderInsights(buildInsights(ctx), ctx);
  renderHourly(ctx);
  renderDaily(ctx);
  renderTiles(ctx);
  renderSavedList();
  updateHourlyButtons();
  updateSkyAndScene(ctx);

  const c = ctx.model.current;
  document.title = `${ctx.place.name} · ${temp(c.temp, ctx.prefs.temp)} ${condition(c.code, c.isDay).label} | SkyCast`;
}

function updateSkyAndScene(ctx) {
  const c = ctx.model.current;
  const cond = condition(c.code, c.isDay);
  sky.set({ group: skyGroup(cond.kind), phase: skyPhase(ctx.nowW, today(ctx.model, ctx.nowW), c.isDay), kind: cond.kind });
  state.scene?.setCondition(cond.kind, c.isDay);
}

function renderSavedList() {
  renderSaved({
    saved: state.saved,
    currentKey: state.place ? store.placeKey(state.place) : '',
    temps: state.savedTemps,
    prefs: state.prefs,
  });
}

/** Every 30 s: keep the clock, sky phase and hourly list current. */
function tick() {
  if (!state.model) return;
  const ctx = context();
  if (Math.floor(ctx.nowW / HOUR) !== state.hourKey) {
    renderAll();
  } else {
    renderClock(ctx);
    updateSkyAndScene(ctx);
  }
  if (Date.now() - state.fetchedAt > REFRESH_AFTER && !document.hidden) refresh();
}

/* ---------- Saved cities ---------- */

let savedTimer = 0;
function refreshSavedTemps() {
  clearTimeout(savedTimer);
  savedTimer = setTimeout(async () => {
    const others = state.saved.filter(p => !state.place || store.placeKey(p) !== store.placeKey(state.place));
    if (!others.length || navigator.onLine === false) return;
    try {
      const results = await fetchCurrentMany(others);
      results.forEach((cur, i) => {
        if (cur) state.savedTemps.set(store.placeKey(others[i]), { temp: cur.temperature_2m, code: cur.weather_code, isDay: Boolean(cur.is_day) });
      });
      renderSavedList();
    } catch {
      /* chips simply show without temperatures */
    }
  }, 250);
}

function toggleSave() {
  if (!state.place) return;
  const key = store.placeKey(state.place);
  if (state.saved.some(p => store.placeKey(p) === key)) {
    state.saved = state.saved.filter(p => store.placeKey(p) !== key);
    toast(`Removed ${state.place.name} from saved cities`);
  } else {
    if (state.saved.length >= 12) {
      toast('You can save up to 12 cities. Remove one to add another.');
      return;
    }
    state.saved = [...state.saved, store.slimPlace({ ...state.place, source: 'saved' })];
    toast(`Saved ${state.place.name}`);
  }
  store.setSaved(state.saved);
  renderAll();
}

function removeSaved(key) {
  const place = state.saved.find(p => store.placeKey(p) === key);
  state.saved = state.saved.filter(p => store.placeKey(p) !== key);
  store.setSaved(state.saved);
  renderAll();
  if (place) toast(`Removed ${place.name}`);
}

/* ---------- UI wiring ---------- */

function setupSearch() {
  createSearch({
    root: $('search'),
    input: $('searchInput'),
    list: $('searchList'),
    live: $('searchLive'),
    getRecents: store.getRecents,
    onSelect: place => {
      store.addRecent(place);
      loadPlace(place);
      window.scrollTo({ top: 0, behavior: motion.matches ? 'auto' : 'smooth' });
    },
  });
}

function setupActions() {
  $('locateBtn').addEventListener('click', locate);
  $('saveBtn').addEventListener('click', toggleSave);
  $('shareBtn').addEventListener('click', share);
  $('errorRetry').addEventListener('click', () => loadPlace(state.target ?? state.place ?? DEFAULT_PLACE));
  $('bannerRetry').addEventListener('click', () => state.place && loadPlace(state.place));

  $('savedList').addEventListener('click', e => {
    const remove = e.target.closest('[data-remove]');
    if (remove) {
      removeSaved(remove.dataset.remove);
      return;
    }
    const chip = e.target.closest('[data-key]');
    if (!chip) return;
    const place = state.saved.find(p => store.placeKey(p) === chip.dataset.key);
    if (place && store.placeKey(place) !== store.placeKey(state.place)) {
      loadPlace({ ...place, source: 'saved' });
      window.scrollTo({ top: 0, behavior: motion.matches ? 'auto' : 'smooth' });
    }
  });
}

async function locate() {
  if (!('geolocation' in navigator)) {
    toast("Location isn't available in this browser. Try searching instead.");
    return;
  }
  const btn = $('locateBtn');
  btn.classList.add('is-busy');
  try {
    const pos = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 12_000, maximumAge: 600_000 }));
    const { latitude: lat, longitude: lon } = pos.coords;
    let names = { name: 'My location', admin1: '', country: '' };
    try {
      names = await reverseGeocode({ lat, lon });
    } catch {
      /* fall back to "My location" */
    }
    await loadPlace({ ...names, lat, lon, source: 'geo' });
  } catch (err) {
    toast(err?.code === 1
      ? 'Location permission was denied. You can search for a city instead.'
      : "Couldn't get your location. Try searching instead.");
  } finally {
    btn.classList.remove('is-busy');
  }
}

async function share() {
  const p = state.place;
  if (!p || !state.model) return;
  const url = new URL(location.pathname, location.origin);
  const digits = p.source === 'geo' ? 2 : 4; // don't share a precise home location
  url.searchParams.set('lat', p.lat.toFixed(digits));
  url.searchParams.set('lon', p.lon.toFixed(digits));
  url.searchParams.set('name', p.name);
  if (p.admin1) url.searchParams.set('region', p.admin1);
  if (p.country) url.searchParams.set('country', p.country);
  const c = state.model.current;
  const text = `${p.name}: ${temp(c.temp, state.prefs.temp)}, ${condition(c.code, c.isDay).label}`;

  if (navigator.share) {
    try {
      await navigator.share({ title: `Weather in ${p.name}`, text, url: url.href });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url.href);
    toast('Link copied to the clipboard');
  } catch {
    toast("Couldn't copy the link.");
  }
}

function setupUnits() {
  const form = $('unitsForm');
  const btn = $('unitsBtn');
  const panel = $('unitsPanel');

  const sync = () => {
    for (const [name, value] of Object.entries(state.prefs)) {
      const input = form.querySelector(`input[name="${name}"][value="${value}"]`);
      if (input) input.checked = true;
    }
    const label = state.prefs.temp === 'f' ? '°F' : '°C';
    $('unitsLabel').textContent = label;
    btn.setAttribute('aria-label', `${label}, change units`);
  };
  sync();

  form.addEventListener('change', e => {
    state.prefs = { ...state.prefs, [e.target.name]: e.target.value };
    store.setPrefs(state.prefs);
    sync();
    renderAll();
  });

  const place = () => {
    const r = btn.getBoundingClientRect();
    const width = Math.min(290, window.innerWidth - 24);
    panel.style.width = `${width}px`;
    panel.style.top = `${Math.round(r.bottom + 10)}px`;
    panel.style.left = `${Math.round(Math.max(12, Math.min(r.right - width, window.innerWidth - width - 12)))}px`;
  };

  if (typeof panel.showPopover === 'function') {
    panel.addEventListener('beforetoggle', e => {
      if (e.newState === 'open') place();
      btn.setAttribute('aria-expanded', String(e.newState === 'open'));
    });
    window.addEventListener('resize', () => {
      if (panel.matches(':popover-open')) place();
    });
  } else {
    // Fallback for browsers without the Popover API.
    document.documentElement.classList.add('no-popover');
    const setOpen = open => {
      panel.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
      if (open) place();
    };
    btn.addEventListener('click', () => setOpen(!panel.classList.contains('is-open')));
    document.addEventListener('pointerdown', e => {
      if (!panel.contains(e.target) && !btn.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', e => e.key === 'Escape' && setOpen(false));
  }
}

function setupHourlyScroll() {
  const list = $('hourlyList');
  const go = dir => list.scrollBy({ left: dir * list.clientWidth * 0.8, behavior: motion.matches ? 'auto' : 'smooth' });
  $('hourPrev').addEventListener('click', () => go(-1));
  $('hourNext').addEventListener('click', () => go(1));
  list.addEventListener('scroll', updateHourlyButtons, { passive: true });
  new ResizeObserver(updateHourlyButtons).observe(list);
}

function updateHourlyButtons() {
  const list = $('hourlyList');
  $('hourPrev').disabled = list.scrollLeft <= 2;
  $('hourNext').disabled = list.scrollLeft >= list.scrollWidth - list.clientWidth - 2;
}

function setupTopbar() {
  const bar = $('topbar');
  new IntersectionObserver(([entry]) => bar.classList.toggle('is-scrolled', !entry.isIntersecting)).observe($('scrollSentinel'));
  new IntersectionObserver(
    ([entry]) => bar.classList.toggle('is-compact', !entry.isIntersecting && entry.boundingClientRect.top < 80),
    { rootMargin: '-80px 0px 0px 0px' },
  ).observe($('tempNow'));
}

let heroStarted = false;
let heroScheduled = false;

/** Start the 3D hero on first interaction, or after 4 s on its own. */
function scheduleHero3D() {
  if (heroScheduled || heroStarted) return;
  heroScheduled = true;
  let timer = 0;
  const start = () => {
    clearTimeout(timer);
    removeEventListener('pointermove', start);
    removeEventListener('scroll', start);
    removeEventListener('touchstart', start);
    if ('requestIdleCallback' in window) requestIdleCallback(() => loadHero3D(), { timeout: 2000 });
    else setTimeout(loadHero3D, 250);
  };
  timer = setTimeout(start, 4000);
  addEventListener('pointermove', start, { passive: true });
  addEventListener('scroll', start, { passive: true });
  addEventListener('touchstart', start, { passive: true });
}

async function loadHero3D() {
  if (heroStarted) return;
  heroStarted = true;
  const canvas = $('heroCanvas');
  // Three.js needs WebGL 2. Check first so unsupported devices skip the download entirely.
  let gl = null;
  try {
    gl = canvas.getContext('webgl2', { alpha: true, antialias: true, depth: true, stencil: false, powerPreference: 'low-power' });
  } catch {
    gl = null;
  }
  if (!gl) return;
  try {
    const { createHeroScene } = await import('./scene3d.js');
    const scene = await createHeroScene(canvas, {
      context: gl,
      pointer,
      reducedMotion: motion.matches,
      onContextLost: () => document.body.classList.remove('has-3d'),
    });
    if (!scene) return;
    state.scene = scene;
    if (state.model) {
      const c = state.model.current;
      await scene.setCondition(condition(c.code, c.isDay).kind, c.isDay);
    }
    document.body.classList.add('has-3d');
  } catch (err) {
    console.info('3D hero unavailable; using the 2D icon.', err);
  }
}

/* ---------- Feedback ---------- */

function updateURL(place) {
  const url = new URL(location.href);
  for (const k of ['lat', 'lon', 'name', 'region', 'country', 'city']) url.searchParams.delete(k);
  if (place.source !== 'geo' && place.source !== 'default') {
    url.searchParams.set('lat', Number(place.lat).toFixed(4));
    url.searchParams.set('lon', Number(place.lon).toFixed(4));
    url.searchParams.set('name', place.name);
    if (place.admin1) url.searchParams.set('region', place.admin1);
    if (place.country) url.searchParams.set('country', place.country);
  }
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function showError(err) {
  document.body.classList.remove('is-loading');
  document.body.classList.add('has-error');
  $('errorText').textContent = err?.offline
    ? "You're offline and there's no saved forecast for this place yet."
    : err?.message || 'Something went wrong.';
  $('errorCard').hidden = false;
}

function showBanner(text) {
  $('bannerText').textContent = text;
  $('banner').hidden = false;
}

function hideBanner() {
  $('banner').hidden = true;
}

let toastTimer = 0;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 3800);
}

function registerServiceWorker() {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!('serviceWorker' in navigator) || (location.protocol !== 'https:' && !local)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.info('Offline support unavailable.', err));
  });
}
