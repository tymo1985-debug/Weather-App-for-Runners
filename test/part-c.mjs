import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runAdvice, nearTermRecommendation } from '../js/engine.js';

const base = Date.parse('2026-09-20T08:00:00Z');
const hour = (i, overrides = {}) => ({
  ts: base + i * 3600e3, t: new Date(base + i * 3600e3),
  score: 80, code: 0, mm: 0, pop: 0, wind: 8, feels: 18, ...overrides
});
const window = (...slice) => ({ slice });

test('ordinary and incomplete windows have no advice', () => {
  assert.deepEqual(runAdvice(window(hour(0), hour(1)), 120), []);
  assert.deepEqual(runAdvice(window(hour(0)), 120), []);
  assert.deepEqual(runAdvice(null, 60), []);
  assert.deepEqual(runAdvice(window(hour(0, { wind: null, mm: null, feels: null })), 60), []);
});
test('wind, hot and cold conditions produce practical categories', () => {
  assert.deepEqual(runAdvice(window(hour(0, { wind: 31 })), 60), ['wind']);
  assert.deepEqual(runAdvice(window(hour(0, { feels: 30 })), 60), ['heat']);
  assert.deepEqual(runAdvice(window(hour(0, { feels: 2 })), 60), ['cold']);
});
test('rain later is distinguished from rain at start', () => {
  assert.deepEqual(runAdvice(window(hour(0), hour(1, { mm: 1.2 })), 90), ['rainLater']);
  assert.deepEqual(runAdvice(window(hour(0, { mm: 1.2 }), hour(1)), 90), ['rain']);
});
test('stable safety-first priority and max two tips', () => {
  const w = window(hour(0, { code: 95, mm: 8, wind: 46, feels: 36 }));
  assert.deepEqual(runAdvice(w, 60), ['thunder', 'wind']);
});
for (const duration of [30, 45, 60, 90, 120]) {
  test(`${duration} minute advice respects the selected duration`, () => {
    const hours = [hour(0), hour(1, { wind: 35 }), hour(2)];
    const near = nearTermRecommendation(hours, duration, 2, base);
    assert.deepEqual(runAdvice(near?.current, duration), duration > 60 ? ['wind'] : []);
  });
}
test('advice rendering reads existing windows without loading forecasts', async () => {
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const render = app.slice(app.indexOf('function renderHome()'), app.indexOf('function renderStrip()'));
  assert.match(render, /runAdvice\(near\?\.later \|\| near\?\.current/);
  assert.doesNotMatch(render, /\b(fetch|fetchAll|load)\s*\(/);
});
