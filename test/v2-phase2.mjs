import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/engine.js', import.meta.url), 'utf8');
const { bestWindow, runRecommendation } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
const base = Date.parse('2026-09-19T08:00:00Z');
const hours = (values) => values.map((v, i) => ({
  score: 90, code: 0, mm: 0, wind: 5, feels: 16, isDay: 1,
  ts: base + i * 3600e3, t: new Date(base + i * 3600e3),
  iso: `2026-09-19T${String(8 + i).padStart(2, '0')}:00`, ...v
}));

for (const duration of [30, 45, 90, 120]) {
  test(`${duration}-minute window preserves base average and reports its limiting hour`, () => {
    const w = bestWindow(hours([{ score: 80 }, { score: 60 }]), duration, new Date(base));
    assert.equal(w.score, Math.round(duration <= 60 ? 80 : (80 * 60 + 60 * (duration - 60)) / duration));
    assert.equal(w.limiting.reason, 'conditions');
    assert.equal(w.limiting.hour.score, duration <= 60 ? 80 : 60);
  });
  test(`${duration}-minute window caps a thunderstorm in any included hour`, () => {
    const data = hours([{ score: 95, code: 95 }, { score: 95, code: 95 }]);
    const w = bestWindow(data, duration, new Date(base));
    assert.equal(w.score, 30);
    assert.equal(w.limiting.reason, 'thunder');
  });
}

test('one storm hour cannot average out in a 120-minute recommendation', () => {
  const data = hours([{ score: 30, code: 95 }, { score: 95 }, { score: 80 }, { score: 80 }]);
  const r = runRecommendation(data, 120, base);
  assert.equal(r.current.rawAvg, 62.5);
  assert.equal(r.nowScore, 30);
  assert.equal(r.later.score, 88);
  assert.equal(r.gain, 58);
});

for (const [reason, condition, cap] of [
  ['rain', { mm: 7 }, 55], ['wind', { wind: 45 }, 60], ['heat', { feels: 35 }, 60]
]) {
  test(`${reason} soft cap applies to the entire 90-minute window`, () => {
    const w = bestWindow(hours([{ score: 90 }, { score: 90, ...condition }]), 90, new Date(base));
    assert.equal(w.score, cap);
    assert.equal(w.limiting.reason, reason);
    assert.equal(w.limiting.hour.ts, base + 3600e3);
  });
}

test('multiple hazards use the strictest cap and missing measurements do not trigger one', () => {
  const w = bestWindow(hours([{ score: 90, mm: 8 }, { score: 90, code: 96, wind: 50 }]), 120, new Date(base));
  assert.equal(w.score, 30);
  assert.equal(w.limiting.reason, 'thunder');
  assert.equal(bestWindow(hours([{ score: 90, mm: null, wind: null, feels: null }]), 45, new Date(base)).score, 90);
});
