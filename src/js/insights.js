/**
 * Plain-language guidance derived from the forecast: the hero summary line
 * and "Today's tips" (umbrella, sunscreen, wind, air quality, what to wear...).
 */
import { aqiCategory, condition, feelsReason, isSnowCode, isStormCode, isWetCode, uvCategory } from './conditions.js';
import { formatHour, formatHourRange, HOUR, sameDay, sentence, speedText, temp, tempDelta } from './format.js';
import { nowIndex } from './model.js';

const kindGroup = kind => (kind === 'partly' ? 'clear' : kind);

export function buildSummary({ model, prefs, nowW }) {
  const c = model.current;
  const cur = condition(c.code, c.isDay);
  const i0 = nowIndex(model.hours, nowW);
  const next = model.hours.slice(i0 + 1, i0 + 13);
  const at = h => formatHour(h.t, prefs.clock);
  let text;

  if (isWetCode(c.code)) {
    const stop = next.find(h => !isWetCode(h.code) && h.pop < 40);
    text = stop ? `${cur.label} easing around ${at(stop)}.` : `${cur.label} continuing for the next few hours.`;
  } else {
    const wet = next.find(h => (isWetCode(h.code) && h.pop >= 40) || h.pop >= 60);
    if (wet) {
      const what = isStormCode(wet.code) ? 'Thunderstorms' : isSnowCode(wet.code) ? 'Snow' : 'Rain';
      text = `${what} likely around ${at(wet)}.`;
    } else {
      const change = next.find(h => kindGroup(condition(h.code, h.isDay).kind) !== kindGroup(cur.kind));
      text = change
        ? `${sentence(condition(change.code, change.isDay).label)} conditions from around ${at(change)}.`
        : `${sentence(cur.label)} conditions for the next 12 hours.`;
    }
  }

  const gust = Math.max(0, ...next.map(h => h.gust ?? 0));
  if (gust >= 45) text += ` Gusts up to ${speedText(gust, prefs.wind)}.`;
  return text;
}

export function buildInsights({ model, prefs, nowW }) {
  const tips = [];
  const c = model.current;
  const i0 = nowIndex(model.hours, nowW);
  const next12 = model.hours.slice(i0 + 1, i0 + 13);
  const at = h => formatHour(h.t, prefs.clock);
  const T = v => temp(v, prefs.temp);

  /* Rain, snow and storms */
  if (isWetCode(c.code)) {
    const snow = isSnowCode(c.code);
    const storm = isStormCode(c.code);
    const stop = next12.find(h => !isWetCode(h.code) && h.pop < 40);
    tips.push({
      p: 95,
      tone: 'warn',
      icon: snow ? 'snowflake' : 'umbrella',
      title: storm ? 'Thunderstorms now' : snow ? 'Snowing now' : 'Raining now',
      text: stop
        ? `It should ease off around ${at(stop)}.${storm ? ' Stay indoors while you can hear thunder.' : ''}`
        : 'Expected to continue for the next several hours. Keep an umbrella handy.',
    });
  } else {
    const wet = next12.find(h => (isWetCode(h.code) && h.pop >= 40) || h.pop >= 55);
    if (wet) {
      const snow = isSnowCode(wet.code);
      const storm = isStormCode(wet.code);
      tips.push({
        p: 90,
        tone: 'warn',
        icon: snow ? 'snowflake' : storm ? 'thunderstorms-rain' : 'umbrella',
        title: `${storm ? 'Storms' : snow ? 'Snow' : 'Rain'} likely around ${at(wet)}`,
        text: `${Math.round(wet.pop)}% chance. ${
          snow
            ? 'Roads may be slippery, so allow extra travel time.'
            : storm
              ? 'Plan to be indoors, and avoid open areas if you hear thunder.'
              : 'Take an umbrella if you are heading out.'
        }`,
      });
    } else if (next12.length && next12.every(h => h.pop < 25)) {
      tips.push({
        p: 30,
        tone: 'good',
        icon: c.isDay ? 'clear-day' : 'clear-night',
        title: 'Dry for the next 12 hours',
        text: 'No rain on the way, so you can leave the umbrella at home.',
      });
    }
  }

  /* UV for the rest of today */
  const daylightLeft = model.hours.slice(i0, i0 + 14).filter(h => h.isDay && sameDay(h.t, nowW));
  const strongUv = daylightLeft.filter(h => h.uv >= 6);
  const moderateUv = daylightLeft.filter(h => h.uv >= 3);
  if (strongUv.length) {
    const peak = Math.max(...strongUv.map(h => h.uv));
    tips.push({
      p: 80,
      tone: 'warn',
      icon: 'uv-index',
      title: `${uvCategory(peak).label} UV ${formatHourRange(strongUv[0].t, strongUv.at(-1).t + HOUR, prefs.clock)}`,
      text: 'Wear sunscreen and sunglasses, and look for shade around midday.',
    });
  } else if (moderateUv.length) {
    tips.push({
      p: 45,
      tone: 'info',
      icon: 'uv-index',
      title: `Moderate UV ${formatHourRange(moderateUv[0].t, moderateUv.at(-1).t + HOUR, prefs.clock)}`,
      text: "Sunscreen is a good idea if you'll be outside for a while.",
    });
  }

  /* Feels-like gap */
  const gap = c.feels - c.temp;
  if (Math.abs(gap) >= 3) {
    const n = Math.abs(tempDelta(gap, prefs.temp));
    const reason = feelsReason(c);
    const text = {
      wind: 'The wind is taking the edge off. Add a windproof layer.',
      damp: 'Damp air makes it feel colder. Add a warm layer.',
      humidity: 'Humidity is making it feel warmer. Stay hydrated.',
      sun: 'Strong sunshine is making it feel warmer.',
    }[reason];
    tips.push({
      p: 60,
      tone: 'info',
      icon: gap < 0 ? 'thermometer-colder' : 'thermometer-warmer',
      title: `Feels ${n}° ${gap < 0 ? 'colder' : 'warmer'} than it is`,
      text,
    });
  }

  /* Heat, cold and frost */
  const hottest = Math.max(c.feels ?? -99, ...next12.map(h => h.feels ?? -99));
  const next24 = model.hours.slice(i0, i0 + 25);
  const coldest = Math.min(...next24.map(h => h.temp ?? 99));
  if (hottest >= 32) {
    tips.push({
      p: 85,
      tone: 'warn',
      icon: 'thermometer-warmer',
      title: 'Heat alert',
      text: `It will feel like ${T(hottest)} at the hottest point. Drink water and limit time in direct sun.`,
    });
  } else if (c.feels <= -10) {
    tips.push({
      p: 85,
      tone: 'warn',
      icon: 'thermometer-colder',
      title: 'Bitter cold',
      text: 'Exposed skin can get frostbite quickly. Cover up and keep trips outside short.',
    });
  } else if (coldest <= 0 && c.temp > 0) {
    tips.push({
      p: 70,
      tone: 'warn',
      icon: 'snowflake',
      title: `Frost likely, low of ${T(coldest)}`,
      text: 'Watch for icy patches and protect sensitive plants.',
    });
  }

  /* Wind */
  const gustiest = next12.reduce((best, h) => ((h.gust ?? 0) > (best?.gust ?? 0) ? h : best), null);
  if (gustiest && gustiest.gust >= 50) {
    tips.push({
      p: 75,
      tone: 'warn',
      icon: 'windsock',
      title: `Gusts up to ${speedText(gustiest.gust, prefs.wind)}`,
      text: `Strongest around ${at(gustiest)}. Secure loose items and take care on a bike.`,
    });
  }

  /* Air quality */
  if (model.aq && model.aq.aqi > 100) {
    const cat = aqiCategory(model.aq.aqi);
    tips.push({
      p: model.aq.aqi > 150 ? 88 : 78,
      tone: 'warn',
      icon: 'smoke-particles',
      title: `Air quality: ${cat.label.toLowerCase()}`,
      text: cat.advice,
    });
  }

  /* Best time to be outside */
  const best = bestWindow(next12, model.aq);
  if (best) {
    const parts = [`Feels like ${T(best.feels)}`, best.pop < 20 ? 'dry' : `${best.pop}% chance of rain`];
    if (best.uv >= 6) parts.push('strong sun');
    tips.push({
      p: 50,
      tone: 'good',
      icon: best.isDay ? 'clear-day' : 'clear-night',
      title: `Best time outside: ${formatHourRange(best.start, best.end, prefs.clock)}`,
      text: `${parts.join(', ')}.`,
    });
  }

  /* What to wear */
  const wetSoon = isWetCode(c.code) || next12.slice(0, 8).some(h => h.pop >= 50);
  const sunny = c.isDay && (c.uv ?? 0) >= 3 && kindGroup(condition(c.code).kind) === 'clear';
  tips.push({ p: 40, tone: 'info', icon: 'thermometer', title: 'What to wear', text: wear(c.feels, wetSoon, sunny) });

  return tips.sort((a, b) => b.p - a.p).slice(0, 4);
}

/** The most pleasant two-hour window in the next 12 hours, if there is a good one. */
function bestWindow(hours, aq) {
  if (hours.length < 3 || !hours.some(h => h.isDay)) return null;
  const aqAt = t => aq?.hours.find(x => x.t === t)?.aqi ?? aq?.aqi ?? 0;
  const score = h => {
    let s = 100 - (h.pop ?? 0) * 0.8 - Math.abs((h.feels ?? h.temp) - 20) * 2.4;
    if (h.uv > 5) s -= (h.uv - 5) * 6;
    if ((h.gust ?? 0) > 30) s -= (h.gust - 30) * 0.8;
    const a = aqAt(h.t);
    if (a > 50) s -= (a - 50) * 0.3;
    if (!h.isDay) s -= 30;
    if (isWetCode(h.code)) s -= 25;
    return s;
  };
  let best = null;
  for (let i = 0; i < hours.length - 1; i++) {
    const s = (score(hours[i]) + score(hours[i + 1])) / 2;
    if (!best || s > best.s) best = { s, i };
  }
  if (!best || best.s < 40) return null;
  const a = hours[best.i];
  const b = hours[best.i + 1];
  return {
    start: a.t,
    end: b.t + HOUR,
    isDay: a.isDay || b.isDay,
    feels: ((a.feels ?? a.temp) + (b.feels ?? b.temp)) / 2,
    pop: Math.round(Math.max(a.pop ?? 0, b.pop ?? 0)),
    uv: Math.max(a.uv ?? 0, b.uv ?? 0),
  };
}

function wear(feelsC, wet, sunny) {
  let base;
  if (feelsC <= -10) base = 'A heavy winter coat, hat, gloves and a scarf';
  else if (feelsC <= 0) base = 'A warm coat, hat and gloves';
  else if (feelsC <= 8) base = 'A warm jacket or coat';
  else if (feelsC <= 15) base = 'A light jacket or a sweater';
  else if (feelsC <= 21) base = 'Long sleeves or a light layer';
  else if (feelsC <= 27) base = 'T-shirt weather';
  else base = 'Light, breathable clothes';
  const extras = [];
  if (wet) extras.push('a waterproof layer');
  if (sunny) extras.push('sunglasses');
  return extras.length ? `${base}, plus ${extras.join(' and ')}.` : `${base}.`;
}
