import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGS } from '../js/i18n.js';
import { APP_VERSION, RELEASE_DATE, RELEASE_NOTES } from '../js/version.js';

const [html, css, app, sw] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../css/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../js/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../sw.js', import.meta.url), 'utf8')
]);

test('bottom navigation is Home Weather Profile', () => {
  const nav = html.slice(html.indexOf('<nav class="tabbar'), html.indexOf('</nav>') + 6);
  assert.equal((nav.match(/<button class="tab/g) || []).length, 3);
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
  assert.match(sw, /shell-v29/);
  assert.match(sw, /\.\/assets\/prague-weather-hero\.svg/);
});

test('hourly Weather Hub supports cards and graph without a new fetch path', () => {
  assert.match(app, /function renderWeatherHourly\(\)/);
  assert.match(app, /S\.weatherMode === 'cards'/);
  assert.match(app, /weather-hourly__graph/);
  assert.doesNotMatch(app.slice(app.indexOf('function renderWeatherHourly()'), app.indexOf('function renderWeatherDaily()')), /fetch\(/);
});


test('Weather Hub static text iterates the full mode button list', () => {
  assert.match(app, /\$\$\('\[data-weather-mode\]'\)\.forEach/);
  assert.doesNotMatch(app, /\n\s*\$\('\[data-weather-mode\]'\)\.forEach/);
});

test('internal Weather city picker has an explicit back path', () => {
  const start = html.indexOf('data-screen="cities"');
  const end = html.indexOf('<nav class="tabbar', start);
  const cities = html.slice(start, end);
  assert.match(cities, /data-back/);
  assert.match(cities, /id="cityQ"/);
});

test('Weather Hub accessibility labels are localized through staticText', () => {
  assert.match(app, /weather-hourly-mode'\)\.setAttribute\('aria-label', T\.weatherHourlyTitle\)/);
  assert.match(app, /weather-air-card \.weather-card__link'\)\.setAttribute\('aria-label', T\.weatherAirTitle\)/);
});


test('Weather Hub spells out air quality instead of showing an unexplained AQI acronym', () => {
  assert.equal(LANGS.en.weatherAqiLabel, 'Air quality');
  assert.equal(LANGS.ru.weatherAqiLabel, 'Качество воздуха');
  assert.match(app, /<small>\$\{T\.weatherAqiLabel\}<\/small><b>\$\{aqi == null \? '—' : `\$\{T\.aqiWord\} \$\{Math\.round\(aqi\)\}`\}/);
});


test('radar basemap no longer depends on keyed CARTO tiles', () => {
  assert.match(app, /https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/);
  assert.doesNotMatch(app, /basemaps\.cartocdn\.com/);
  assert.match(app, /© OpenStreetMap contributors · © RainViewer/);
});

test('Weather Hub attaches Run Score under the hero and keeps a compact radar preview', () => {
  assert.match(css, /\.weather-hero\{[^}]*min-height:204px[^}]*border-radius:0/);
  assert.match(css, /\.weather-run-score\{[^}]*width:100%[^}]*min-height:52px[^}]*border-radius:0 0 18px 18px/);
  assert.match(css, /\.weather-run-score__action\{display:none\}/);
  assert.match(css, /\.weather-radar__map\{[^}]*height:clamp\(255px,64vw,310px\)/);
  assert.match(css, /\.weather-radar-card\.is-expanded \.weather-radar__map\{height:100dvh/);
  const heroEnd = html.indexOf('</header>', html.indexOf('id="weatherHero"'));
  const score = html.indexOf('id="weatherRunScore"');
  const body = html.indexOf('class="weather-hub__body"');
  assert.ok(heroEnd < score && score < body);
});


test('radar map styles use an explicit layer picker', () => {
  assert.equal((html.match(/data-map-layer=/g) || []).length, 3);
  assert.match(html, /id="mapLayerMenu"/);
  assert.match(app, /function setLayerMenuOpen\(on\)/);
  assert.match(app, /function syncLayerMenu\(\)/);
  assert.ok(app.includes("$('[data-map-layer]').forEach"));
  assert.doesNotMatch(app, /(^|\n)\s*\$\('\[data-map-layer\]'\)\.forEach/m);
  assert.match(app, /setBasemap\(Number\(b\.dataset\.mapLayer\)\)/);
  assert.doesNotMatch(app, /setBasemap\(\(R\.baseIdx \+ 1\) % BASEMAPS\.length\)/);
});

test('regional precipitation forecast uses small batches and can retry after failure', () => {
  assert.match(app, /const GRID = 8/);
  assert.match(app, /const MODEL_BATCH = 32/);
  assert.match(app, /Promise\.all\(batches\.map\(fetchModelBatch\)\)/);
  assert.match(app, /function ensureModelForecast\(\)/);
  assert.match(app, /modelRetryAt = Date\.now\(\) \+ 30000/);
  assert.doesNotMatch(app, /точек 256/);
});

test('normal radar timeline is compact while full-screen restores full controls', () => {
  assert.match(css, /\.weather-radar__map \.radarpanel\{[^}]*width:min\(calc\(100% - 20px\),310px\)/);
  assert.match(css, /\.weather-radar-card\.is-expanded \.radarpanel\{[^}]*width:auto[^}]*transform:none/);
  assert.match(app, /const candidates = S\.radarExpanded/);
});

test('Profile exposes current app version and release notes', () => {
  assert.equal(APP_VERSION, '0.29.0');
  assert.equal(RELEASE_DATE, '2026-09-23');
  assert.ok(RELEASE_NOTES.en.length >= 3 && RELEASE_NOTES.ru.length >= 3);
  assert.match(html, /id="appVersionMeta"/);
  assert.match(html, /id="whatsNewList"/);
  assert.match(app, /RELEASE_NOTES\[S\.langCode\]/);
  assert.match(sw, /\.\/js\/version\.js/);
});
