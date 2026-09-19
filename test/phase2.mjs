import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const engineSource = await readFile(new URL('../js/engine.js', import.meta.url), 'utf8');
const { bestWindow, bestWindowOfDay } = await import(`data:text/javascript,${encodeURIComponent(engineSource)}`);
const base = Date.parse('2026-09-19T00:00:00Z');
const hours = [90, 30, 10, 80].map((score, i) => ({
  score, ts: base + i * 3600e3, t: new Date(base + i * 3600e3),
  iso: `2026-09-19T0${i}:00`
}));
for (const [minutes, avg, start, end] of [
  [30, 90, 0, '00:30'], [45, 90, 0, '00:45'], [60, 90, 0, '01:00'],
  [90, 70, 0, '01:30'], [120, 60, 0, '02:00']
]) {
  for (const result of [bestWindow(hours, minutes, new Date(base)),
    bestWindowOfDay(hours, '2026-09-19', minutes)]) {
    assert.equal(result.avg, avg, `${minutes} minute weighted score`);
    assert.equal(result.slice[0].ts, hours[start].ts);
    assert.equal(result.end.toISOString().slice(11, 16), end);
  }
}
assert.equal(bestWindowOfDay(hours.slice(0, 1), '2026-09-19', 90), null);

// Exercise the actual input handler with controlled out-of-order geocoding responses.
const appSource = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const handlerSource = appSource.slice(appSource.indexOf('let searchTimer, searchRequestId'),
  appSource.indexOf('// ── ШТОРКИ'));
const pending = [];
const list = { children: [], onclick: null, replaceChildren(...items) { this.children = items; },
  append(item) { this.children.push(item); } };
const input = { value: '', addEventListener(_name, fn) { this.onInput = fn; } };
const document = { createElement(tag) { return {
  tag, dataset: {}, children: [], append(...items) { this.children.push(...items); },
  closest() { return null; }
}; } };
const $ = selector => selector === '#cityQ' ? input : list;
const searchCity = (q, _lang, signal) => new Promise(resolve => pending.push({ q, signal, resolve }));
const timers = [];
const setTimeout = fn => (timers.push(fn), timers.length);
const clearTimeout = () => {};
const T = { nothingFound: 'none', searchOffline: 'offline' };
const S = { langCode: 'en' };
new Function('$', 'document', 'searchCity', 'setTimeout', 'clearTimeout', 'T', 'S',
  'validPlace', 'loadCities', 'saveCities', 'load', 'go', handlerSource)(
  $, document, searchCity, setTimeout, clearTimeout, T, S, () => true,
  () => [], () => {}, () => {}, () => {});
input.value = 'Old'; input.onInput({ target: input }); timers.at(-1)();
input.value = 'New'; input.onInput({ target: input }); timers.at(-1)();
assert.equal(pending[0].signal.aborted, true);
pending[1].resolve([{ name: 'New', country: 'B' }]);
await new Promise(resolve => setImmediate(resolve));
pending[0].resolve([{ name: 'Old', country: 'A' }]);
await new Promise(resolve => setImmediate(resolve));
assert.equal(list.children[0].children[0].textContent, 'New');
console.log('Phase 2 window and search race checks passed');
