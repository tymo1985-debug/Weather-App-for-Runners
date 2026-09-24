import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/engine.js', import.meta.url), 'utf8');
const { nearTermRecommendation } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
const base = Date.parse('2026-09-19T08:00:00Z');
const hours = (scores, interval = 60) => scores.map((score, i) => ({
  score, code: 0, mm: 0, wind: 5, feels: 16,
  ts: base + i * interval * 60000, t: new Date(base + i * interval * 60000)
}));

for (const duration of [30, 45, 60, 90, 120]) {
  test(`${duration} min: current best and small gains mean go now`, () => {
    assert.equal(nearTermRecommendation(hours([85, 80, 70, 70]), duration, 2, base).later, null);
    assert.equal(nearTermRecommendation(hours([75, 80, 80, 80]), duration, 2, base).later, null);
  });
}

test('1h horizon allows a material ~30 min improvement but not later starts', () => {
  const data = hours([60, 81, 95, 95], 60);
  data[1].ts = base + 30 * 60000;
  data[1].t = new Date(data[1].ts);
  // 30-minute windows need no subsequent contiguous hour.
  const r = nearTermRecommendation(data, 30, 1, base);
  assert.equal(r.later.score, 81);
  assert.equal(r.later.waitMin, 30);
});

test('1h horizon selects a ~60 min start and 2h can select ~120 min', () => {
  const data = hours([60, 80, 92, 92]);
  assert.equal(nearTermRecommendation(data, 60, 1, base).later.waitMin, 60);
  assert.equal(nearTermRecommendation(data, 60, 2, base).later.waitMin, 120);
  assert.equal(nearTermRecommendation(data, 120, 2, base).later.score, 92);
});

test('longer waits require ten points and ties choose earliest', () => {
  assert.equal(nearTermRecommendation(hours([70, 72, 79]), 60, 2, base).later, null);
  assert.equal(nearTermRecommendation(hours([70, 82, 82]), 60, 2, base).later.waitMin, 60);
});

for (const [name, fields] of [
  ['thunder', { code: 95 }], ['heat', { feels: 35 }],
  ['rain', { mm: 8 }], ['wind', { wind: 45 }]
]) {
  test(`${name} future whole-window hazard is never recommended`, () => {
    const data = hours([20, 95, 95, 95]);
    Object.assign(data[1], fields);
    assert.equal(nearTermRecommendation(data.slice(0, 2), 60, 1, base).later, null);
    assert.equal(nearTermRecommendation(data.slice(0, 3), 120, 1, base).later, null);
  });
}

test('missing current or future full windows and discontinuities fall back gracefully', () => {
  assert.equal(nearTermRecommendation([], 60, 2, base), null);
  assert.equal(nearTermRecommendation(hours([60]), 120, 2, base), null);
  assert.equal(nearTermRecommendation(hours([60, 90]), 120, 2, base).later, null);
  const data = hours([60, 90, 90]);
  data[2].ts += 1800e3;
  assert.equal(nearTermRecommendation(data, 120, 2, base).later, null);
});

test('horizon toggling computes from existing hours without fetching', async () => {
  const data = hours([60, 80, 92]);
  const toggle = horizon => nearTermRecommendation(data, 60, horizon, base);
  assert.equal(toggle(1).later.score, 80);
  assert.equal(toggle(2).later.score, 92);
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const handler = app.slice(app.indexOf("$('.near-term__choices').addEventListener"), app.indexOf('function locate('));
  assert.doesNotMatch(handler, /\b(load|fetchAll)\s*\(/);
});
