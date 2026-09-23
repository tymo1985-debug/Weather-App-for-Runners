import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGS } from '../js/i18n.js';

const [html, css, app, sw] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../css/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../js/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../sw.js', import.meta.url), 'utf8')
]);

test('bottom navigation is Home Weather Profile', () => {
  const nav = html.slice(html.indexOf('<nav class="tabbar'), html.indexOf('</nav>') + 6);
  assert.equal((nav.match(/class="tab/g) || []).length, 3);
  assert.match(nav, /data-go="home"/);
  assert.match(nav, /data-go="radar"[^>]*>.*data-t="tabWeather"/s);
  assert.match(nav, /data-go="details"/);
  assert.doesNotMatch(nav, /data-go="cities"/);
  assert.equal(LANGS.en.tabWeather, 'Weather');
  assert.equal(LANGS.ru.tabWeather, 'Погода');
});

test('Weather Hub contains approved key sections', () => {
  const start = html.indexOf('data-screen="radar"');
  const end = html.indexOf('<!-- 10 - ДЕТАЛИ', start);
  const hub = html.slice(start, end);
  for (const id of ['weatherHero','weatherRunScore','weatherRadarCard','weatherHourly','weatherDaily','weatherAir']) {
    assert.match(hub, new RegExp('id="' + id + '"'));
  }
  assert.equal((hub.match(/data-weather-mode=/g) || []).length, 2);
  assert.match(hub, /id="map"/);
});

test('Weather Hub reuses running score and keeps city search internal', () => {
  assert.match(app, /radar: renderWeatherHub/);
  assert.match(app, /currentRun\(\)\.score/);
  assert.match(app, /weatherMode: 'cards'/);
  assert.match(app, /weatherPlace'\)\.addEventListener\('click', \(\) => go\('cities'\)\)/);
  assert.match(html, /data-screen="cities"/);
  assert.match(app, /load\(\); back\(\);/);
});

test('radar expands in place and Prague hero is local/offline', () => {
  assert.match(css, /\.weather-radar-card\.is-expanded/);
  assert.match(css, /prague-weather-hero\.svg/);
  assert.match(app, /function setRadarExpanded\(on\)/);
  assert.match(app, /prague\|praha\|prag\|прага/);
  assert.match(sw, /shell-v25/);
  assert.match(sw, /\.\/assets\/prague-weather-hero\.svg/);
});

test('hourly Weather Hub supports cards and graph without a new fetch path', () => {
  assert.match(app, /function renderWeatherHourly\(\)/);
  assert.match(app, /S\.weatherMode === 'cards'/);
  assert.match(app, /weather-hourly__graph/);
  assert.doesNotMatch(app.slice(app.indexOf('function renderWeatherHourly()'), app.indexOf('function renderWeatherDaily()')), /fetch\(/);
});
