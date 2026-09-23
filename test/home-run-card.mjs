import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../css/styles.css', import.meta.url), 'utf8');
const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const i18n = await readFile(new URL('../js/i18n.js', import.meta.url), 'utf8');

test('Home presents one primary run card', () => {
  const start = html.indexOf('<section class="run-card"');
  const end = html.indexOf('</section>', start);
  assert.ok(start >= 0 && end > start);
  const card = html.slice(start, end);
  for (const id of ['cardScore','factWindow','factDuration','factUv','nearTermAdvice','runAdvice','quickDurationLabel']) {
    assert.match(card, new RegExp('id="' + id + '"'));
  }
  assert.doesNotMatch(html, /<div class="grid2">/);
});

test('Home run card retains existing interactive hooks', () => {
  assert.match(html, /data-go="analysis"/);
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
