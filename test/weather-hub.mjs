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

test('bottom navigation follows approved Run Weather Stats More structure', () => {
  const nav = html.slice(html.indexOf('<nav class="tabbar'), html.indexOf('</nav>') + 6);
  assert.equal((nav.match(/<button class="tab/g) || []).length, 4);
  assert.match(nav, /data-go="home"/);
  assert.match(nav, /data-go="radar"[^>]*>.*data-t="tabWeather"/s);
  assert.match(nav, /data-go="stats"[^>]*>.*data-t="tabStats"/s);
  assert.match(nav, /data-go="details"[^>]*>.*data-t="tabMore"/s);
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

test('Weather Hub order is hero score hourly radar daily air', () => {
  const start = html.indexOf('data-screen="radar"');
  const end = html.indexOf('<!-- 10 - ДЕТАЛИ', start);
  const hub = html.slice(start, end);
  const order = ['weatherHero','weatherRunScore','weatherHourly','weatherRadarCard','weatherDaily','weatherAir']
    .map(id => hub.indexOf(`id="${id}"`));
  assert.ok(order.every((pos, i) => pos >= 0 && (i === 0 || pos > order[i - 1])));
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
  assert.match(sw, /shell-v33/);
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

test('Weather Hub keeps Run Score out of full-screen radar and uses a compact radar preview', () => {
  assert.match(css, /\.weather-run-score\{[^}]*width:calc\(100% - 28px\)[^}]*border-radius:16px/);
  assert.match(css, /body\.radar-expanded \.weather-run-score\{display:none\}/);
  assert.match(css, /\.weather-radar__map\{[^}]*height:clamp\(176px,46vw,190px\)/);
  assert.match(css, /\.weather-radar-card\.is-expanded \.weather-radar__map\{height:100dvh/);
});


test('radar map styles use an explicit layer picker and default to the simple map', () => {
  assert.equal((html.match(/data-map-layer=/g) || []).length, 3);
  assert.match(html, /id="mapLayerMenu"/);
  assert.match(app, /function setLayerMenuOpen\(on\)/);
  assert.match(app, /function syncLayerMenu\(\)/);
  assert.ok(app.includes("$$('[data-map-layer]').forEach"));
  assert.ok(!app.includes("\n  $('[data-map-layer]').forEach"));
  assert.match(app, /baseIdx: 1/);
  assert.match(app, /setBasemap\(1\)/);
  assert.match(css, /map-base--light\{filter:grayscale\(\.82\)/);
});

test('regional precipitation forecast uses lightweight 15-minute model frames and retries', () => {
  assert.match(app, /const GRID = 5/);
  assert.match(app, /const MODEL_STEPS = MODEL_HOURS \* 4/);
  assert.match(app, /minutely_15=precipitation/);
  assert.match(app, /forecast_minutely_15=\$\{MODEL_STEPS \+ 2\}/);
  assert.match(app, /quarterHourMm\) \* 4/);
  assert.match(app, /if \(!add\.length\) throw new Error\('no future model frames'\)/);
  assert.match(app, /const retryDelay = 30000/);
  assert.match(html, /id="radarForecastState"/);
  assert.match(app, /setForecastStatus\('ready'\)/);
});

test('compact radar preview replaces the slider with five quick times', () => {
  const hubStart = html.indexOf('data-screen="radar"');
  const hubEnd = html.indexOf('<!-- 10 - ДЕТАЛИ', hubStart);
  const hub = html.slice(hubStart, hubEnd);
  assert.equal((hub.match(/data-radar-offset=/g) || []).length, 5);
  assert.match(css, /\.weather-radar-card:not\(\.is-expanded\) \.radarpanel[\s\S]*display:none!important/);
  assert.match(css, /\.weather-radar-card\.is-expanded \.radarpanel\{[^}]*width:auto[^}]*transform:none/);
  assert.match(css, /\.weather-radar-card\.is-expanded \.radar-quick\{display:none\}/);
  assert.match(app, /const RADAR_QUICK_OFFSETS = \[0, 30, 60, 180, 360\]/);
  assert.match(app, /function radarQuickFrameIndex\(offsetMin\)/);
  assert.match(app, /function updateRadarQuick\(\)/);
  assert.match(app, /#radarQuick'\)\.addEventListener\('click'/);
  assert.deepEqual(LANGS.ru.radarQuickLabels, ['Сейчас', '+30 мин', '+1 ч', '+3 ч', '+6 ч']);
});

test('Profile exposes current app version and release notes', () => {
  assert.equal(APP_VERSION, '0.33.0');
  assert.equal(RELEASE_DATE, '2026-09-24');
  assert.ok(RELEASE_NOTES.en.length >= 3 && RELEASE_NOTES.ru.length >= 3);
  assert.match(html, /id="appVersionMeta"/);
  assert.match(html, /id="whatsNewList"/);
  assert.match(app, /RELEASE_NOTES\[S\.langCode\]/);
  assert.match(sw, /\.\/js\/version\.js/);
});
