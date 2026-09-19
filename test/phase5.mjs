import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const source = app.slice(app.indexOf('let requestId = 0, controller;'), app.indexOf('const nowIndex ='))
  .replace('function paint() { staticText(); RENDER[S.screen]?.(); }', '');
const engine = readFileSync(new URL('../js/engine.js', import.meta.url), 'utf8');
const [, minutes, seconds] = engine.match(/CACHE_TTL_MS = (\d+) \* (\d+)e3/);
const ttl = Number(minutes) * Number(seconds) * 1000;

test('live forecast remains actionable while fresh, but not after a failed refresh past TTL', async () => {
  let now = 1_000_000, saved = null, resolveFetch, rejectFetch;
  const bundle = { at: now };
  const state = { place: {}, profile: {}, bundle: null, hours: [], cached: false, screen: 'home' };
  const data = { hidden: true }, retry = { hidden: false }, message = {};
  let paints = 0;
  const api = new Function('S', '$', 'T', 'Date', 'CACHE_TTL_MS', 'cachedBundle', 'fetchAll',
    'buildHours', 'paint', 'toast', 'AbortController', `${source}; return { load, expireDisplayedBundle };`)(
    state, selector => ({ '#dataState': data, '#dataStateMsg': message, '#dataRetry': retry })[selector],
    { loading: 'Loading', noDataTitle: 'Forecast unavailable', retry: 'Retry', offline: 'Offline' },
    { now: () => now }, ttl, () => saved,
    () => new Promise((resolve, reject) => { resolveFetch = resolve; rejectFetch = reject; }),
    () => [{ score: 90 }], () => { paints++; }, () => {}, AbortController);

  const initial = api.load();
  resolveFetch(bundle);
  await initial;
  assert.equal(state.cached, false);
  assert.equal(state.hours[0].score, 90);

  saved = bundle;
  now += 12 * 60_000;
  const refresh = api.load();
  assert.equal(state.bundle, bundle, 'fresh saved forecast renders immediately');
  assert.equal(data.hidden, true);
  now = bundle.at + ttl + 1;
  rejectFetch(new Error('offline'));
  await refresh;
  assert.equal(state.bundle, null);
  assert.deepEqual(state.hours, []);
  assert.equal(data.hidden, false);
  assert.equal(message.textContent, 'Forecast unavailable');
  assert.equal(retry.hidden, false);
  assert.ok(paints >= 2);

  state.bundle = bundle;
  state.hours = [{ score: 90 }];
  state.cached = false;
  assert.equal(api.expireDisplayedBundle(), true, 'periodic expiry also applies to live bundles');
  assert.equal(state.bundle, null);
  assert.deepEqual(state.hours, []);
});
