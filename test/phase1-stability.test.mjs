import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PLACE, DEFAULT_PROFILE, loadActivePlace, saveActivePlace,
  hasWeatherCoverage, placeOffsetSec, hourTimestamp, scoreHour, buildHours
} from '../js/engine.js';

function storage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
}
function fixture(hours = ['2026-10-25T01:00', '2026-10-25T02:00', '2026-10-25T02:00', '2026-10-25T03:00']) {
  const n = hours.length;
  const repeat = value => Array(n).fill(value);
  return { weather: {
    timezone: 'Europe/Berlin', utc_offset_seconds: 7200, current: {}, daily: {},
    hourly: { time: hours,
      temperature_2m: repeat(13), apparent_temperature: repeat(12),
      relative_humidity_2m: repeat(55), precipitation: repeat(0),
      precipitation_probability: repeat(10), wind_speed_10m: repeat(8),
      weather_code: repeat(1), dew_point_2m: repeat(6), wind_gusts_10m: repeat(12),
      uv_index: repeat(1), is_day: repeat(1) }
  }, air: null };
}
test('active city persists independently of the favourite list', () => {
  const saved = { name: 'Prague', lat: 50.08, lon: 14.43, country: 'Czechia' };
  const current = { name: 'Frankfurt', lat: 50.11, lon: 8.68, country: 'Germany' };
  const db = storage({ 'rw.cities': JSON.stringify([saved]) });
  assert.deepEqual(loadActivePlace(db), saved);
  assert.equal(saveActivePlace(current, db), true);
  assert.deepEqual(loadActivePlace(db), current);
  assert.equal(saveActivePlace({ name: 'wrong', lat: NaN, lon: 3 }, db), false);
  assert.deepEqual(loadActivePlace(db), current);
  assert.deepEqual(loadActivePlace(storage()), DEFAULT_PLACE);
});
test('incomplete essential weather arrays are rejected, isolated gaps are accepted', () => {
  const b = fixture();
  assert.equal(hasWeatherCoverage(b.weather), true);
  delete b.weather.hourly.wind_speed_10m;
  assert.equal(hasWeatherCoverage(b.weather), false);
  const c = fixture(Array.from({ length: 12 }, (_, i) => `2026-10-25T${String(i).padStart(2, '0')}:00`));
  c.weather.hourly.temperature_2m[3] = null;
  assert.equal(hasWeatherCoverage(c.weather), true);
  c.weather.hourly.temperature_2m.fill(null);
  assert.equal(hasWeatherCoverage(c.weather), false);
});
test('missing air-quality measurements are not treated as fictitious 85/100', () => {
  const hour = { feels: 13, temp: 13, rh: 50, wind: 8, pop: 10, mm: 0,
    uv: 1, recentMm: 0, pollen: null, aqi: null, code: 1 };
  const { total, factors } = scoreHour(hour, DEFAULT_PROFILE);
  assert.equal(typeof total, 'number');
  assert.equal('air' in factors, false);
  assert.equal('temp' in factors, true);
});
test('DST ends: repeated 02:00 forecast rows represent different true hours', () => {
  const b = fixture();
  const rows = b.weather.hourly.time;
  const ts = rows.reduce((a, iso) => { a.push(hourTimestamp(b, iso, a.at(-1) ?? null)); return a; }, []);
  assert.deepEqual(ts.map(x => new Date(x).toISOString()), [
    '2026-10-24T23:00:00.000Z', '2026-10-25T00:00:00.000Z',
    '2026-10-25T01:00:00.000Z', '2026-10-25T02:00:00.000Z'
  ]);
  assert.ok(ts.slice(1).every((x, i) => x - ts[i] === 3600000));
  assert.equal(placeOffsetSec(b, Date.parse('2026-10-25T00:30:00Z')), 7200);
  assert.equal(placeOffsetSec(b, Date.parse('2026-10-25T01:30:00Z')), 3600);
  assert.deepEqual(buildHours(b, DEFAULT_PROFILE).map(h => h.ts), ts);
});
test('DST starts: 01:00 to 03:00 local time advances only one real hour', () => {
  const b = fixture(['2027-03-28T01:00', '2027-03-28T03:00']);
  const first = hourTimestamp(b, b.weather.hourly.time[0]);
  const second = hourTimestamp(b, b.weather.hourly.time[1], first);
  assert.equal(second - first, 3600000);
});
