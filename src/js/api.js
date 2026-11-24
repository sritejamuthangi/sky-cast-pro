/**
 * Data sources. All free and keyless, so nothing secret ships to the browser:
 *  - Open-Meteo forecast + air quality + geocoding (https://open-meteo.com, CC BY 4.0)
 *  - BigDataCloud client-side reverse geocoding (names for "My location")
 */

const ENDPOINTS = {
  forecast: 'https://api.open-meteo.com/v1/forecast',
  air: 'https://air-quality-api.open-meteo.com/v1/air-quality',
  geocode: 'https://geocoding-api.open-meteo.com/v1/search',
  reverse: 'https://api.bigdatacloud.net/data/reverse-geocode-client',
};

const LANG = (navigator.language || 'en').slice(0, 2).toLowerCase();

export class ApiError extends Error {
  constructor(message, { status = 0, offline = false } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.offline = offline;
  }
}

async function getJSON(base, params, { signal, timeout = 12_000 } = {}) {
  const url = `${base}?${new URLSearchParams(params)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('Timed out', 'TimeoutError')), timeout);
  const forwardAbort = () => ctrl.abort(signal.reason);
  signal?.addEventListener('abort', forwardAbort, { once: true });

  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const body = await res.json().catch(() => null);
    if (!res.ok || body?.error) {
      throw new ApiError(body?.reason || `The weather service returned an error (${res.status}).`, { status: res.status });
    }
    return body;
  } catch (err) {
    if (signal?.aborted) throw signal.reason ?? err;
    if (err instanceof ApiError) throw err;
    const offline = navigator.onLine === false;
    const timedOut = ctrl.signal.reason?.name === 'TimeoutError';
    throw new ApiError(
      offline
        ? 'You appear to be offline.'
        : timedOut
          ? 'The weather service is taking too long to respond.'
          : "Couldn't reach the weather service.",
      { offline },
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

const CURRENT = [
  'temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day', 'precipitation', 'weather_code',
  'cloud_cover', 'pressure_msl', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'uv_index',
  'visibility', 'dew_point_2m',
];
const HOURLY = [
  'temperature_2m', 'apparent_temperature', 'precipitation_probability', 'precipitation', 'weather_code', 'is_day',
  'uv_index', 'wind_speed_10m', 'wind_gusts_10m', 'pressure_msl',
];
const DAILY = [
  'weather_code', 'temperature_2m_max', 'temperature_2m_min', 'sunrise', 'sunset', 'daylight_duration',
  'uv_index_max', 'precipitation_probability_max', 'precipitation_sum',
];

const coord = v => Number(v).toFixed(4);

/** Current conditions, the past 24 h + next 48 h hourly, and 10 days. Metric units; we convert on screen. */
export function fetchForecast({ lat, lon }, opts) {
  return getJSON(ENDPOINTS.forecast, {
    latitude: coord(lat),
    longitude: coord(lon),
    current: CURRENT.join(','),
    hourly: HOURLY.join(','),
    daily: DAILY.join(','),
    timezone: 'auto',
    forecast_days: 10,
    past_hours: 24,
    forecast_hours: 48,
  }, opts);
}

export function fetchAir({ lat, lon }, opts) {
  return getJSON(ENDPOINTS.air, {
    latitude: coord(lat),
    longitude: coord(lon),
    current: 'us_aqi,pm2_5,pm10',
    hourly: 'us_aqi',
    timezone: 'auto',
    forecast_hours: 24,
  }, opts);
}

/** Current temperature + condition for several places in one request (saved cities). */
export async function fetchCurrentMany(places, opts) {
  if (!places.length) return [];
  const data = await getJSON(ENDPOINTS.forecast, {
    latitude: places.map(p => coord(p.lat)).join(','),
    longitude: places.map(p => coord(p.lon)).join(','),
    current: 'temperature_2m,weather_code,is_day',
    timezone: 'auto',
  }, opts);
  return (Array.isArray(data) ? data : [data]).map(d => d.current);
}

export async function searchPlaces(query, opts) {
  const data = await getJSON(ENDPOINTS.geocode, { name: query, count: 6, language: LANG, format: 'json' }, opts);
  return (data.results || []).map(r => ({
    name: r.name,
    admin1: r.admin1 || '',
    country: r.country || r.country_code || '',
    lat: r.latitude,
    lon: r.longitude,
    source: 'search',
  }));
}

export async function reverseGeocode({ lat, lon }, opts) {
  const d = await getJSON(ENDPOINTS.reverse, { latitude: lat, longitude: lon, localityLanguage: LANG }, { timeout: 8000, ...opts });
  return {
    name: d.city || d.locality || d.principalSubdivision || 'My location',
    admin1: d.city || d.locality ? d.principalSubdivision || '' : '',
    country: d.countryName || '',
  };
}
