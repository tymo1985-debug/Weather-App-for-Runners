import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LANGS } from '../js/i18n.js';

test('Russian relative freshness uses natural minute/hour forms', () => {
  for (const [n, word] of [[1, 'минуту'], [2, 'минуты'], [5, 'минут'], [11, 'минут'], [21, 'минуту'], [24, 'минуты']])
    assert.equal(LANGS.ru.updatedMinutes(n), `Обновлено ${n} ${word} назад`);
  for (const [n, word] of [[1, 'час'], [2, 'часа'], [5, 'часов'], [11, 'часов'], [21, 'час']])
    assert.equal(LANGS.ru.updatedHours(n), `Обновлено ${n} ${word} назад`);
  assert.match(LANGS.ru.chartSummary(72, 85, '10:00 – 11:00'), /72.*85.*10:00/);
});

test('radar controls remain disabled until a precipitation tile loads', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(html, /id="radarPlay" disabled/);
  assert.match(html, /id="radarTime"[^>]+disabled/);
  assert.match(app, /await firstLayerReady\(\);[\s\S]*?radarPlay'\)\.disabled = false/);
  assert.match(app, /layer\.on\('tileload', onLoad\)/);
  assert.match(app, /if \(!R\.ready \|\| \$\('#radarPlay'\)\.disabled/);
});
