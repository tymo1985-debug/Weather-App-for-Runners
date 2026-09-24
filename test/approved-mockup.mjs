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


test('collection selectors use the multi-element helper before forEach', () => {
  assert.doesNotMatch(app, /(?<!\$)\$\('[^']+'\)\.forEach/);
  assert.match(app, /\$\$\('\[data-stats-tab\]'\)\.forEach/);
  assert.match(app, /\$\$\('\[data-weather-section\]'\)\.forEach/);
});


test('location pin uses device geolocation while city text keeps the picker', () => {
  assert.match(app, /btnPlace'\)\.addEventListener\('click', e => \{[\s\S]*hero__pin[\s\S]*locate\(\)[\s\S]*go\('cities'\)/);
  assert.match(app, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(app, /btnMapLocate'\)\.addEventListener\('click', \(\) => locate\(\{ recenterMap: true \}\)\)/);
  assert.match(app, /locationDenied/);
  assert.match(css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
});

test('Stats tabs and period arrows drive distinct functional views', () => {
  assert.match(app, /statsWeekOffset: 0/);
  assert.match(app, /if \(S\.statsTab === 'runs'\)/);
  assert.match(app, /if \(S\.statsTab === 'weather'\)/);
  assert.match(app, /#statsPrev'\)\.addEventListener/);
  assert.match(app, /#statsNext'\)\.addEventListener/);
  assert.match(html, /id="statsOverviewCard"/);
  assert.match(html, /id="statsHistoryCard"/);
});

test('Planner shows a full recommendation set around the best time', () => {
  assert.match(app, /const limit = 10/);
  assert.match(app, /const candidateHours = S\.hours\.filter/);
  assert.match(app, /bestIndex - 3/);
  assert.match(css, /\.planner-slot\{min-height:60px\}/);
});

test('Stats forecast periods are limited to available forecast coverage', () => {
  assert.match(app, /function statsForecastCoverage\(period\)/);
  assert.match(app, /function statsMaxForecastOffset\(\)/);
  assert.match(app, /S\.statsTab === 'runs' \? -8 : 0/);
  assert.match(app, /T\.statsCoverage\(coverage\)/);
});

test('Training empty state explains how history is created', () => {
  assert.match(app, /statsRunsEmptyHelp/);
  assert.match(app, /data-go="run-details"/);
  assert.match(css, /\.stats-empty/);
});

test('Planner explains the selected window and confirms calendar export', () => {
  assert.match(html, /id="plannerExplain"/);
  assert.match(app, /function plannerExplanation\(/);
  assert.match(app, /T\.plannerReason/);
  assert.match(app, /toast\(T\.calendarPrepared\(windowText\(o\)\)\)/);
  assert.match(css, /\.planner-explain/);
});

test('Frequent controls meet a 44px touch target', () => {
  assert.match(css, /\.stats-period button\{min-width:44px;min-height:44px\}/);
  assert.match(css, /\.stats-tabs button,[\s\S]*\.planner-tabs button\{min-height:44px\}/);
  assert.match(css, /\.planner-date button\{min-width:44px;min-height:44px\}/);
});

