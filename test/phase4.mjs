import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');

test('viewport allows user zoom and search has a real label', () => {
  const viewport = html.match(/<meta name="viewport" content="([^"]+)"/)[1];
  assert.doesNotMatch(viewport, /maximum-scale|user-scalable/);
  assert.match(html, /<label[^>]+for="cityQ"[^>]*>/);
  assert.match(css, /\.visually-hidden\{/);
});

test('icon buttons get names and keyboard focus remains visible', () => {
  for (const id of ['btnLocate', 'btnAddCity', 'btnLayers', 'btnMapLocate', 'btnZoomIn', 'btnZoomOut', 'radarTime']) {
    assert.match(app, new RegExp(`\\$\\('#${id}'\\)\\.setAttribute\\('aria-label'`));
  }
  assert.match(app, /\[data-back\].*setAttribute\('aria-label'/);
  assert.match(app, /\[data-share\].*setAttribute\('aria-label'/);
  assert.match(css, /:focus-visible\{outline:/);
  assert.match(css, /\.hero :focus-visible/);
});
