// ── Данные и расчёт оценки бега ────────────────────────────────────────────
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const AIR = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const REVGEO = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

export const DEFAULT_PLACE = { name: 'Berlin', lat: 52.52, lon: 13.405, country: 'Germany' };

export const DEFAULT_PROFILE = {
  heat: 'normal',      // low | normal | high  — переносимость жары
  cold: 'normal',
  rain: 'drier',       // drier | ok           — отношение к дождю
  air: 'normal',       // normal | high        — чувствительность к воздуху
  pollen: 'off',       // off | on
  duration: 60         // минут
};

export function loadProfile() {
  try { return { ...DEFAULT_PROFILE, ...JSON.parse(localStorage.getItem('rw.profile') || '{}') }; }
  catch { return { ...DEFAULT_PROFILE }; }
}
export function saveProfile(p) { localStorage.setItem('rw.profile', JSON.stringify(p)); }

export function loadCities() {
  try {
    const c = JSON.parse(localStorage.getItem('rw.cities') || 'null');
    return Array.isArray(c) && c.length ? c : [DEFAULT_PLACE];
  } catch { return [DEFAULT_PLACE]; }
}
export function saveCities(c) { localStorage.setItem('rw.cities', JSON.stringify(c)); }

// ── Загрузка ───────────────────────────────────────────────────────────────
const cacheKey = (p) => `rw.data.${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;

export async function fetchAll(place) {
  const q = `latitude=${place.lat}&longitude=${place.lon}&timezone=auto`;
  const fUrl = `${FORECAST}?${q}&forecast_days=10&current=temperature_2m,relative_humidity_2m,` +
    `apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day,cloud_cover` +
    `&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,precipitation,` +
    `precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,uv_index,is_day,visibility` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,` +
    `sunrise,sunset,uv_index_max,daylight_duration`;
  const aUrl = `${AIR}?${q}&forecast_days=5&hourly=pm10,pm2_5,nitrogen_dioxide,ozone,european_aqi,` +
    `alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,ragweed_pollen,olive_pollen`;

  const [w, a] = await Promise.all([
    fetch(fUrl).then(r => { if (!r.ok) throw new Error('forecast'); return r.json(); }),
    fetch(aUrl).then(r => r.ok ? r.json() : null).catch(() => null)
  ]);
  const bundle = { weather: w, air: a, place, at: Date.now() };
  try { localStorage.setItem(cacheKey(place), JSON.stringify(bundle)); } catch {}
  return bundle;
}

export function cachedBundle(place) {
  try { return JSON.parse(localStorage.getItem(cacheKey(place)) || 'null'); } catch { return null; }
}

export async function searchCity(name) {
  const r = await fetch(`${GEO}?name=${encodeURIComponent(name)}&count=8&language=ru&format=json`);
  const j = await r.json();
  return (j.results || []).map(x => ({
    name: x.name, lat: x.latitude, lon: x.longitude,
    country: [x.admin1, x.country].filter(Boolean).join(', ')
  }));
}

export async function reverseGeocode(lat, lon, lang = 'en') {
  try {
    const r = await fetch(`${REVGEO}?latitude=${lat}&longitude=${lon}&localityLanguage=${lang}`);
    const j = await r.json();
    return { name: j.city || j.locality || j.principalSubdivision || 'Моё место', lat, lon, country: j.countryName || '' };
  } catch { return { name: 'Моё место', lat, lon, country: '' }; }
}

// ── Оценка ─────────────────────────────────────────────────────────────────
// Каждый фактор даёт 0..100. Итог — взвешенная сумма.
export const WEIGHTS = { temp: 30, rain: 22, wind: 12, humid: 10, air: 12, uv: 8, surface: 6 };

const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));

function tempScore(feels, profile) {
  // Комфортный коридор для бега; сдвигается под переносимость жары/холода.
  let lo = 8, hi = 17;
  if (profile.heat === 'high') hi += 4; if (profile.heat === 'low') hi -= 3;
  if (profile.cold === 'high') lo -= 4; if (profile.cold === 'low') lo += 3;
  if (feels >= lo && feels <= hi) return 100;
  if (feels < lo) return clamp(100 - (lo - feels) * 3.4);
  return clamp(100 - (feels - hi) * 4.6);
}
function humidScore(rh) {
  if (rh >= 35 && rh <= 62) return 100;
  if (rh < 35) return clamp(100 - (35 - rh) * 1.1);
  return clamp(100 - (rh - 62) * 1.5);
}
function windScore(kmh) {
  if (kmh <= 9) return 100;
  return clamp(100 - (kmh - 9) * 2.6);
}
function rainScore(prob, mm, profile) {
  const tol = profile.rain === 'ok' ? 0.55 : 1;
  const p = clamp(100 - prob * 0.8 * tol);
  const i = clamp(100 - mm * 40 * tol);
  return Math.min(p, i);
}
function uvScore(uv) {
  if (uv <= 2.5) return 100;
  return clamp(100 - (uv - 2.5) * 9);
}
function airScore(aqi, profile) {
  if (aqi == null) return 85;
  const k = profile.air === 'high' ? 1.5 : 1;
  if (aqi <= 20) return 100;
  return clamp(100 - (aqi - 20) * 0.85 * k);
}
function surfaceScore(recentMm, temp) {
  let s = clamp(100 - recentMm * 18);
  if (temp <= 1) s = Math.min(s, temp <= -2 ? 62 : 45); // возможен лёд
  return s;
}
function pollenScore(maxGrains, profile) {
  if (profile.pollen !== 'on' || maxGrains == null) return null;
  if (maxGrains < 10) return 100;
  return clamp(100 - (maxGrains - 10) * 0.55);
}

export function scoreHour(h, profile) {
  const f = {
    temp: { v: tempScore(h.feels, profile), w: WEIGHTS.temp },
    rain: { v: rainScore(h.pop, h.mm, profile), w: WEIGHTS.rain },
    wind: { v: windScore(h.wind), w: WEIGHTS.wind },
    humid: { v: humidScore(h.rh), w: WEIGHTS.humid },
    air: { v: airScore(h.aqi, profile), w: WEIGHTS.air },
    uv: { v: uvScore(h.uv), w: WEIGHTS.uv },
    surface: { v: surfaceScore(h.recentMm, h.temp), w: WEIGHTS.surface }
  };
  const pol = pollenScore(h.pollen, profile);
  if (pol != null) f.pollen = { v: pol, w: 8 };

  let sum = 0, wsum = 0;
  for (const k in f) { sum += f[k].v * f[k].w; wsum += f[k].w; }
  // Слабое звено тянет итог вниз: бегуна портит худшее условие, а не среднее.
  const worst = Math.min(...Object.values(f).map(x => x.v));
  let total = (sum / wsum) * 0.8 + worst * 0.2;

  if (worst < 40) total = Math.min(total, 40 + worst * 0.62);
  if (h.temp <= 1 && h.recentMm > 0.5) total = Math.min(total, 52); // риск наледи
  if ([95, 96, 99].includes(h.code)) total = Math.min(total, 30);   // гроза

  return { total: Math.round(clamp(total)), factors: f };
}

export const band = (s) =>
  s >= 80 ? 'good' : s >= 65 ? 'mid' : s >= 45 ? 'low' : 'bad';

export const bandText = (s) =>
  s >= 88 ? 'Отлично' : s >= 80 ? 'Хорошо' : s >= 65 ? 'Приемлемо' : s >= 45 ? 'Так себе' : 'Плохо';

export const bandColor = (s) =>
  s >= 80 ? '#1F9D4D' : s >= 65 ? '#E9A21B' : s >= 45 ? '#EF6C2E' : '#DC4B3E';

// ── Нормализация часов ─────────────────────────────────────────────────────
export function buildHours(bundle, profile) {
  const H = bundle.weather.hourly;
  const air = bundle.air?.hourly;
  const airIdx = new Map();
  if (air) air.time.forEach((t, i) => airIdx.set(t, i));

  const out = [];
  for (let i = 0; i < H.time.length; i++) {
    const ai = airIdx.has(H.time[i]) ? airIdx.get(H.time[i]) : null;
    const recentMm = (H.precipitation.slice(Math.max(0, i - 4), i + 1) || [])
      .reduce((a, b) => a + (b || 0), 0);
    const pollen = ai == null ? null : Math.max(
      air.birch_pollen?.[ai] ?? 0, air.grass_pollen?.[ai] ?? 0,
      air.alder_pollen?.[ai] ?? 0, air.mugwort_pollen?.[ai] ?? 0,
      air.ragweed_pollen?.[ai] ?? 0, air.olive_pollen?.[ai] ?? 0
    );
    const h = {
      t: new Date(H.time[i]), iso: H.time[i],
      temp: H.temperature_2m[i], feels: H.apparent_temperature[i],
      rh: H.relative_humidity_2m[i], dew: H.dew_point_2m[i],
      mm: H.precipitation[i] ?? 0, pop: H.precipitation_probability[i] ?? 0,
      code: H.weather_code[i], wind: H.wind_speed_10m[i], gust: H.wind_gusts_10m?.[i] ?? null,
      uv: H.uv_index[i] ?? 0, isDay: H.is_day[i], vis: H.visibility?.[i] ?? null,
      aqi: ai == null ? null : air.european_aqi?.[ai],
      pm25: ai == null ? null : air.pm2_5?.[ai], pm10: ai == null ? null : air.pm10?.[ai],
      no2: ai == null ? null : air.nitrogen_dioxide?.[ai], o3: ai == null ? null : air.ozone?.[ai],
      pollen, recentMm
    };
    const s = scoreHour(h, profile);
    h.score = s.total; h.factors = s.factors;
    out.push(h);
  }
  return out;
}

// Лучшее окно длиной duration внутри интервала часов
export function bestWindow(hours, durationMin, fromDate) {
  const len = Math.max(1, Math.round(durationMin / 60));
  const from = fromDate ? fromDate.getTime() : Date.now();
  let best = null;
  for (let i = 0; i + len <= hours.length; i++) {
    if (hours[i].t.getTime() < from - 3600e3) continue;
    if (hours[i].t.getTime() > from + 24 * 3600e3) break;
    const slice = hours.slice(i, i + len);
    const avg = slice.reduce((a, h) => a + h.score, 0) / len;
    if (!best || avg > best.avg + 0.01) best = { i, avg, slice, score: Math.round(avg) };
  }
  return best;
}

export function bestWindowOfDay(hours, dayISO, durationMin) {
  const len = Math.max(1, Math.round(durationMin / 60));
  const day = hours.filter(h => h.iso.slice(0, 10) === dayISO);
  let best = null;
  for (let i = 0; i + len <= day.length; i++) {
    const slice = day.slice(i, i + len);
    const avg = slice.reduce((a, h) => a + h.score, 0) / len;
    if (!best || avg > best.avg + 0.01) best = { avg, slice, score: Math.round(avg) };
  }
  return best;
}

export const AQI_COLORS = ['#2E9E4F', '#5FBF7E', '#E9A21B', '#EF6C2E', '#DE5B4A', '#8E2A20'];
export const AQI_LIMITS = [20, 40, 60, 80, 100, Infinity];
// Возвращает [индексПолосы, цвет] — названия берутся из словаря языка.
export const aqiBand = (v) => {
  const i = AQI_LIMITS.findIndex(l => v <= l);
  const k = i < 0 ? 5 : i;
  return [k, AQI_COLORS[k]];
};

export const POLLEN_LEVEL = (v) =>
  v == null ? ['—', '#8C9CB5'] :
  v < 10 ? ['Низкая', '#1F9D4D'] :
  v < 50 ? ['Средняя', '#E9A21B'] :
  v < 500 ? ['Высокая', '#EF6C2E'] : ['Очень высокая', '#DC4B3E'];
