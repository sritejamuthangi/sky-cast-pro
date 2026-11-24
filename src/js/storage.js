/**
 * Persistence: preferences, saved cities, recent searches and a small
 * cache of recent forecasts (so the app opens instantly and works offline).
 * Falls back to memory when localStorage is unavailable (e.g. private mode).
 */

const NS = 'skycast:';
const memory = new Map();

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(NS + key);
    if (raw != null) return JSON.parse(raw);
  } catch {
    /* fall through to memory */
  }
  return memory.has(key) ? memory.get(key) : fallback;
}

function write(key, value) {
  memory.set(key, value);
  try {
    localStorage.setItem(NS + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const placeKey = p => `${Number(p.lat).toFixed(2)},${Number(p.lon).toFixed(2)}`;

export const slimPlace = ({ name, admin1 = '', country = '', lat, lon, source = 'search' }) => ({
  name,
  admin1,
  country,
  lat: Number(Number(lat).toFixed(4)),
  lon: Number(Number(lon).toFixed(4)),
  source,
});

/* ---------- Preferences ---------- */

const IMPERIAL = ['US', 'LR', 'MM', 'PR', 'GU', 'VI', 'AS', 'MP', 'BS', 'BZ', 'KY', 'PW', 'FM', 'MH'];
const MPH = [...IMPERIAL, 'GB', 'IM', 'JE', 'GG'];

export function defaultPrefs() {
  let region = '';
  try {
    region = new Intl.Locale(navigator.language || 'en-US').maximize().region || '';
  } catch {
    /* ignore */
  }
  let clock = '24';
  try {
    const hc = new Intl.DateTimeFormat(navigator.language, { hour: 'numeric' }).resolvedOptions().hourCycle;
    clock = hc === 'h11' || hc === 'h12' ? '12' : '24';
  } catch {
    /* ignore */
  }
  return { temp: IMPERIAL.includes(region) ? 'f' : 'c', wind: MPH.includes(region) ? 'mph' : 'kmh', clock };
}

export const getPrefs = () => ({ ...defaultPrefs(), ...read('prefs', {}) });
export const setPrefs = prefs => write('prefs', prefs);

/* ---------- Places ---------- */

export const getSaved = () => read('saved', []);
export const setSaved = list => write('saved', list.slice(0, 12).map(slimPlace));

export const getRecents = () => read('recents', []);
export function addRecent(place) {
  const key = placeKey(place);
  write('recents', [slimPlace(place), ...getRecents().filter(p => placeKey(p) !== key)].slice(0, 5));
}

export const getLastPlace = () => read('last', null);
export const setLastPlace = place => write('last', slimPlace(place));

/* ---------- Forecast cache (newest first, max 8 places) ---------- */

export const cacheGet = key => read('wx', []).find(entry => entry.key === key) || null;

export function cacheSet(key, payload) {
  let list = [{ key, ...payload }, ...read('wx', []).filter(entry => entry.key !== key)].slice(0, 8);
  // Shrink the cache if we hit the storage quota.
  while (!write('wx', list) && list.length > 1) list = list.slice(0, -1);
}
