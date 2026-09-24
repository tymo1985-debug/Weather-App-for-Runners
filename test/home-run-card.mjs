import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../css/styles.css', import.meta.url), 'utf8');
const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const i18n = await readFile(new URL('../js/i18n.js', import.meta.url), 'utf8');

test('Home presents one focused run-first dashboard', () => {
  const start = html.indexOf('<section class="screen is-active screen--home"');
  const end = html.indexOf('<!-- 2 - ПОЧАСОВОЙ -->', start);
  assert.ok(start >= 0 && end > start);
  const home = html.slice(start, end);
  for (const id of ['cardScore','scoreBig','homeConditions','homeTimeline','homeBestBadge',
    'homeFeelsValue','homeWindValue','homeRainValue','homeAdvice','homeDetailsLabel']) {
    assert.match(home, new RegExp('id="' + id + '"'));
  }
  assert.match(home, /class="home-metrics"/);
  assert.match(home, /class="home-advice"/);
  assert.doesNotMatch(home, /<div class="grid2">/);
});

test('Home run card retains existing interactive hooks', () => {
  assert.match(html, /data-go="run-details"/);
  assert.equal((html.match(/data-quick-duration=/g) || []).length, 5);
  assert.equal((html.match(/data-horizon=/g) || []).length, 2);
  assert.match(css, /RUN PLANNER ROADMAP · PHASE A/);
  assert.match(css, /\.run-card__scoreline/);
});


test('Home explains the visible score in the Why label', () => {
  assert.match(app, /scoreWhy'\)\.textContent = T\.whyScoreShort\(sc\)/);
  assert.match(i18n, /whyScoreShort: score => `Why \$\{score\}\?`/);
  assert.match(i18n, /whyScoreShort: score => `Почему \$\{score\}\?`/);
});

test('run mini timeline keeps its rail above time labels', () => {
  assert.match(css, /\.run-mini__point\{[^}]*padding-top:17px/);
  assert.match(css, /\.run-mini__point:not\(:last-child\)::after\{[^}]*left:6px;right:-6px;top:5px/);
  assert.doesNotMatch(css, /\.run-mini__point\{[^}]*padding-left:13px/);
});


test('Home makes start time and duration relationship explicit', () => {
  assert.match(app, /lblBestTime'\)\.textContent = T\.recommendedStart/);
  assert.doesNotMatch(app, /lblBestTime'\)\.textContent = w \? T\.betterLater/);
  assert.match(app, /runScenario'\)\.textContent = recommendation\.nowScore == null \? '' : T\.currentScoreScenario\(runDuration\(\)\)/);
  assert.match(app, /quickDurationHint'\)\.textContent = T\.runDurationHint/);
  assert.match(i18n, /recommendedStart: 'Рекомендуемый старт'/);
  assert.match(i18n, /Оценка выше рассчитана для старта сейчас и пробежки на/);
});

test('Profile duration is explicitly the same setting used on Home', () => {
  assert.match(app, /\['duration', T\.usualRunDuration, glyph\.clock\]/);
  assert.match(i18n, /usualRunDuration: 'Обычная длительность'/);
  assert.match(i18n, /Это то же значение, что на Главной/);
});


test('Run Score keeps optical centering metadata and a simplified settings icon', () => {
  assert.match(app, /scoreBig'\)\.dataset\.digits = String\(sc\)\.length/);
  assert.match(app, /const settingsIcon =/);
  assert.match(app, /btnAddCity'\)\.innerHTML = settingsIcon/);
  assert.match(css, /\.home-score__value\[data-digits="3"\]/);
});
