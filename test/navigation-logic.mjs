import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGS } from '../js/i18n.js';

const [html, app] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../js/app.js', import.meta.url), 'utf8')
]);

test('home score opens why and remains an accessible button', () => {
  assert.match(html, /<button class="scorecard" id="cardScore">/);
  assert.match(html, /id="scoreWhy"/);
  assert.match(app, /\$\('#cardScore'\)\.addEventListener\('click', \(\) => go\('why'\)\)/);
  assert.match(app, /\$\('#cardScore'\)\.setAttribute\('aria-label', T\.scoreExplanation\(sc, bandText\(sc\)\)\)/);
});

test('day overview opens analysis and its bottom action opens why', () => {
  assert.match(html, /<button class="linkrow" data-go="analysis"><span id="lblViewDetails"><\/span>/);
  assert.match(app, /\$\('#lblViewDetails'\)\.textContent = T\.dayOverview/);
  assert.match(app, /<button class="btnwide" data-go="why">\$\{T\.whyScore\}/);
});

test('navigation labels and score explanations are localized', () => {
  assert.equal(LANGS.en.dayOverview, 'Day overview');
  assert.equal(LANGS.ru.dayOverview, 'Обзор дня');
  assert.equal(LANGS.en.whyShort, 'Why?');
  assert.equal(LANGS.ru.whyShort, 'Почему?');
  assert.equal(LANGS.en.whyScore, 'Why this score?');
  assert.equal(LANGS.ru.whyScore, 'Почему такая оценка?');
  assert.match(LANGS.en.scoreExplanation(95, LANGS.en.excellent), /95.*Excellent.*Why this score\?/);
  assert.match(LANGS.ru.scoreExplanation(95, LANGS.ru.excellent), /95.*Отлично.*Почему такая оценка\?/);
});
