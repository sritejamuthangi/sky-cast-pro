/**
 * WMO weather codes (as used by Open-Meteo) mapped to plain-language labels,
 * a "kind" that drives the 3D scene and sky, and Meteocons icon names.
 */

const W = (label, kind, dayIcon, nightIcon = dayIcon) => ({ label, kind, dayIcon, nightIcon });

const CODES = {
  0: W('Clear', 'clear', 'clear-day', 'clear-night'),
  1: W('Mostly Clear', 'partly', 'partly-cloudy-day', 'partly-cloudy-night'),
  2: W('Partly Cloudy', 'partly', 'partly-cloudy-day', 'partly-cloudy-night'),
  3: W('Overcast', 'cloudy', 'overcast'),
  45: W('Fog', 'fog', 'fog-day', 'fog-night'),
  48: W('Freezing Fog', 'fog', 'fog'),
  51: W('Light Drizzle', 'drizzle', 'partly-cloudy-day-drizzle', 'partly-cloudy-night-drizzle'),
  53: W('Drizzle', 'drizzle', 'drizzle'),
  55: W('Heavy Drizzle', 'drizzle', 'drizzle'),
  56: W('Freezing Drizzle', 'sleet', 'sleet'),
  57: W('Freezing Drizzle', 'sleet', 'sleet'),
  61: W('Light Rain', 'rain', 'partly-cloudy-day-rain', 'partly-cloudy-night-rain'),
  63: W('Rain', 'rain', 'rain'),
  65: W('Heavy Rain', 'heavy-rain', 'rain'),
  66: W('Freezing Rain', 'sleet', 'sleet'),
  67: W('Freezing Rain', 'sleet', 'sleet'),
  71: W('Light Snow', 'snow', 'partly-cloudy-day-snow', 'partly-cloudy-night-snow'),
  73: W('Snow', 'snow', 'snow'),
  75: W('Heavy Snow', 'snow', 'snow'),
  77: W('Snow Grains', 'snow', 'snow'),
  80: W('Light Showers', 'rain', 'partly-cloudy-day-rain', 'partly-cloudy-night-rain'),
  81: W('Showers', 'rain', 'rain'),
  82: W('Heavy Showers', 'heavy-rain', 'rain'),
  85: W('Snow Showers', 'snow', 'partly-cloudy-day-snow', 'partly-cloudy-night-snow'),
  86: W('Heavy Snow Showers', 'snow', 'snow'),
  95: W('Thunderstorms', 'storm', 'thunderstorms-day-rain', 'thunderstorms-night-rain'),
  96: W('Thunderstorms with Hail', 'storm', 'thunderstorms-rain'),
  99: W('Thunderstorms with Hail', 'storm', 'thunderstorms-rain'),
};

const UNKNOWN = W('Unknown', 'cloudy', 'not-available');

export function condition(code, isDay = true) {
  const c = CODES[code] ?? UNKNOWN;
  return { label: c.label, kind: c.kind, icon: isDay ? c.dayIcon : c.nightIcon };
}

export const iconSrc = (name, animated = false) => `assets/weather/${animated ? 'anim' : 'static'}/${name}.svg`;

export const isSnowCode = code => (code >= 71 && code <= 77) || code === 85 || code === 86;
export const isStormCode = code => code >= 95;
/** Any precipitation: drizzle, rain, snow, showers or thunderstorms. */
export const isWetCode = code => code >= 51 && code <= 99;

/** Broad family used to pick sky colors. */
export function skyGroup(kind) {
  switch (kind) {
    case 'clear':
    case 'partly':
      return 'clear';
    case 'cloudy':
    case 'fog':
      return 'cloudy';
    case 'snow':
      return 'snow';
    case 'storm':
      return 'storm';
    default:
      return 'rain';
  }
}

/** Time-of-day phase from the city's sunrise/sunset (all in wall-clock ms). */
export function skyPhase(nowW, day, isDay) {
  if (!day?.sunrise || !day?.sunset) return isDay ? 'day' : 'night';
  if (day.daylight != null && day.daylight < 60) return 'night'; // polar night
  if (day.daylight != null && day.daylight > 86_300) return 'day'; // midnight sun
  const m = 60_000;
  if (nowW < day.sunrise - 45 * m || nowW > day.sunset + 45 * m) return 'night';
  if (nowW < day.sunrise + 45 * m) return 'dawn';
  if (nowW > day.sunset - 60 * m) return 'dusk';
  return 'day';
}

export const UV_LEVELS = [
  { max: 2.99, label: 'Low' },
  { max: 5.99, label: 'Moderate' },
  { max: 7.99, label: 'High' },
  { max: 10.99, label: 'Very High' },
  { max: Infinity, label: 'Extreme' },
];
export const uvCategory = uv => UV_LEVELS.find(l => (uv ?? 0) <= l.max);

export const AQI_LEVELS = [
  { max: 50, label: 'Good', advice: 'Air quality is great. A good day to be outside or air out your home.' },
  { max: 100, label: 'Moderate', advice: 'Acceptable for most people. Unusually sensitive people may want to limit long outdoor exertion.' },
  { max: 150, label: 'Unhealthy for sensitive groups', advice: 'Children, older adults and people with asthma or heart conditions should take it easier outdoors.' },
  { max: 200, label: 'Unhealthy', advice: 'Everyone should reduce long or intense activity outdoors.' },
  { max: 300, label: 'Very unhealthy', advice: 'Avoid strenuous activity outside and keep windows closed.' },
  { max: Infinity, label: 'Hazardous', advice: 'Stay indoors and keep activity levels low.' },
];
export const aqiCategory = aqi => AQI_LEVELS.find(l => aqi <= l.max);

/** Why "feels like" differs from the thermometer. Shared by the tile and the tips. */
export function feelsReason(c) {
  const gap = (c.feels ?? c.temp) - c.temp;
  if (gap <= -1.5) return c.wind >= 8 ? 'wind' : 'damp';
  if (gap >= 1.5) return c.humidity >= 55 ? 'humidity' : 'sun';
  return 'same';
}

/** Plain-language comfort from dew point (°C) and relative humidity. */
export function humidityFeel(dew, humidity) {
  if (dew == null) return '';
  if (dew >= 21) return 'Very humid and muggy.';
  if (dew >= 18) return 'Humid and sticky.';
  if (dew >= 13) return 'Comfortable, if a little humid.';
  if (humidity >= 80) return 'Damp, chilly air.';
  if (humidity <= 30) return 'The air is dry.';
  return 'Comfortable.';
}

export function beaufort(kmh) {
  const scale = [
    [1, 'Calm'], [6, 'Light air'], [12, 'Light breeze'], [20, 'Gentle breeze'], [29, 'Moderate breeze'],
    [39, 'Fresh breeze'], [50, 'Strong breeze'], [62, 'Near gale'], [75, 'Gale'], [89, 'Strong gale'],
    [103, 'Storm'], [118, 'Violent storm'], [Infinity, 'Hurricane-force wind'],
  ];
  return scale.find(([max]) => (kmh ?? 0) < max)[1];
}
