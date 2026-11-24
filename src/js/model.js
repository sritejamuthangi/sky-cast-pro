/**
 * Turns raw Open-Meteo responses into a compact, easy-to-use model.
 * All times are wall-clock milliseconds in the location's timezone (see format.js).
 */
import { parseWall } from './format.js';

export function buildModel(forecast, air) {
  const C = forecast.current;
  const H = forecast.hourly;
  const D = forecast.daily;

  const current = {
    t: parseWall(C.time),
    temp: C.temperature_2m,
    feels: C.apparent_temperature,
    humidity: C.relative_humidity_2m,
    isDay: Boolean(C.is_day),
    precip: C.precipitation ?? 0,
    code: C.weather_code,
    cloud: C.cloud_cover,
    pressure: C.pressure_msl,
    wind: C.wind_speed_10m,
    windDir: C.wind_direction_10m,
    gust: C.wind_gusts_10m,
    uv: C.uv_index,
    visibility: C.visibility,
    dew: C.dew_point_2m,
  };

  const hours = H.time.map((t, i) => ({
    t: parseWall(t),
    temp: H.temperature_2m[i],
    feels: H.apparent_temperature[i],
    pop: H.precipitation_probability[i] ?? 0,
    precip: H.precipitation[i] ?? 0,
    code: H.weather_code[i],
    isDay: Boolean(H.is_day[i]),
    uv: H.uv_index[i] ?? 0,
    wind: H.wind_speed_10m[i],
    gust: H.wind_gusts_10m[i],
    pressure: H.pressure_msl[i],
  }));

  const days = D.time.map((t, i) => ({
    t: parseWall(t),
    code: D.weather_code[i],
    max: D.temperature_2m_max[i],
    min: D.temperature_2m_min[i],
    sunrise: parseWall(D.sunrise[i]),
    sunset: parseWall(D.sunset[i]),
    daylight: D.daylight_duration[i],
    uvMax: D.uv_index_max[i] ?? 0,
    popMax: D.precipitation_probability_max[i] ?? 0,
    precipSum: D.precipitation_sum[i] ?? 0,
  }));

  let aq = null;
  if (air?.current && air.current.us_aqi != null) {
    aq = {
      aqi: air.current.us_aqi,
      pm25: air.current.pm2_5,
      pm10: air.current.pm10,
      hours: air.hourly ? air.hourly.time.map((t, i) => ({ t: parseWall(t), aqi: air.hourly.us_aqi[i] })) : [],
    };
  }

  return { offset: forecast.utc_offset_seconds, tz: forecast.timezone, current, hours, days, aq };
}

/** Index of the hour that contains `nowW`. */
export function nowIndex(hours, nowW) {
  let idx = 0;
  for (let i = 0; i < hours.length; i++) {
    if (hours[i].t <= nowW) idx = i;
    else break;
  }
  return idx;
}

/** The day entry for `nowW` (falls back to the first day). */
export function today(model, nowW) {
  const start = Math.floor(nowW / 86_400_000) * 86_400_000;
  return model.days.find(d => d.t === start) ?? model.days[0];
}
