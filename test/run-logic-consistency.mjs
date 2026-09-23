import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const engine = await readFile(new URL('../js/engine.js', import.meta.url), 'utf8');
const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const { currentRunSummary, runRecommendation } = await import(`data:text/javascript,${encodeURIComponent(engine)}`);
const { LANGS } = await import('../js/i18n.js');
const base = Date.parse('2026-09-19T08:00:00Z');
const hours = (scores) => scores.map((score, i) => ({
  score, ts: base + i * 3600e3, t: new Date(base + i * 3600e3),
  code: 0, mm: 0, wind: 5, feels: 16, isDay: 1,
  factors: { temp: { v: score, w: 30 }, rain: { v: 100, w: 22 } }
}));

for (const duration of [30, 45, 60, 90, 120]) {
  test(`${duration} min: every current-run consumer shares the home score`, () => {
    const data = hours([90, 40, 90, 90]);
    const run = currentRunSummary(data, duration, base);
    assert.equal(run.score, runRecommendation(data, duration, base).nowScore);
    assert.equal(run.score, duration <= 60 ? 90 : duration === 90 ? 73 : 65);
    assert.equal(run.factors.temp.hour, duration <= 60 ? data[0] : data[1]);
  });
}

test('later thunder caps the whole run and exposes its existing limiter', () => {
  const data = hours([95, 95, 95]);
  data[1].code = 95;
  const run = currentRunSummary(data, 120, base);
  assert.equal(run.score, 30);
  assert.equal(run.limiting.reason, 'thunder');
  assert.equal(run.limiting.hour, data[1]);
  assert.equal(currentRunSummary(data, 60, base).limiting, null);
});

test('renderers and Share use one current run; duration changes stay local', () => {
  assert.match(app, /const recommendation = currentRun\(\)/);
  assert.match(app, /function renderAnalysis\(\) \{\s*const run = currentRun\(\)/);
  assert.match(app, /function renderWhy\(\) \{\s*const run = currentRun\(\)/);
  assert.match(app, /shareRun\(S\.place\.name, runDuration\(\),\s*currentRun\(\)\.score/);
  assert.doesNotMatch(app, /nowScore\(\)/);
  assert.match(app, /S\.plan\.mode = 'duration'; saveRunPlan\(S\.plan\);[\s\S]{0,140}selectDuration\(S\.profile, b\.dataset\.quickDuration, saveProfile\)/);
  assert.match(app, /if \(key === 'duration'\) selectDuration\(S\.profile, b\.dataset\.set, saveProfile\);[\s\S]{0,180}recompute\(\); closeSheet\(\); paint\(\)/);
});

test('Share renders the selected duration and current-window score in both languages', () => {
  const run = currentRunSummary(hours([90, 40, 90]), 120, base);
  for (const lang of ['ru', 'en']) {
    const text = LANGS[lang].shareRun('Berlin', 120, run.score, '10:00 – 12:00');
    assert.match(text, /120/);
    assert.match(text, /65\/100/);
    assert.doesNotMatch(text, /90\/100/);
  }
});
