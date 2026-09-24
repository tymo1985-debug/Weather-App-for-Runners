import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGS } from '../js/i18n.js';

const [html, app, css] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../js/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../css/styles.css', import.meta.url), 'utf8')
]);

test('approved mockup screens exist as real app destinations', () => {
  for (const screen of ['home','radar','stats','run-details','planner','details']) {
    assert.match(html, new RegExp('data-screen="' + screen + '"'));
  }
  for (const id of ['statsBars','statsHistory','runDetailsList','plannerSlots','watchBest','moreSettingsRow','moreAboutRow']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
});

test('planner retains Watch and existing planning controls', () => {
  assert.equal((html.match(/data-quick-duration=/g) || []).length, 5);
  assert.match(html, /id="availableFrom"/);
  assert.match(html, /id="availableTo"/);
  assert.match(html, /id="watchBest"/);
  assert.match(app, /function renderWatchControl\(\)/);
  assert.match(app, /enableBackgroundWatch/);
  assert.match(app, /addPlannerToCalendar/);
});

test('weather tabs and stats are localized and styled', () => {
  assert.equal(LANGS.ru.tabRun, 'Бег');
  assert.equal(LANGS.ru.tabStats, 'Статистика');
  assert.equal(LANGS.ru.tabMore, 'Ещё');
  assert.equal((html.match(/data-weather-section=/g) || []).length, 3);
  assert.match(css, /APPROVED SIX-SCREEN MOCKUP/);
  assert.match(css, /\.stats-bars/);
  assert.match(css, /\.planner-slot/);
  assert.match(css, /\.more-row/);
});
