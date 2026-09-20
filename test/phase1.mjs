import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/engine.js', import.meta.url), 'utf8');
const { runRecommendation, bestWindow } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
const base = Date.parse('2026-09-19T08:00:00Z');
const hours = (scores, daylight = scores.map(() => 1)) => scores.map((score, i) => ({
  score, isDay: daylight[i], ts: base + i * 3600e3,
  t: new Date(base + i * 3600e3), iso: `2026-09-19T${String(i + 8).padStart(2, '0')}:00`
}));

test('a meaningful improvement reports the same window score and elapsed wait', () => {
  const r = runRecommendation(hours([65, 65, 82, 82]), 120, base + 10 * 60e3);
  assert.equal(r.nowScore, 65);
  assert.equal(r.later.score, 82);
  assert.equal(r.gain, 17);
  assert.equal(r.waitMin, 110);
  assert.equal(r.overnight, false);
});

test('a marginal improvement does not displace a good run now', () => {
  const r = runRecommendation(hours([80, 82, 84]), 60, base);
  assert.equal(r.later, null);
  assert.equal(r.nowScore, 80);
  assert.equal(r.gain, 4);
});

test('prefer daylight over an unexplained overnight maximum without changing bestWindow', () => {
  const data = hours([60, 78, 95], [1, 1, 0]);
  const r = runRecommendation(data, 60, base);
  assert.equal(r.later.score, 78);
  assert.equal(r.overnight, false);
  assert.equal(bestWindow(data, 60, new Date(base)).score, 95);
  const night = runRecommendation(hours([60, 85], [0, 0]), 60, base);
  assert.equal(night.later.score, 85);
  assert.equal(night.overnight, true);
});

test('missing or discontinuous forecast does not invent a later window', () => {
  assert.equal(runRecommendation([], 60, base).nowScore, null);
  const data = hours([62, 90, 90]);
  data[1].ts += 30 * 60e3;
  assert.equal(runRecommendation(data, 120, base).later, null);
});
