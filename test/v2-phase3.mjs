import test from 'node:test';
import assert from 'node:assert/strict';
import { QUICK_DURATIONS, selectDuration, freshness } from '../js/home-ui.js';
import { LANGS } from '../js/i18n.js';

test('quick duration and profile sheet share the same persisted profile value', () => {
  const profile = { duration: 60, heat: 'normal' };
  const saved = [];
  const persist = p => saved.push({ ...p });
  assert.deepEqual(QUICK_DURATIONS, [30, 45, 60, 90, 120]);
  assert.equal(selectDuration(profile, '90', persist), true);
  assert.equal(profile.duration, 90);
  assert.deepEqual(saved, [{ duration: 90, heat: 'normal' }]);
  assert.equal(selectDuration(profile, '90', persist), false);
  assert.equal(selectDuration(profile, '75', persist), false);
  assert.equal(saved.length, 1);
  assert.equal(selectDuration(profile, '30', persist), true);
  assert.equal(saved[1].duration, 30);
});

test('freshness is localized, cached and stale statuses are retained', () => {
  const now = 1_000_000_000;
  assert.equal(freshness(now - 4 * 60e3, now, false, LANGS.en), 'Updated 4 min ago');
  assert.equal(freshness(now - 13 * 60e3, now, true, LANGS.en),
    'Updated 13 min ago · Saved forecast · Forecast may be outdated');
  assert.equal(freshness(now - 61 * 60e3, now, true, LANGS.ru),
    'Обновлено 1 час назад · Сохранённый прогноз · Прогноз может устареть');
  assert.equal(freshness(now + 1000, now, false, LANGS.en), 'Updated 0 min ago');
});
