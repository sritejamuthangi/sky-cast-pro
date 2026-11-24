/**
 * Formatting helpers: units, numbers and timezone-aware times.
 *
 * Open-Meteo returns local wall-clock times for the forecast location
 * (e.g. "2026-11-24T20:00" in Paris). We parse those as if they were UTC so
 * they can be compared with `wallNow(offset)` and always format them with
 * timeZone "UTC". That keeps every time in the city's local time, no matter
 * where the viewer is.
 */

export const LOCALE = navigator.language || 'en-US';

export function parseWall(iso) {
  if (!iso) return null;
  if (iso.length === 10) return Date.parse(`${iso}T00:00:00Z`);
  if (iso.length === 16) return Date.parse(`${iso}:00Z`);
  return Date.parse(`${iso}Z`);
}

export const wallNow = offsetSeconds => Date.now() + offsetSeconds * 1000;

export const HOUR = 3_600_000;
export const DAY = 86_400_000;

export const sameDay = (a, b) => Math.floor(a / DAY) === Math.floor(b / DAY);

const formatters = new Map();
function dtf(options) {
  const key = JSON.stringify(options);
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', ...options });
    formatters.set(key, f);
  }
  return f;
}

const cycle = clock => (clock === '24' ? 'h23' : 'h12');

export const formatTime = (ms, clock) =>
  dtf({ hour: 'numeric', minute: '2-digit', hourCycle: cycle(clock) }).format(ms);

export const formatHour = (ms, clock) =>
  clock === '24'
    ? dtf({ hour: '2-digit', hourCycle: 'h23' }).format(ms)
    : dtf({ hour: 'numeric', hourCycle: 'h12' }).format(ms);

export function formatHourRange(start, end, clock) {
  const f = clock === '24'
    ? dtf({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    : dtf({ hour: 'numeric', hourCycle: 'h12' });
  try {
    return f.formatRange(start, end);
  } catch {
    return `${f.format(start)}–${f.format(end)}`;
  }
}

export const formatWeekday = ms => dtf({ weekday: 'short' }).format(ms);
export const formatWeekdayLong = ms => dtf({ weekday: 'long' }).format(ms);
export const formatLongDate = ms => dtf({ weekday: 'long', month: 'long', day: 'numeric' }).format(ms);

/* ---------- Units ---------- */

export function toTempUnit(c, unit) {
  return unit === 'f' ? (c * 9) / 5 + 32 : c;
}

export function temp(c, unit, withDegree = true) {
  if (c == null || Number.isNaN(c)) return '--';
  const v = Math.round(toTempUnit(c, unit));
  return `${Object.is(v, -0) ? 0 : v}${withDegree ? '°' : ''}`;
}

export const tempDelta = (deltaC, unit) => Math.round(unit === 'f' ? (deltaC * 9) / 5 : deltaC);

export function speed(kmh, unit) {
  if (kmh == null) return { value: '--', unit: '' };
  if (unit === 'mph') return { value: Math.round(kmh * 0.621371), unit: 'mph' };
  if (unit === 'ms') return { value: Math.round(kmh / 3.6), unit: 'm/s' };
  return { value: Math.round(kmh), unit: 'km/h' };
}

export const speedText = (kmh, unit) => {
  const s = speed(kmh, unit);
  return `${s.value} ${s.unit}`;
};

/** Precipitation, visibility and pressure follow the temperature system. */
export function precip(mm, system) {
  if (mm == null) return { value: '--', unit: '' };
  if (system === 'f') {
    const v = mm / 25.4;
    return { value: v === 0 ? '0' : v < 0.01 ? '<0.01' : v.toFixed(2), unit: 'in' };
  }
  return { value: mm === 0 ? '0' : mm < 0.1 ? '<0.1' : mm < 10 ? mm.toFixed(1) : String(Math.round(mm)), unit: 'mm' };
}

export function distance(m, system) {
  if (m == null) return { value: '--', unit: '' };
  const v = system === 'f' ? m / 1609.344 : m / 1000;
  return { value: v < 10 ? v.toFixed(1) : String(Math.round(v)), unit: system === 'f' ? 'mi' : 'km' };
}

export function pressure(hpa, system) {
  if (hpa == null) return { value: '--', unit: '' };
  if (system === 'f') return { value: (hpa * 0.02953).toFixed(2), unit: 'inHg' };
  return { value: String(Math.round(hpa)), unit: 'hPa' };
}

const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const WORDS = [
  'north', 'north-northeast', 'northeast', 'east-northeast', 'east', 'east-southeast', 'southeast', 'south-southeast',
  'south', 'south-southwest', 'southwest', 'west-southwest', 'west', 'west-northwest', 'northwest', 'north-northwest',
];
const point = deg => Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;

export const compass = deg => POINTS[point(deg)];
export const compassWord = deg => WORDS[point(deg)];

export function duration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m === 60 ? `${h + 1}h` : `${h}h ${m}m`;
}

export function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  return rtf.format(-Math.round(s / 86400), 'day');
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ESCAPES[c]);

export const sentence = text => (text ? text[0].toUpperCase() + text.slice(1).toLowerCase() : '');

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
