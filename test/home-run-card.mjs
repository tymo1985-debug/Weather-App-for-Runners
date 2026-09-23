import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../css/styles.css', import.meta.url), 'utf8');

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
