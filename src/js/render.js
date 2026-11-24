/**
 * DOM rendering for the hero, hourly strip, 10-day list, detail tiles,
 * tips and saved-city chips. Any text from APIs is escaped.
 */
import { aqiCategory, beaufort, condition, feelsReason, humidityFeel, iconSrc, uvCategory } from './conditions.js';
import {
  clamp, compassWord, DAY, distance, duration, esc, formatHour, formatHourRange, formatLongDate,
  formatTime, formatWeekday, HOUR, precip, pressure, sameDay, speed, speedText, temp, toTempUnit,
} from './format.js';
import { nowIndex, today } from './model.js';
import { placeKey } from './storage.js';

const $ = id => document.getElementById(id);

export const uiIcon = name => `<svg class="i" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

const weatherImg = (name, { size = 40, alt = '', animated = false } = {}) =>
  `<img src="${iconSrc(name, animated)}" alt="${esc(alt)}" width="${size}" height="${size}" decoding="async" draggable="false">`;

const tileTitle = (icon, text) => `<h3 class="card-title">${uiIcon(icon)}${text}</h3>`;

/* ---------- Hero ---------- */

let shownTemp = null;
let tempFrame = 0;

export function renderHero({ model, place, prefs, nowW, isSaved, summary, animated }) {
  const c = model.current;
  const day = today(model, nowW);
  const cond = condition(c.code, c.isDay);

  $('placeName').textContent = place.name;
  $('placeBadge').hidden = place.source !== 'geo';
  $('placeRegion').textContent = [place.admin1, place.country].filter(x => x && x !== place.name).join(', ');
  renderClock({ prefs, nowW });

  setTemp(Math.round(toTempUnit(c.temp, prefs.temp)), animated);
  $('conditionNow').textContent = cond.label;
  $('hiloNow').innerHTML =
    `<span>H: ${temp(day.max, prefs.temp)}</span><span>L: ${temp(day.min, prefs.temp)}</span>` +
    `<span>Feels like ${temp(c.feels, prefs.temp)}</span>`;
  $('summaryNow').textContent = summary;

  const icon = $('heroIcon');
  const src = iconSrc(cond.icon, animated);
  if (icon.getAttribute('src') !== src) icon.setAttribute('src', src);
  icon.alt = cond.label;

  const save = $('saveBtn');
  const label = isSaved ? `Remove ${place.name} from saved cities` : `Save ${place.name}`;
  save.setAttribute('aria-pressed', String(isSaved));
  save.setAttribute('aria-label', label);
  save.title = label;
}

export function renderClock({ prefs, nowW }) {
  $('placeTime').textContent = `${formatLongDate(nowW)} · ${formatTime(nowW, prefs.clock)}`;
}

export function renderMini({ model, place, prefs }) {
  $('miniSummary').textContent = `${temp(model.current.temp, prefs.temp)} · ${place.name}`;
}

function setTemp(value, animated) {
  const el = $('tempNow');
  el.setAttribute('aria-label', `${value} degrees`);
  cancelAnimationFrame(tempFrame);
  const from = shownTemp;
  shownTemp = value;
  if (from == null || from === value || !animated) {
    el.textContent = `${value}°`;
    return;
  }
  const start = performance.now();
  const step = now => {
    const k = Math.min(1, (now - start) / 700);
    const eased = 1 - (1 - k) ** 3;
    el.textContent = `${Math.round(from + (value - from) * eased)}°`;
    if (k < 1) tempFrame = requestAnimationFrame(step);
  };
  tempFrame = requestAnimationFrame(step);
}

/* ---------- Hourly ---------- */

let hourlyPlace = '';

export function renderHourly({ model, place, prefs, nowW }) {
  const list = $('hourlyList');
  const i0 = nowIndex(model.hours, nowW);
  const hours = model.hours.slice(i0, i0 + 25);
  if (!hours.length) {
    list.innerHTML = '';
    return;
  }
  const end = hours.at(-1).t;
  const items = hours.map((h, k) => ({ t: h.t, h, now: k === 0 }));
  for (const d of model.days) {
    for (const [t, kind] of [[d.sunrise, 'sunrise'], [d.sunset, 'sunset']]) {
      if (t && t > nowW && t < end) items.push({ t, kind });
    }
  }
  items.sort((a, b) => a.t - b.t);

  const html = items.map(item => {
    if (item.kind) {
      const label = item.kind === 'sunrise' ? 'Sunrise' : 'Sunset';
      return `<li class="hour hour--event"><span class="hour-time">${formatTime(item.t, prefs.clock)}</span>` +
        `${weatherImg(item.kind, { size: 42 })}<span class="hour-pop"></span><span class="hour-temp">${label}</span></li>`;
    }
    const { h, now } = item;
    const cond = condition(now ? model.current.code : h.code, now ? model.current.isDay : h.isDay);
    const pop = h.pop >= 20 ? Math.round(h.pop / 10) * 10 : 0;
    return `<li class="hour${now ? ' is-now' : ''}">` +
      `<span class="hour-time">${now ? 'Now' : formatHour(h.t, prefs.clock)}</span>` +
      weatherImg(cond.icon, { size: 42, alt: cond.label }) +
      `<span class="hour-pop">${pop ? `${pop}%<span class="sr-only"> chance of precipitation</span>` : ''}</span>` +
      `<span class="hour-temp">${temp(now ? model.current.temp : h.temp, prefs.temp)}</span></li>`;
  }).join('');

  const key = placeKey(place);
  const keep = key === hourlyPlace ? list.scrollLeft : 0;
  list.innerHTML = html;
  list.scrollLeft = keep;
  hourlyPlace = key;
}

/* ---------- 10-day ---------- */

const TEMP_STOPS = [
  [-20, [167, 139, 250]], [-10, [129, 140, 248]], [0, [96, 165, 250]], [8, [56, 189, 248]], [14, [52, 211, 153]],
  [20, [163, 230, 53]], [25, [250, 204, 21]], [30, [251, 146, 60]], [35, [248, 113, 113]], [42, [225, 29, 72]],
];
const rgb = arr => `rgb(${arr.map(v => Math.round(v)).join(' ')})`;

function tempColor(c) {
  if (c <= TEMP_STOPS[0][0]) return rgb(TEMP_STOPS[0][1]);
  for (let i = 1; i < TEMP_STOPS.length; i++) {
    const [t1, c1] = TEMP_STOPS[i];
    if (c <= t1) {
      const [t0, c0] = TEMP_STOPS[i - 1];
      const k = (c - t0) / (t1 - t0);
      return rgb(c0.map((v, j) => v + (c1[j] - v) * k));
    }
  }
  return rgb(TEMP_STOPS.at(-1)[1]);
}

function tempGradient(lo, hi) {
  const n = 6;
  const stops = Array.from({ length: n + 1 }, (_, k) => `${tempColor(lo + ((hi - lo) * k) / n)} ${Math.round((k / n) * 100)}%`);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

export function renderDaily({ model, prefs, nowW }) {
  const list = $('dailyList');
  const start = Math.floor(nowW / DAY) * DAY;
  const days = model.days.filter(d => d.t >= start).slice(0, 10);
  if (!days.length) {
    list.innerHTML = '';
    return;
  }
  const lo = Math.min(...days.map(d => d.min));
  const hi = Math.max(...days.map(d => d.max));
  const span = Math.max(hi - lo, 1);
  const pct = v => `${(clamp((v - lo) / span, 0, 1) * 100).toFixed(1)}%`;
  list.style.setProperty('--temp-gradient', tempGradient(lo, hi));

  list.innerHTML = days.map((d, i) => {
    const cond = condition(d.code, true);
    const pop = d.popMax >= 20 ? Math.round(d.popMax / 10) * 10 : 0;
    const dot = i === 0 && model.current.temp != null
      ? `<span class="range-dot" style="--now:${pct(clamp(model.current.temp, d.min, d.max))}"></span>`
      : '';
    return `<li class="day">` +
      `<span class="day-name">${i === 0 ? 'Today' : formatWeekday(d.t)}</span>` +
      `<span class="day-icon">${weatherImg(cond.icon, { size: 36, alt: cond.label })}` +
      `${pop ? `<small class="day-pop">${pop}%<span class="sr-only"> chance of precipitation</span></small>` : ''}</span>` +
      `<span class="day-min"><span class="sr-only">Low </span>${temp(d.min, prefs.temp)}</span>` +
      `<span class="range" aria-hidden="true" style="--a:${pct(d.min)};--b:${pct(d.max)}"><span class="range-fill"></span>${dot}</span>` +
      `<span class="day-max"><span class="sr-only">High </span>${temp(d.max, prefs.temp)}</span></li>`;
  }).join('');
}

/* ---------- Detail tiles ---------- */

export function renderTiles(ctx) {
  $('tileAqi').innerHTML = aqiTile(ctx);
  $('tileUv').innerHTML = uvTile(ctx);
  $('tileWind').innerHTML = windTile(ctx);
  $('tileSun').innerHTML = sunTile(ctx);
  $('tileFeels').innerHTML = feelsTile(ctx);
  $('tileHumidity').innerHTML = humidityTile(ctx);
  $('tilePrecip').innerHTML = precipTile(ctx);
  $('tileVisibility').innerHTML = visibilityTile(ctx);
  $('tilePressure').innerHTML = pressureTile(ctx);
}

function uvTile({ model, prefs, nowW }) {
  const uv = model.current.uv ?? 0;
  const i0 = nowIndex(model.hours, nowW);
  const protect = model.hours.slice(i0, i0 + 14).filter(h => h.isDay && h.uv >= 3 && sameDay(h.t, nowW));
  let foot;
  if (protect.length) {
    foot = `Use sun protection ${formatHourRange(protect[0].t, protect.at(-1).t + HOUR, prefs.clock)}.`;
  } else if (model.current.isDay) {
    foot = 'Low for the rest of the day.';
  } else {
    const next = model.days.find(d => d.t > nowW);
    foot = !next || next.uvMax < 3
      ? 'Low tomorrow too. No sun protection needed.'
      : `Tomorrow peaks at ${Math.round(next.uvMax)} (${uvCategory(next.uvMax).label.toLowerCase()}) around midday.`;
  }
  return tileTitle('sun', 'UV index') +
    `<div class="tile-value">${Math.round(uv)}</div><div class="tile-sub">${uvCategory(uv).label}</div>` +
    `<div class="meter meter--uv" aria-hidden="true"><span class="meter-dot" style="--p:${((Math.min(uv, 11) / 11) * 100).toFixed(1)}%"></span></div>` +
    `<p class="tile-foot">${foot}</p>`;
}

function aqiTile({ model }) {
  const aq = model.aq;
  if (!aq) {
    return tileTitle('leaf', 'Air quality') + `<p class="tile-empty">Air quality data isn't available for this location right now.</p>`;
  }
  const cat = aqiCategory(aq.aqi);
  const p = aq.aqi <= 200 ? (aq.aqi / 200) * 66.7 : 66.7 + ((Math.min(aq.aqi, 400) - 200) / 200) * 33.3;
  const fmt = v => (v == null ? '--' : v < 10 ? v.toFixed(1) : Math.round(v));
  return tileTitle('leaf', 'Air quality') +
    `<div class="aq"><div><div class="tile-value">${Math.round(aq.aqi)}</div><div class="tile-sub">${cat.label}</div></div>` +
    `<p class="aq-advice">${cat.advice}</p></div>` +
    `<div class="meter meter--aqi" aria-hidden="true"><span class="meter-dot" style="--p:${p.toFixed(1)}%"></span></div>` +
    `<p class="tile-foot">US AQI · PM2.5 ${fmt(aq.pm25)} µg/m³ · PM10 ${fmt(aq.pm10)} µg/m³</p>`;
}

function windTile({ model, prefs }) {
  const c = model.current;
  const dir = c.windDir ?? 0;
  const s = speed(c.wind, prefs.wind);
  const gust = c.gust != null ? ` Gusts up to ${speedText(c.gust, prefs.wind)}.` : '';
  const from = (c.wind ?? 0) < 1 ? '' : ` from the ${compassWord(dir)}`;
  return tileTitle('wind', 'Wind') + compassSvg(dir, s) +
    `<p class="tile-foot">${beaufort(c.wind)}${from}.${gust}</p>`;
}

function compassSvg(dir, s) {
  const f = v => v.toFixed(1);
  let ticks = '';
  for (let i = 0; i < 60; i++) {
    const a = (i * 6 * Math.PI) / 180;
    const major = i % 15 === 0;
    const r2 = major ? 45 : i % 5 === 0 ? 48 : 50;
    ticks += `<line class="tick${major ? ' tick--major' : ''}" x1="${f(60 + 54 * Math.sin(a))}" y1="${f(60 - 54 * Math.cos(a))}" x2="${f(60 + r2 * Math.sin(a))}" y2="${f(60 - r2 * Math.cos(a))}"/>`;
  }
  const letters = [['N', 60, 33], ['E', 87, 60], ['S', 60, 87], ['W', 33, 60]]
    .map(([l, x, y]) => `<text class="compass-letter" x="${x}" y="${y}">${l}</text>`).join('');
  // Meteorological direction is where the wind comes FROM; the arrow points where it blows.
  const rot = (dir + 180) % 360;
  return `<svg class="compass" viewBox="0 0 120 120" aria-hidden="true">${ticks}${letters}` +
    `<g class="compass-arrow" transform="rotate(${rot} 60 60)"><line x1="60" y1="106" x2="60" y2="22"/>` +
    `<path d="M60 12 L67 26 L53 26 Z"/><circle cx="60" cy="106" r="3.6"/></g>` +
    `<circle class="compass-hub" cx="60" cy="60" r="19"/>` +
    `<text class="compass-speed" x="60" y="62">${s.value}</text><text class="compass-unit" x="60" y="72">${s.unit}</text></svg>`;
}

function sunTile({ model, prefs, nowW }) {
  const d0 = today(model, nowW);
  const d1 = model.days.find(d => d.t > d0.t);
  if (d0.daylight != null && d0.daylight < 60) {
    return tileTitle('sunrise', 'Sun') + `<div class="tile-value">Polar night</div><p class="tile-foot">The sun stays below the horizon today.</p>`;
  }
  if (d0.daylight != null && d0.daylight > 86_300) {
    return tileTitle('sun', 'Sun') + `<div class="tile-value">Midnight sun</div><p class="tile-foot">The sun stays above the horizon all day.</p>`;
  }
  let label;
  let at;
  if (nowW < d0.sunrise) [label, at] = ['Sunrise', d0.sunrise];
  else if (nowW < d0.sunset) [label, at] = ['Sunset', d0.sunset];
  else [label, at] = ['Sunrise', d1?.sunrise ?? d0.sunrise + DAY];
  const other = label === 'Sunset' ? `Sunrise ${formatTime(d0.sunrise, prefs.clock)}` : `Sunset ${formatTime(d0.sunset, prefs.clock)}`;
  return tileTitle(label === 'Sunrise' ? 'sunrise' : 'sunset', label) +
    `<div class="tile-value">${formatTime(at, prefs.clock)}</div>${sunArc(d0, nowW)}` +
    `<p class="tile-foot">${other} · ${duration(d0.daylight)} of daylight</p>`;
}

function sunArc(d, nowW) {
  const W = 200;
  const base = 52;
  const dayLen = d.sunset - d.sunrise;
  const nightLen = DAY - dayLen;
  const y = t => {
    if (t >= d.sunrise && t <= d.sunset) return base - 40 * Math.sin((Math.PI * (t - d.sunrise)) / dayLen);
    const since = t > d.sunset ? t - d.sunset : t - (d.sunset - DAY);
    return base + 16 * Math.sin((Math.PI * since) / nightLen);
  };
  const pts = [];
  for (let i = 0; i <= 96; i++) pts.push(`${((i / 96) * W).toFixed(1)},${y(d.t + (i / 96) * DAY).toFixed(1)}`);
  const nx = clamp((nowW - d.t) / DAY, 0, 1) * W;
  const ny = y(nowW);
  return `<svg class="sun-arc" viewBox="0 0 ${W} 76" aria-hidden="true">` +
    `<defs><clipPath id="sunAbove"><rect x="-10" y="-10" width="${W + 20}" height="${base + 10}"/></clipPath>` +
    `<linearGradient id="sunStroke" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#ffab40"/></linearGradient></defs>` +
    `<polyline class="sun-path" points="${pts.join(' ')}"/>` +
    `<polyline class="sun-path sun-path--day" clip-path="url(#sunAbove)" points="${pts.join(' ')}"/>` +
    `<line class="sun-horizon" x1="0" x2="${W}" y1="${base}" y2="${base}"/>` +
    `<circle class="sun-dot${ny > base ? ' is-below' : ''}" cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="5.5"/></svg>`;
}

const FEELS_TEXT = {
  wind: 'Wind is making it feel colder.',
  damp: 'Damp air is making it feel colder.',
  humidity: 'Humidity is making it feel warmer.',
  sun: 'Sunshine is making it feel warmer.',
  same: 'Similar to the actual temperature.',
};

function feelsTile({ model, prefs }) {
  const c = model.current;
  const foot = FEELS_TEXT[feelsReason(c)];
  return tileTitle('thermometer', 'Feels like') +
    `<div class="tile-value">${temp(c.feels, prefs.temp)}</div><div class="tile-sub tile-sub--muted">Actual ${temp(c.temp, prefs.temp)}</div>` +
    `<p class="tile-foot">${foot}</p>`;
}

function humidityTile({ model, prefs }) {
  const c = model.current;
  return tileTitle('droplet', 'Humidity') +
    `<div class="tile-value">${Math.round(c.humidity ?? 0)}%</div>` +
    `<div class="meter meter--humidity" aria-hidden="true"><span class="meter-fill" style="--p:${Math.round(c.humidity ?? 0)}%"></span></div>` +
    `<p class="tile-foot">The dew point is ${temp(c.dew, prefs.temp)} right now. ${humidityFeel(c.dew, c.humidity)}</p>`;
}

function precipTile({ model, prefs, nowW }) {
  const i0 = nowIndex(model.hours, nowW);
  // Hourly precipitation is the total for the preceding hour.
  const sum = list => list.reduce((s, h) => s + (h.precip || 0), 0);
  const next = sum(model.hours.slice(i0 + 1, i0 + 25));
  const past = sum(model.hours.slice(Math.max(0, i0 - 23), i0 + 1));
  const n = precip(next, prefs.temp);
  let foot;
  if (next >= 0.1) {
    const p = precip(past, prefs.temp);
    foot = `${p.value} ${p.unit} fell in the last 24 hours.`;
  } else {
    const wetDay = model.days.find(d => d.t > nowW && d.precipSum >= 1);
    foot = wetDay
      ? `Next expected: ${formatWeekday(wetDay.t)}, about ${precip(wetDay.precipSum, prefs.temp).value} ${n.unit}.`
      : 'None expected in the next 10 days.';
  }
  return tileTitle('umbrella', 'Precipitation') +
    `<div class="tile-value">${n.value}<small> ${n.unit}</small></div><div class="tile-sub tile-sub--muted">Next 24 hours</div>` +
    `<p class="tile-foot">${foot}</p>`;
}

function visibilityTile({ model, prefs }) {
  const v = model.current.visibility;
  const d = distance(v, prefs.temp);
  const km = (v ?? 0) / 1000;
  const foot = v == null ? 'Not available right now.'
    : km >= 20 ? 'Perfectly clear view.'
      : km >= 10 ? 'Clear view.'
        : km >= 5 ? 'Light haze.'
          : km >= 2 ? 'Haze is reducing visibility.'
            : km >= 1 ? 'Mist. Take care on the roads.'
              : 'Fog. Drive slowly and use low beams.';
  return tileTitle('eye', 'Visibility') + `<div class="tile-value">${d.value}<small> ${d.unit}</small></div><p class="tile-foot">${foot}</p>`;
}

function pressureTile({ model, prefs, nowW }) {
  const c = model.current;
  const i0 = nowIndex(model.hours, nowW);
  const before = model.hours[i0 - 3]?.pressure;
  const delta = before != null && c.pressure != null ? c.pressure - before : 0;
  const trend = delta > 1 ? 'Rising' : delta < -1 ? 'Falling' : 'Steady';
  const note = trend === 'Rising'
    ? 'Rising pressure usually brings settled weather.'
    : trend === 'Falling'
      ? 'Falling pressure can mean unsettled weather is on the way.'
      : 'No big change in the last few hours.';
  return tileTitle('gauge', 'Pressure') + gaugeSvg(c.pressure, pressure(c.pressure, prefs.temp), trend) +
    `<p class="tile-foot">${trend}. ${note}</p>`;
}

function gaugeSvg(hpa, p, trend) {
  const f = v => v.toFixed(1);
  const min = 970;
  const max = 1050;
  const start = 135;
  const sweep = 270;
  let ticks = '';
  for (let i = 0; i <= 40; i++) {
    const a = ((start + (sweep * i) / 40) * Math.PI) / 180;
    const major = i % 5 === 0;
    ticks += `<line class="tick${major ? ' tick--major' : ''}" x1="${f(60 + 52 * Math.cos(a))}" y1="${f(60 + 52 * Math.sin(a))}" x2="${f(60 + (major ? 44 : 47) * Math.cos(a))}" y2="${f(60 + (major ? 44 : 47) * Math.sin(a))}"/>`;
  }
  const k = clamp(((hpa ?? 1013) - min) / (max - min), 0, 1);
  const a = ((start + sweep * k) * Math.PI) / 180;
  const arrow = trend === 'Rising' ? '↑' : trend === 'Falling' ? '↓' : '=';
  return `<svg class="gauge" viewBox="0 0 120 108" aria-hidden="true">${ticks}` +
    `<line class="gauge-needle" x1="${f(60 + 56 * Math.cos(a))}" y1="${f(60 + 56 * Math.sin(a))}" x2="${f(60 + 41 * Math.cos(a))}" y2="${f(60 + 41 * Math.sin(a))}"/>` +
    `<text class="gauge-arrow" x="60" y="52">${arrow}</text><text class="gauge-value" x="60" y="70">${p.value}</text>` +
    `<text class="gauge-unit" x="60" y="83">${p.unit}</text></svg>`;
}

/* ---------- Tips ---------- */

export function renderInsights(tips, { animated }) {
  $('tipsList').innerHTML = tips.map(t =>
    `<li class="tip tip--${t.tone}">${weatherImg(t.icon, { size: 46, animated })}` +
    `<div><p class="tip-title">${esc(t.title)}</p><p class="tip-text">${esc(t.text)}</p></div></li>`).join('');
}

/* ---------- Saved cities ---------- */

export function renderSaved({ saved, currentKey, temps, prefs }) {
  const list = $('savedList');
  if (!saved.length) {
    list.innerHTML = `<li class="saved-empty">${uiIcon('star')}Star a city to pin it here for quick access.</li>`;
    return;
  }
  list.innerHTML = saved.map(p => {
    const key = placeKey(p);
    const cur = temps.get(key);
    const cond = cur ? condition(cur.code, cur.isDay) : null;
    const active = key === currentKey;
    return `<li class="chip-item"><button type="button" class="chip${active ? ' is-active' : ''}${cond ? '' : ' chip--plain'}" data-key="${key}"${active ? ' aria-current="true"' : ''}>` +
      `${cond ? weatherImg(cond.icon, { size: 30, alt: cond.label }) : ''}<span class="chip-name">${esc(p.name)}</span>` +
      `${cur ? `<span class="chip-temp">${temp(cur.temp, prefs.temp)}</span>` : ''}</button>` +
      `<button type="button" class="chip-remove" data-remove="${key}" aria-label="Remove ${esc(p.name)} from saved cities">${uiIcon('x')}</button></li>`;
  }).join('');
}
