import { weatherIcon, glyph, plant, moonFraction } from './icons.js';
import { LANGS, pickLang, setLang } from './i18n.js';
import { freshness, selectDuration } from './home-ui.js';
import { loadRunPlan, saveRunPlan, plannedDuration, paceText, parsePace, timeToMinutes, hasAvailability } from './run-plan.js';
import { loadWatch, saveWatch, makeWatch, watchChange } from './weather-watch.js';
import { loadBackgroundWatch, enableBackgroundWatch, disableBackgroundWatch } from './background-watch.js';
import { parseGpx, loadRoute, saveRoute, routeWindContext } from './route-plan.js';
import { fetchRouteForecast, routeWeatherAt } from './route-weather.js';
import { loadHistory, addRun, effortHint } from './run-history.js';
import { APP_VERSION, RELEASE_DATE, RELEASE_NOTES } from './version.js';
import {
  DEFAULT_PLACE, CACHE_TTL_MS, loadProfile, saveProfile, loadCities, saveCities, validPlace,
  fetchAll, cachedBundle, searchCity, reverseGeocode,
  buildHours, bestWindow, bestWindowOfDay, currentRunSummary, nearTermRecommendation, runAdvice, runStartOptions, bestStartOption, band, bandColor, aqiBand, WEIGHTS,
  placeNow, placeOffsetSec
} from './engine.js';

// ── Состояние ──────────────────────────────────────────────────────────────
const S = {
  place: loadCities()[0] || DEFAULT_PLACE,
  profile: loadProfile(),
  plan: loadRunPlan(),
  watch: loadWatch(),
  backgroundWatch: loadBackgroundWatch(), backgroundWatchSyncing: false, backgroundWatchReason: null,
  route: loadRoute(),
  routeForecast: null, routeWeather: null, routeWeatherLoading: false, routeWeatherError: false,
  history: loadHistory(),
  langCode: pickLang(),
  bundle: null, hours: [], cached: false,
  range: 'hours', dcol: 'score', btab: 'score', horizon: 1,
  weatherMode: 'cards', radarExpanded: false,
  factor: 'temp',
  screen: 'home', stack: []
};
let T = LANGS[S.langCode];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const syncPressed = selector => $$(selector).forEach(b => b.setAttribute('aria-pressed', String(b.classList.contains('is-on'))));
const pad = n => String(n).padStart(2, '0');
const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const round = v => (v == null || Number.isNaN(v) ? '—' : Math.round(v));
const dowOf = d => T.dows[d.getDay()];
const dateOf = d => T.fmtDate(d, T);
const uvWord = v => T.uvWords[v < 3 ? 0 : v < 6 ? 1 : v < 8 ? 2 : 3];
const bandText = s => s >= 88 ? T.excellent : s >= 80 ? T.good : s >= 65 ? T.fair : s >= 45 ? T.poor : T.bad;
const subFor = s => s >= 88 ? T.subExcellent : s >= 80 ? T.subGood : s >= 65 ? T.subFair
  : s >= 45 ? T.subPoor : T.subBad;

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(t._x); t._x = setTimeout(() => (t.hidden = true), 2500);
}

// ── Навигация ──────────────────────────────────────────────────────────────
const RENDER = {
  home: renderHome, hourly: renderHourly, daily: renderDaily, analysis: renderAnalysis,
  why: renderWhy, factor: renderFactor, timeline: renderTimeline, air: renderAir,
  details: renderDetails, cities: renderCities, radar: renderWeatherHub
};
const TAB_OF = { home: 'home', hourly: 'home', daily: 'home', analysis: 'home', why: 'home',
  factor: 'home', timeline: 'home', air: 'radar', radar: 'radar', cities: 'radar', details: 'details' };
const tabFor = name => (['hourly', 'daily'].includes(name) && S.stack.at(-1) === 'radar') ? 'radar' : TAB_OF[name];

function go(name, push = true) {
  if (name === S.screen) return;
  const oldFocus = document.activeElement;
  if (S.screen === 'radar' && name !== 'radar') { stopPlay(); setRadarExpanded(false); }   // не крутим радар в фоне
  if (push) { S.stack.push(S.screen); if (S.stack.length > 40) S.stack.splice(0, 20); }
  S.screen = name;
  $$('.screen').forEach(s => s.classList.toggle('is-active', s.dataset.screen === name));
  const activeTab = tabFor(name);
  $$('.tab').forEach(t => t.classList.toggle('is-on', t.dataset.go === activeTab));
  $$('.tab').forEach(t => t.setAttribute('aria-current', t.dataset.go === activeTab ? 'page' : 'false'));
  window.scrollTo(0, 0);
  if (S.bundle) RENDER[name]?.();
  if (oldFocus.closest?.('.screen')) {
    const screen = $(`.screen[data-screen="${name}"]`);
    const target = screen.querySelector('#cityQ, h1, [data-back], button');
    if (target) { if (target.tagName === 'H1') target.tabIndex = -1; target.focus(); }
  }
}
function back() { go(S.stack.pop() || 'home', false); }

document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]'); if (g) return go(g.dataset.go);
  if (e.target.closest('[data-back]')) return back();
  if (e.target.closest('[data-close-sheet]')) return closeSheet();
  if (e.target.closest('[data-share]')) return share();
});

async function share() {
  const w = bestWindow(S.hours, runDuration());
  const txt = T.shareRun(S.place.name, runDuration(),
    currentRun().score ?? 0, w ? windowText(w) : '—');
  if (navigator.share) { try { await navigator.share({ text: txt }); return; } catch {} }
  try { await navigator.clipboard.writeText(txt); toast(T.copied); } catch { toast(txt); }
}

// ── Данные ─────────────────────────────────────────────────────────────────
let requestId = 0, controller;
async function load() {
  const id = ++requestId, place = S.place;
  controller?.abort();
  controller = new AbortController();
  if (S.route && !S.routeForecast && !S.routeWeatherLoading) refreshRouteForecast();
  const cached = cachedBundle(place);
  S.bundle = null; S.hours = [];
  if (cached) { S.bundle = cached; S.cached = true; recompute(); paint(); dataError(false); if (typeof checkWatch === 'function') checkWatch(); }
  else dataError('loading');
  try {
    const bundle = await fetchAll(place, controller.signal);
    if (id !== requestId) return;
    S.bundle = bundle; S.cached = false;
    recompute(); paint(); dataError(false); if (typeof checkWatch === 'function') checkWatch();
  } catch {
    if (id !== requestId) return;
    if (cached && !expireDisplayedBundle()) { paint(); toast(T.offline); }
    else dataError(true);                    // совсем нечего показать — даём повтор
  }
}

// Экран «не загрузилось» с кнопкой повтора: без него первый запуск
// без сети оставлял пустой интерфейс без объяснения.
function dataError(on) {
  const el = $('#dataState');
  el.hidden = !on;
  if (!on) return;
  el.setAttribute('role', on === 'loading' ? 'status' : 'alert');
  $('#dataStateMsg').textContent = on === 'loading' ? T.loading : T.noDataTitle;
  $('#dataRetry').hidden = on === 'loading';
  $('#dataRetry').textContent = T.retry;
}
function expireDisplayedBundle() {
  if (!S.bundle || Date.now() - S.bundle.at <= CACHE_TTL_MS) return false;
  S.bundle = null; S.hours = [];
  dataError(true);
  return true;
}
function recompute() { S.hours = buildHours(S.bundle, S.profile); if (typeof updateRouteWeather === 'function') updateRouteWeather(); }
function paint() { staticText(); RENDER[S.screen]?.(); }

const nowIndex = () => {
  const t = Date.now();
  const i = S.hours.findIndex(h => h.ts > t - 1800e3);
  return i;
};
// Момент в стенных часах места: время в шапке и подписи кадров радара.
const atPlace = (ms) => placeNow(S.bundle, ms);
const timeOrDash = (v) => (v ? hhmm(new Date(v)) : '—');
const nowHour = () => S.hours[nowIndex()] || null;
const runDuration = () => plannedDuration(S.profile.duration, S.plan);
const currentRun = () => currentRunSummary(S.hours, runDuration());
const windowText = w => `${hhmm(w.slice[0].t)} – ${hhmm(w.end)}`;

// ── Статические подписи ────────────────────────────────────────────────────
function staticText() {
  document.documentElement.lang = S.langCode;
  $('#pinIcon').innerHTML = glyph.pin;
  $('#btnLocate').innerHTML = glyph.navigate.replace('#2C3E56', 'currentColor');
  $('#btnAddCity').innerHTML = glyph.plus;
  $('#btnLocate').setAttribute('aria-label', T.myLocation);
  $('#btnAddCity').setAttribute('aria-label', T.addCity);
  $$('[data-back]').forEach(b => b.setAttribute('aria-label', T.back));
  $$('[data-share]').forEach(b => b.setAttribute('aria-label', T.share));
  $('#scoreRunIc').innerHTML = glyph.runner;
  $('#icBest').innerHTML = glyph.alarm;
  $('#icDur').innerHTML = glyph.target;
  $('#icUv').innerHTML = glyph.uv;
  $('#scoreHeadLbl').textContent = T.runningConditions;
  $('#lblBestTime').textContent = T.recommendedStart;
  $('#lblDuration').textContent = T.duration;
  $('#quickDurationLabel').textContent = T.runDuration;
  $('#quickDurationHint').textContent = T.runDurationHint;
  $('#runModeLabel').textContent = T.runModeLabel;
  $$('[data-run-mode]')[0].textContent = T.runModeDuration;
  $$('[data-run-mode]')[1].textContent = T.runModeDistance;
  $('#distanceLabel').textContent = T.distanceLabel;
  $('#paceLabel').textContent = T.paceLabel;
  $('#availabilityLabel').textContent = T.availabilityLabel;
  $('#availabilityFromLabel').textContent = T.availabilityFrom;
  $('#availabilityToLabel').textContent = T.availabilityTo;
  $('#clearAvailability').textContent = T.clearAvailability;
  $('#logRunFeedback').textContent = T.logRun;
  $('#nearTermLabel').textContent = T.nearTermLabel;
  $$('[data-horizon]').forEach(b => { b.textContent = T.horizonHour(Number(b.dataset.horizon)); b.setAttribute('aria-label', `${T.nearTermLabel} ${b.textContent}`); });
  $$('[data-quick-duration]').forEach(b => b.setAttribute('aria-label', T.minutes(Number(b.dataset.quickDuration))));
  $('#lblUv').textContent = T.uvIndex;
  $('#lblViewDetails').textContent = T.dayOverview;
  $('#scoreWhy').textContent = T.whyShort;
  $('#cardScore').setAttribute('aria-label', T.whyScore);
  const segs = [T.nextHours, T.today, T.tenDays];
  $$('.seg').forEach((b, i) => (b.textContent = segs[i]));
  $$('[data-back]').forEach(b => { b.innerHTML = `<svg viewBox="0 0 24 24"><path d="M11 4 4 12l7 8 1.5-1.3L7.2 13H20v-2H7.2l5.3-5.7z"/></svg>`; b.title = T.back; });
  $$('[data-share]').forEach(b => { b.innerHTML = glyph.shareIcon; b.title = T.share; });
  $('#hourlyHead').innerHTML = [T.colTime, T.colWeather, T.colTemp, T.colPrecip, T.colScore]
    .map(x => `<span>${x}</span>`).join('');
  $('#dailyTitle').textContent = T.tenDayTitle;
  const dt = [T.tabTemperature, T.tabPrecipitation, T.tabRunScore];
  $$('.utab[data-dcol]').forEach((b, i) => (b.textContent = dt[i]));
  $('#analysisTitle').textContent = T.runningConditions;
  $('#dayChartTitle').textContent = T.howThroughDay;
  $$('.utab[data-btab]')[0].textContent = T.scoreBreakdown;
  $$('.utab[data-btab]')[1].textContent = T.whatsGood;
  $('#tlLinkIc').innerHTML = glyph.clockG;
  $('#tlLinkK').textContent = T.fullTimeline;
  $('#tlLinkV').textContent = T.timelineTitle;
  $('#tlTitle').textContent = T.timelineTitle;
  $('#tlOptIc').innerHTML = glyph.checkCircle;
  $('#tlOptK').textContent = T.differentWeather;
  $('#tlOptV').textContent = T.seeOptions;
  $('#weatherPlacePin').innerHTML = glyph.pin;
  $('#weatherLocate').innerHTML = glyph.navigate;
  $('#weatherRunIcon').innerHTML = glyph.runner;
  $('#weatherRunTitle').textContent = T.weatherRunNow;
  $('#weatherRunAction').textContent = T.weatherRunAction;
  $('#weatherRadarTitle').textContent = T.weatherRadarTitle;
  $('#weatherRadarSubtitle').textContent = T.weatherRadarSubtitle;
  $('#weatherHourlyTitle').textContent = T.weatherHourlyTitle;
  $('#weatherHourlyMore').textContent = T.weatherHourlyMore;
  $('#weatherDailyTitle').textContent = T.weatherDailyTitle;
  $('#weatherDailyMore').textContent = T.weatherDailyMore;
  $('#weatherAirTitle').textContent = T.weatherAirTitle;
  $$('[data-weather-mode]').forEach(b => {
    b.textContent = b.dataset.weatherMode === 'graph' ? T.weatherHourlyGraph : T.weatherHourlyCards;
  });
  $('#weatherPlace').setAttribute('aria-label', T.cities);
  $('#weatherLocate').setAttribute('aria-label', T.myLocation);
  $('.weather-hourly-mode').setAttribute('aria-label', T.weatherHourlyTitle);
  $('.weather-air-card .weather-card__link').setAttribute('aria-label', T.weatherAirTitle);
  updateRadarExpandControl();
  $('#mapPin').innerHTML = glyph.pin;
  $('#mapLive').textContent = T.liveRadar;
  $('#btnLayers').innerHTML = glyph.layers;
  $('#btnMapLocate').innerHTML = glyph.navigate;
  $('#btnZoomIn').innerHTML = glyph.plus;
  $('#btnZoomOut').innerHTML = glyph.minus;
  $('#btnLayers').setAttribute('aria-label', T.layers);
  $('#mapLayerTitle').textContent = T.layers;
  $('#mapLayerStandard').textContent = T.basemapNames[0];
  $('#mapLayerLight').textContent = T.basemapNames[1];
  $('#mapLayerDark').textContent = T.basemapNames[2];
  syncLayerMenu();
  $('#btnMapLocate').setAttribute('aria-label', T.myLocation);
  $('#btnZoomIn').setAttribute('aria-label', T.zoomIn);
  $('#btnZoomOut').setAttribute('aria-label', T.zoomOut);
  $('#radarTime').setAttribute('aria-label', T.radarTime);
  $('#radarLegend').innerHTML = [T.legLight, T.legModerate, T.legHeavy, T.legExtreme]
    .map(x => `<span>${x}</span>`).join('');
  if (!R.timer) stopPlay();
  if (!R.frames.length) $('#radarLabel').innerHTML = `<b>${T.now}</b>`;
  else { renderTicks(); showFrame(R.idx); }
  $('#detailsTitle').textContent = T.weatherDetails;
  $('#profileTitle').textContent = T.yourProfile;
  $('#langTitle').textContent = T.language;
  $('#appVersionTitle').textContent = T.appVersion;
  $('#whatsNewTitle').textContent = T.whatsNew;
  $('#btnInstall').textContent = T.install;
  $('#tagline').textContent = T.tagline;
  $('#fineprint').textContent = T.dataNote;
  $('#citiesTitle').textContent = T.cities;
  $('#cityQLabel').textContent = T.searchCityLabel;
  $('#cityQ').placeholder = T.searchCity;
  $$('.tab').forEach(b => {
    b.querySelector('.tab__ic').innerHTML = glyph[b.querySelector('.tab__ic').dataset.ic];
    b.querySelector('[data-t]').textContent = T[b.querySelector('[data-t]').dataset.t];
  });
  $$('.tab').forEach(t => t.setAttribute('aria-current', t.dataset.go === tabFor(S.screen) ? 'page' : 'false'));
  ['.seg', '.utab[data-dcol]', '.utab[data-btab]'].forEach(syncPressed);
}

// ── 1. ГЛАВНАЯ ─────────────────────────────────────────────────────────────
function renderHome() {
  const W = S.bundle.weather, cur = W.current, h = nowHour(), d = placeNow(S.bundle);
  $('#placeName').textContent = S.place.name;
  $('#heroDate').textContent = `${dowOf(d)}, ${dateOf(d)} • ${hhmm(d)}`;
  $('#heroIcon').innerHTML = weatherIcon(cur.weather_code, cur.is_day);
  $('#heroTemp').textContent = round(cur.temperature_2m);
  $('#heroCond').textContent = T.weather[cur.weather_code] || '';
  $('#heroFeels').textContent = `${T.feelsLike} ${round(cur.apparent_temperature)}°`;
  $('#heroMinMax').innerHTML =
    `<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
       stroke-linecap="round" stroke-linejoin="round"><path d="M5 15l7-7 7 7"/></svg>${round(W.daily.temperature_2m_max[0])}°</span>
     <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
       stroke-linecap="round" stroke-linejoin="round"><path d="M5 9l7 7 7-7"/></svg>${round(W.daily.temperature_2m_min[0])}°</span>`;

  const recommendation = currentRun();
  const sc = recommendation.score ?? 0, b = band(sc);
  $('#cardScore').className = 'scorecard' + (b === 'good' ? '' : ' is-' + b);
  $('#scoreBig').textContent = sc;
  $('#scoreLabel').textContent = bandText(sc);
  $('#scoreWhy').textContent = T.whyScoreShort(sc);
  $('#cardScore').setAttribute('aria-label', T.scoreExplanation(sc, bandText(sc)));
  const w = recommendation.later;
  $('#scoreSub').textContent = w
    ? T.laterGain(recommendation.gain, T.waitDuration(recommendation.waitMin), sc >= 65)
    : subFor(sc);
  if (recommendation.limiting)
    $('#scoreSub').textContent += ` · ${T.windowLimit(hhmm(recommendation.limiting.hour.t), T.limitReasons[recommendation.limiting.reason])}`;
  const announcement = `${T.runningConditions}: ${sc} ${T.of100}, ${bandText(sc)}. ${$('#scoreSub').textContent}`;
  if ($('#recommendationStatus').textContent !== announcement) $('#recommendationStatus').textContent = announcement;
  $('#factWindow').textContent = w
    ? `${windowText(w)} · ${w.score}/100${recommendation.overnight ? ` · ${T.overnightWindow}` : ''}`
    : recommendation.nowScore == null ? '—' : T.now;
  $('#factDuration').textContent = T.min(runDuration());
  $('#runScenario').textContent = recommendation.nowScore == null ? '' : T.currentScoreScenario(runDuration());
  const near = nearTermRecommendation(S.hours, runDuration(), S.horizon);
  $('#nearTermAdvice').textContent = !near ? T.nearTermUnavailable : near.later
    ? T.nearTermWait(near.nowScore, near.later.score,
      T.waitDuration(Math.max(15, Math.round(near.later.waitMin / 15) * 15))) : T.nearTermNow;
  const tips = runAdvice(near?.later || near?.current, runDuration());
  const personal = effortHint(S.history, sc);
  const personalText = personal ? T.personalEffort(personal.count,
    personal.tendency === 'harder' ? T.tendencyHarder : personal.tendency === 'easier' ? T.tendencyEasier : T.tendencyExpected) : '';
  const adviceText = [...tips.map(key => T.runTips[key]), personalText].filter(Boolean).join(' ');
  $('#runAdvice').textContent = adviceText;
  $('#runAdvice').hidden = !adviceText;
  $$('[data-horizon]').forEach(b => {
    const active = Number(b.dataset.horizon) === S.horizon;
    b.classList.toggle('is-on', active);
    b.setAttribute('aria-pressed', String(active));
  });
  $$('[data-quick-duration]').forEach(b => {
    const active = S.plan.mode === 'duration' && Number(b.dataset.quickDuration) === runDuration();
    b.classList.toggle('is-on', active);
    b.setAttribute('aria-pressed', String(active));
  });
  $('#factUv').textContent = `${(h?.uv ?? 0).toFixed(0)} (${uvWord(h?.uv ?? 0)})`;
  renderPlanControls();
  renderRunMiniTimeline();
  renderRouteWeatherHome();
  renderStartCompare();
  renderWatchControl();
  $('#updatedAt').textContent = freshness(S.bundle.at, Date.now(), S.cached, T);
  renderStrip();
}

function renderPlanControls() {
  $$('[data-run-mode]').forEach(b => {
    const active = b.dataset.runMode === S.plan.mode;
    b.classList.toggle('is-on', active);
    b.setAttribute('aria-pressed', String(active));
  });
  $('.duration-quick').hidden = S.plan.mode !== 'duration';
  $('#distancePlan').hidden = S.plan.mode !== 'distance';
  $('#distanceKm').value = String(S.plan.distanceKm);
  $('#paceInput').value = paceText(S.plan.paceSecPerKm);
  $('#distanceSummary').textContent = T.distanceSummary(
    Number(S.plan.distanceKm.toFixed(1)), paceText(S.plan.paceSecPerKm), runDuration());
  $('#availableFrom').value = S.plan.availableFrom;
  $('#availableTo').value = S.plan.availableTo;
  $('#clearAvailability').hidden = !hasAvailability(S.plan);
}

function renderRunMiniTimeline() {
  const box = $('#runMiniTimeline'), run = currentRun(), w = run.window;
  if (!w?.slice?.length) { box.innerHTML = ''; return; }
  const points = w.slice.map(h => ({ time: hhmm(h.t), score: h.score, temp: round(h.temp), end: false }));
  const last = w.slice.at(-1);
  points.push({ time: hhmm(w.end), score: last.score, temp: round(last.temp), end: true });
  box.innerHTML = `<div class="run-mini__head"><b>${T.runTimelineTitle}</b><span>${T.min(runDuration())}</span></div>
    <div class="run-mini__track">${points.map((p, i) => `
      <div class="run-mini__point${p.end ? ' is-end' : ''}">
        <span class="run-mini__dot" style="background:${bandColor(p.score)}"></span>
        <b>${p.time}</b><small>${p.end ? T.runTimelineEnd : `${p.score}/100 · ${p.temp}°`}</small>
      </div>`).join('')}</div>`;
}

function plannerStartOptions() {
  const fromMin = timeToMinutes(S.plan.availableFrom), toMin = timeToMinutes(S.plan.availableTo);
  return runStartOptions(S.hours, runDuration(), {
    horizonHours: 4,
    fromMin: hasAvailability(S.plan) ? fromMin : null,
    toMin: hasAvailability(S.plan) ? toMin : null
  });
}

function renderStartCompare() {
  const box = $('#startCompare'), options = plannerStartOptions();
  const best = bestStartOption(options);
  box.innerHTML = `<div class="start-compare__head">${T.compareStarts}</div>` +
    (options.length ? `<div class="start-compare__grid">${options.slice(0, 6).map((o, i) => {
      const isBest = o === best;
      return `<div class="start-option${isBest ? ' is-best' : ''}">
        <span>${o.waitMin <= 30 && i === 0 ? T.startNow : hhmm(o.slice[0].t)}</span>
        <b style="color:${bandColor(o.score)}">${o.score}</b>
        <small>${isBest ? T.startBest : windowText(o)}</small>
      </div>`;
    }).join('')}</div>` : `<p class="start-compare__empty">${T.noStartOptions}</p>`);
}

function renderWatchControl() {
  const button = $('#watchBest'), status = $('#watchStatus');
  const active = !!S.watch?.enabled || !!S.backgroundWatch?.active;
  button.textContent = active ? T.stopWatch : T.watchBest;
  button.classList.toggle('is-on', active);
  status.hidden = !active;
  if (!active) { status.textContent = ''; return; }
  if ('Notification' in window && Notification.permission === 'denied') {
    status.textContent = T.watchPermission; return;
  }
  if (S.backgroundWatchSyncing) { status.textContent = T.watchBackgroundConnecting; return; }
  if (S.backgroundWatch?.active) { status.textContent = T.watchBackgroundActive; return; }
  if (S.backgroundWatchReason === 'unsupported') { status.textContent = T.watchBackgroundUnsupported; return; }
  if (S.backgroundWatchReason === 'backend') { status.textContent = T.watchBackgroundUnavailable; return; }
  status.textContent = T.watchLocalOnly;
}

async function syncBackgroundWatch() {
  if (!S.watch?.enabled) return;
  S.backgroundWatchSyncing = true; S.backgroundWatchReason = null;
  if (S.bundle) renderWatchControl();
  const result = await enableBackgroundWatch({
    place: S.place, profile: S.profile, plan: S.plan, lang: S.langCode
  });
  S.backgroundWatchSyncing = false;
  if (result.ok) {
    S.backgroundWatch = result.state; S.backgroundWatchReason = null;
  } else {
    S.backgroundWatch = null; S.backgroundWatchReason = result.reason;
  }
  if (S.bundle) renderWatchControl();
}

async function sendWatchNotification(option) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !option) return;
  const title = T.watchChangedTitle, body = T.watchChangedBody(windowText(option), option.score);
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, { body, tag: 'run-weather-watch', renotify: true });
    } else {
      new Notification(title, { body, tag: 'run-weather-watch' });
    }
  } catch {}
}

function checkWatch() {
  if (!S.watch?.enabled || !S.bundle) return;
  const key = `${S.place.lat.toFixed(2)},${S.place.lon.toFixed(2)}`;
  if (S.watch.placeKey !== key) return;
  const option = bestStartOption(plannerStartOptions());
  const change = watchChange(S.watch, option);
  if (!change || !option) return;
  sendWatchNotification(option);
  S.watch = makeWatch(option, S.place, runDuration());
  saveWatch(S.watch);
}

let routeRequestId = 0, routeController;

function routeStartWindow() {
  if (!S.hours.length) return null;
  if (hasAvailability(S.plan)) return bestStartOption(plannerStartOptions()) || currentRun().window;
  return currentRun().window;
}

function routeStartMs() {
  return routeStartWindow()?.slice?.[0]?.ts ?? Date.now();
}

function updateRouteWeather() {
  if (!S.route || !S.routeForecast) { S.routeWeather = null; return; }
  S.routeWeather = routeWeatherAt(S.routeForecast, S.route, routeStartMs(), runDuration());
}

function renderRouteWeatherViews() {
  if (!S.bundle) return;
  renderRouteWeatherHome();
  if (S.screen === 'details') renderRouteWeatherDetails();
}

async function refreshRouteForecast() {
  if (!S.route) {
    routeController?.abort();
    S.routeForecast = null; S.routeWeather = null;
    S.routeWeatherLoading = false; S.routeWeatherError = false;
    renderRouteWeatherViews(); return;
  }
  const id = ++routeRequestId;
  routeController?.abort();
  routeController = new AbortController();
  S.routeWeatherLoading = true; S.routeWeatherError = false;
  renderRouteWeatherViews();
  try {
    const forecast = await fetchRouteForecast(S.route, { signal: routeController.signal });
    if (id !== routeRequestId) return;
    S.routeForecast = forecast;
    updateRouteWeather();
  } catch (error) {
    if (id !== routeRequestId || error?.name === 'AbortError') return;
    S.routeForecast = null; S.routeWeather = null; S.routeWeatherError = true;
  } finally {
    if (id === routeRequestId) {
      S.routeWeatherLoading = false;
      renderRouteWeatherViews();
    }
  }
}

function routeWindLabel() {
  updateRouteWeather();
  if (S.routeWeather?.availableCount) {
    return T.routeWindSampled(round(S.routeWeather.maxHeadwind ?? 0), round(S.routeWeather.maxCrosswind ?? 0));
  }
  const first = currentRun().window?.slice?.[0];
  const kind = routeWindContext(S.route, first?.windDir);
  return kind ? T[kind] : T.windUnknown;
}

function routeAlertText(key) {
  return T.routeAlerts?.[key] || key;
}

function routeWeatherSummaryBits(rw) {
  if (!rw) return [];
  const temp = rw.tempMin == null || rw.tempMax == null ? null
    : T.routeTempRange(round(rw.tempMin), round(rw.tempMax));
  const rain = rw.maxPop == null ? null : T.routeRainMax(round(rw.maxPop));
  const wind = rw.maxHeadwind == null ? null : T.routeHeadwindMax(round(rw.maxHeadwind));
  return [temp, rain, wind].filter(Boolean);
}

function routeWeatherPanel({ detailed = false } = {}) {
  if (!S.route) return '';
  if (S.routeWeatherLoading && !S.routeWeather) {
    return `<div class="routewx__head"><b>${T.routeWeatherTitle}</b><span>${T.routeWeatherLoading}</span></div>`;
  }
  if (S.routeWeatherError && !S.routeWeather) {
    return `<div class="routewx__head"><b>${T.routeWeatherTitle}</b></div>
      <p class="routewx__note">${T.routeWeatherUnavailable}</p>`;
  }
  updateRouteWeather();
  const rw = S.routeWeather;
  if (!rw) return `<div class="routewx__head"><b>${T.routeWeatherTitle}</b><span>${T.routeWeatherLoading}</span></div>`;
  const start = routeStartWindow()?.slice?.[0];
  const coverage = Math.round(rw.coverage * 100);
  const alerts = rw.alerts?.length
    ? `<div class="routewx__alerts">${rw.alerts.map(a => `<span>${routeAlertText(a)}</span>`).join('')}</div>`
    : `<div class="routewx__alerts"><span class="is-clear">${T.routeNoAlerts}</span></div>`;
  const points = rw.points.map((p, i) => {
    const w = p.weather;
    if (!w) return `<div class="routewx__point is-missing"><b>${p.distanceKm.toFixed(1)} km</b><small>—</small></div>`;
    const kind = w.kind ? T[w.kind] : T.windUnknown;
    return `<div class="routewx__point${i === rw.worstIndex ? ' is-worst' : ''}">
      <b>${p.distanceKm.toFixed(1)} km</b>
      <span>${hhmm(atPlace(p.etaMs))} · ${round(w.temp)}°</span>
      <small>${round(w.pop ?? 0)}% · ${kind}</small>
    </div>`;
  }).join('');
  const source = rw.stale ? T.routeForecastStale : rw.cached ? T.routeForecastCached : '';
  return `<div class="routewx__head"><b>${T.routeWeatherTitle}</b>
      <span>${start ? T.routeStartAt(hhmm(start.t)) : ''}</span></div>
    <div class="routewx__summary">${routeWeatherSummaryBits(rw).map(x => `<span>${x}</span>`).join('')}</div>
    ${alerts}
    <div class="routewx__track">${points}</div>
    ${coverage < 100 ? `<p class="routewx__note">${T.routeCoverage(rw.availableCount, rw.totalCount)}</p>` : ''}
    ${source ? `<p class="routewx__note">${source}</p>` : ''}
    ${detailed ? `<p class="routewx__note">${T.routeSeparateScore}</p>` : ''}`;
}

function renderRouteWeatherHome() {
  const box = $('#routeWeatherHome');
  if (!box) return;
  box.hidden = !S.route;
  box.innerHTML = S.route ? routeWeatherPanel() : '';
}

function renderRouteWeatherDetails() {
  const box = $('#routeWeatherDetails');
  if (!box) return;
  box.hidden = !S.route;
  box.innerHTML = S.route ? routeWeatherPanel({ detailed: true }) : '';
}

function renderStrip() {
  const box = $('#strip'), n = Math.max(0, nowIndex());
  if (S.range === 'days') {
    const D = S.bundle.weather.daily;
    box.innerHTML = D.time.map((t, i) => {
      const dt = new Date(t + 'T12:00');
      const bw = bestWindowOfDay(S.hours, t, runDuration());
      return `<div class="hitem"><div class="hitem__t">${dowOf(dt)}</div>
        <div class="hitem__i">${weatherIcon(D.weather_code[i], 1)}</div>
        <div class="hitem__d">${round(D.temperature_2m_max[i])}°</div>
        ${bw ? `<span class="pill s-${band(bw.score)}">${bw.score}</span>` : ''}</div>`;
    }).join('');
  } else {
    const count = S.range === 'today' ? 24 : 8;
    box.innerHTML = S.hours.slice(n, n + count).map((h, i) => `
      <div class="hitem${i === 0 ? ' is-now' : ''}">
        <div class="hitem__t">${pad(h.t.getHours())}</div>
        <div class="hitem__i">${weatherIcon(h.code, h.isDay)}</div>
        <div class="hitem__d">${round(h.temp)}°</div>
        <span class="pill s-${band(h.score)}">${h.score}</span></div>`).join('');
  }
}
$$('.seg[data-range]').forEach(b => b.addEventListener('click', () => {
  $$('.seg[data-range]').forEach(x => x.classList.remove('is-on'));
  b.classList.add('is-on'); S.range = b.dataset.range;
  syncPressed('.seg');
  if (S.range === 'days') { go('daily'); } else renderStrip();
}));
$('#cardScore').addEventListener('click', () => go('why'));
$('#strip').addEventListener('click', () => go(S.range === 'days' ? 'daily' : 'hourly'));
$('#btnPlace').addEventListener('click', () => go('cities'));
$('#btnAddCity').addEventListener('click', () => go('cities'));
$('#btnLocate').addEventListener('click', locate);
$('.duration-quick').addEventListener('click', e => {
  const b = e.target.closest('[data-quick-duration]');
  if (!b) return;
  S.plan.mode = 'duration'; saveRunPlan(S.plan);
  if (selectDuration(S.profile, b.dataset.quickDuration, saveProfile) && S.bundle) recompute();
  if (S.bundle) paint();
});
$('.near-term__choices').addEventListener('click', e => {
  const b = e.target.closest('[data-horizon]');
  if (!b) return;
  S.horizon = Number(b.dataset.horizon);
  if (S.bundle) renderHome();
});

$('.run-mode__choices').addEventListener('click', e => {
  const b = e.target.closest('[data-run-mode]'); if (!b) return;
  S.plan.mode = b.dataset.runMode; saveRunPlan(S.plan);
  if (S.bundle) paint();
});
$('.distance-plan__presets').addEventListener('click', e => {
  const b = e.target.closest('[data-distance]'); if (!b) return;
  S.plan.distanceKm = Number(b.dataset.distance); saveRunPlan(S.plan);
  if (S.bundle) paint();
});
$('#distanceKm').addEventListener('change', e => {
  const v = Math.max(1, Math.min(100, Number(e.target.value) || 10));
  S.plan.distanceKm = Math.round(v * 10) / 10; saveRunPlan(S.plan);
  if (S.bundle) paint();
});
$('#paceInput').addEventListener('change', e => {
  const pace = parsePace(e.target.value);
  if (pace == null) { e.target.value = paceText(S.plan.paceSecPerKm); return; }
  S.plan.paceSecPerKm = pace; saveRunPlan(S.plan);
  if (S.bundle) paint();
});
for (const id of ['availableFrom','availableTo']) {
  $('#' + id).addEventListener('change', e => {
    S.plan[id === 'availableFrom' ? 'availableFrom' : 'availableTo'] = e.target.value;
    saveRunPlan(S.plan); if (S.bundle) paint();
  });
}
$('#clearAvailability').addEventListener('click', () => {
  S.plan.availableFrom = ''; S.plan.availableTo = ''; saveRunPlan(S.plan);
  if (S.bundle) paint();
});

$('#watchBest').addEventListener('click', async () => {
  if (S.watch?.enabled || S.backgroundWatch?.active) {
    S.watch = null; saveWatch(null);
    S.backgroundWatch = null; S.backgroundWatchReason = null; S.backgroundWatchSyncing = false;
    if (S.bundle) renderHome();
    await disableBackgroundWatch();
    return;
  }
  const option = bestStartOption(plannerStartOptions()) || currentRun().window;
  if (!option) return;
  if ('Notification' in window && Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch {}
  }
  S.watch = makeWatch(option, S.place, runDuration()); saveWatch(S.watch);
  if (S.bundle) renderHome();
  await syncBackgroundWatch();
});
$('#logRunFeedback').addEventListener('click', () => openFeedbackSheet());

function locate() {
  if (!navigator.geolocation) return toast(T.myLocation + ' —');
  navigator.geolocation.getCurrentPosition(async pos => {
    const p = await reverseGeocode(+pos.coords.latitude.toFixed(3),
      +pos.coords.longitude.toFixed(3), S.langCode, T.myLocation);
    if (!validPlace(p)) return;
    S.place = p; const c = loadCities(); c[0] = p; saveCities(c); load();
  }, () => toast(T.searchOffline), { timeout: 8000, maximumAge: 6e5 });
}

// ── 2. ПОЧАСОВОЙ ───────────────────────────────────────────────────────────
function renderHourly() {
  const d = placeNow(S.bundle);
  $('#hourlyCity').textContent = S.place.name;
  $('#hourlyDate').textContent = `${dowOf(d)}, ${dateOf(d)}`;
  const n = nowIndex(), list = S.hours.slice(n, n + 24);
  const w = bestWindow(S.hours, runDuration());
  const win = new Set(w ? w.slice.map(x => x.iso) : []);

  $('#hourlyRows').innerHTML = list.map((h, i) => `
    <button class="trow${win.has(h.iso) ? ' is-now' : ''}" data-hour="${h.iso}">
      <span class="trow__t">${pad(h.t.getHours())}:00${i === 0 ? `<small>${T.now.toLowerCase()}</small>` : ''}</span>
      <span class="trow__i">${weatherIcon(h.code, h.isDay)}</span>
      <span class="trow__temp">${round(h.temp)}°</span>
      <span class="trow__p">${h.pop}%</span>
      <span class="trow__s"><span class="pill s-${band(h.score)}">${h.score}</span></span>
    </button>`).join('');

  const c = $('#windowCard');
  if (!w) return (c.innerHTML = '');
  const s = w.slice[0];
  const tMin = Math.min(...w.slice.map(x => x.feels)), tMax = Math.max(...w.slice.map(x => x.feels));
  const items = [
    [s.feels >= 6 && s.feels <= 20, s.feels < 6 ? T.chkTempCold(round(s.feels))
      : s.feels > 20 ? T.chkTempWarm(round(s.feels))
      : round(tMin) === round(tMax) ? T.chkTempCold(round(tMin)).replace(/^\S+/, m => m)
      : T.chkTemp(round(tMin), round(tMax))],
    [s.pop <= 25, s.pop <= 25 ? T.chkRain(s.pop) : T.chkRainHigh(s.pop)],
    [s.wind <= 15, s.wind <= 15 ? T.chkWind(round(s.wind)) : T.chkWindHigh(round(s.wind))],
    [s.uv <= 5, s.uv <= 5 ? T.chkUv(s.uv.toFixed(0)) : T.chkUvHigh(s.uv.toFixed(0))]
  ];
  if (s.aqi != null) items.push([s.aqi <= 40, s.aqi <= 40 ? T.chkAir : T.chkAirBad]);

  c.innerHTML = `
    <div class="windowcard__when">${windowText(w)}</div>
    <div class="windowcard__head">${glyph.checkCircle.replace('#1F9D4D', bandColor(w.score))}
      <b style="color:${bandColor(w.score)}">${w.score >= 88 ? T.excellentWindow : w.score >= 80 ? T.goodWindow : T.bestWindow}</b></div>
    <p class="windowcard__when">${T.windowLimit(hhmm(w.limiting.hour.t), T.limitReasons[w.limiting.reason])}</p>
    <ul class="checks">${items.map(([ok, txt]) =>
      `<li class="${ok ? '' : 'warn'}"><svg viewBox="0 0 24 24">${ok
        ? '<path d="M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7Z"/>'
        : '<path d="M12 3 1.5 21h21L12 3Zm1 13h-2v2h2v-2Zm0-6h-2v5h2v-5Z"/>'}</svg><span>${txt}</span></li>`).join('')}</ul>
    <button class="linkrow" data-go="why">${T.whyThisWindow}
      <svg viewBox="0 0 24 24" class="i14"><path d="M11 4v12.2l-4.6-4.6L5 13l7 7 7-7-1.4-1.4-4.6 4.6V4z"/></svg></button>`;
}
$('#hourlyRows').addEventListener('click', e => {
  const b = e.target.closest('[data-hour]'); if (!b) return;
  const h = S.hours.find(x => x.iso === b.dataset.hour); if (h) openHourSheet(h);
});

// ── 3. 10 ДНЕЙ ─────────────────────────────────────────────────────────────
$$('.utab[data-dcol]').forEach(b => b.addEventListener('click', () => {
  $$('.utab[data-dcol]').forEach(x => x.classList.remove('is-on'));
  b.classList.add('is-on'); S.dcol = b.dataset.dcol; renderDaily();
  syncPressed('.utab[data-dcol]');
}));

function renderDaily() {
  const D = S.bundle.weather.daily;
  const lastCol = S.dcol === 'score' ? T.colBestRun : S.dcol === 'precip' ? T.colPrecip : T.colMinMax;
  $('#dailyHead').innerHTML = [T.colDay, T.colWeather, T.colTemp, T.colPrecip, lastCol, '']
    .map(x => `<span>${x}</span>`).join('');

  let bestI = -1, bestV = -1;
  const sc = D.time.map((t, i) => {
    const bw = bestWindowOfDay(S.hours, t, runDuration());
    const v = bw ? bw.score : null;
    if (v != null && v > bestV) { bestV = v; bestI = i; }
    return v;
  });

  $('#dailyRows').innerHTML = D.time.map((t, i) => {
    const dt = new Date(t + 'T12:00'), v = sc[i];
    let last;
    if (S.dcol === 'score') {
      last = v == null ? '—' : i === bestI
        ? `<span class="pill pill--soft pill--best s-${band(v)}"><small>${T.best}</small>${v}</span>`
        : `<span class="pill pill--soft s-${band(v)}">${v}</span>`;
    } else if (S.dcol === 'precip') {
      last = `<span class="trow__p">${D.precipitation_probability_max[i] ?? 0}%</span>`;
    } else {
      last = `<span class="trow__p">${round(D.temperature_2m_min[i])}°</span>`;
    }
    return `<button class="trow trow--daily${i === bestI && S.dcol === 'score' ? ' is-best' : ''}" data-day="${t}">
      <span class="trow__t">${dowOf(dt)}<small>${dateOf(dt)}</small></span>
      <span class="trow__i">${weatherIcon(D.weather_code[i], 1)}</span>
      <span class="trow__temp"><span class="lo">${round(D.temperature_2m_min[i])}°</span>${round(D.temperature_2m_max[i])}°</span>
      <span class="trow__p">${D.precipitation_probability_max[i] ?? 0}%</span>
      <span class="trow__s">${last}</span>
      <svg viewBox="0 0 24 24" class="i14 chevr"><path d="M9 5l7 7-7 7z"/></svg>
    </button>`;
  }).join('');
}
$('#dailyRows').addEventListener('click', e => {
  const b = e.target.closest('[data-day]'); if (b) openDaySheet(b.dataset.day);
});

// ── Кольцо ─────────────────────────────────────────────────────────────────
function ring(score, size = 112) {
  const R = 46, C = 2 * Math.PI * R, gap = 0.22;      // разрыв снизу, как в макете
  const arc = C * (1 - gap), off = arc * (1 - score / 100);
  const col = bandColor(score);
  return `<svg class="ring" viewBox="0 0 112 112" style="width:${size}px;height:${size}px">
    <defs><linearGradient id="rg${score}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${col}" stop-opacity=".65"/><stop offset="100%" stop-color="${col}"/></linearGradient></defs>
    <g transform="rotate(${90 + gap * 180} 56 56)">
      <circle cx="56" cy="56" r="${R}" fill="none" stroke="#EDF1F6" stroke-width="9"
        stroke-linecap="round" stroke-dasharray="${arc} ${C}"/>
      <circle cx="56" cy="56" r="${R}" fill="none" stroke="url(#rg${score})" stroke-width="9"
        stroke-linecap="round" stroke-dasharray="${arc} ${C}" stroke-dashoffset="${off}"/>
    </g>
    <text x="56" y="55" text-anchor="middle" class="ring__v" fill="#14213A">${score}</text>
    <text x="56" y="74" text-anchor="middle" class="ring__l" fill="#14213A">${bandText(score)}</text>
  </svg>`;
}

// ── 4. ОБЗОР ───────────────────────────────────────────────────────────────
function renderAnalysis() {
  const run = currentRun(), sc = run.score ?? 0;
  const h = run.window?.limiting.hour || run.window?.slice[0] || nowHour();
  const w = bestWindow(S.hours, runDuration());
  $('#ringWrap').innerHTML = ring(sc) +
    `<div class="ringcap" style="color:${bandColor(sc)}">${subFor(sc)}</div>`;

  const rows = [
    [T.bestTime, w ? windowText(w) : '—', ''],
    [T.duration, T.min(runDuration()), runDuration() === 60 ? `<em>(${T.defaultWord})</em>` : ''],
    [T.mainConditions, run.limiting ? T.windowLimit(hhmm(run.limiting.hour.t), T.limitReasons[run.limiting.reason]) : mainConditions(h), '']
  ];
  $('#analysisChecks').innerHTML = rows.map(([k, v, extra]) =>
    `<li>${glyph.checkCircle}<span><b>${k}</b><span class="v">${v}${extra}</span></span></li>`).join('');

  drawDayChart();

  const title = sc >= 80 ? T.thingsGreat : sc >= 65 ? T.thingsOk : T.thingsPoor;
  $('#analysisNote').innerHTML = `
    <div class="notecard__top">${weatherIcon(h?.code ?? 0, h?.isDay ?? 1).replace('viewBox="0 0 64 72"', 'viewBox="6 6 52 52"')}
      <div><b>${title}</b><p>${explainRun(run)}</p></div></div>
    <button class="btnwide" data-go="why">${T.whyScore}
      <svg viewBox="0 0 24 24"><path d="M13 5l7 7-7 7-1.4-1.4 4.6-4.6H4v-2h12.2L11.6 6.4z"/></svg></button>`;
}

function mainConditions(h) {
  if (!h) return '—';
  const t = h.feels <= 2 ? T.wCold : h.feels <= 11 ? T.wCool : h.feels <= 18 ? T.wMild
    : h.feels <= 24 ? T.wWarm : T.wHot;
  const r = h.pop >= 50 ? T.wWet : T.wDry;
  const wd = h.wind <= 12 ? T.wLightWind : h.wind <= 24 ? T.wModWind : T.wStrongWind;
  return `${t} • ${r} • ${wd}`;
}

const F_NAME = () => ({ temp: T.fTemp, rain: T.fRain, wind: T.fWind, humid: T.fHumid,
  air: T.fAir, uv: T.fUv, surface: T.fSurface, pollen: T.fPollen });

function explainRun(run) {
  if (run.limiting) return T.windowLimit(hhmm(run.limiting.hour.t), T.limitReasons[run.limiting.reason]);
  const weakest = Object.entries(run.factors).sort((a, b) => a[1].value.v - b[1].value.v)[0];
  return weakest ? T.runWeakest(F_NAME()[weakest[0]], hhmm(weakest[1].hour.t)) : '';
}

function scoreBandRects(y, left, right) {
  const bands = [
    [100, 80, '#EAF7EE'], [80, 65, '#FFF7D8'], [65, 45, '#FFF0E4'], [45, 0, '#FDEBE8']
  ];
  return bands.map(([hi, lo, fill]) =>
    `<rect x="${left}" y="${y(hi)}" width="${right - left}" height="${Math.max(0, y(lo) - y(hi))}" fill="${fill}"/>`).join('');
}

// График «как меняется в течение дня» — точки через 2 часа, скобка лучшего окна
function drawDayChart() {
  const n = nowIndex();
  const list = S.hours.slice(n, n + 18).filter((_, i) => i % 2 === 0);
  if (list.length < 3) return;
  const W = 340, H = 150, L = 22, R = 22, TOP = 44, ROW = 96, LBL = 132;
  const step = (W - L - R) / (list.length - 1);
  const y = s => TOP + (100 - s) * 0.38;
  const pts = list.map((h, i) => [L + i * step, y(h.score)]);
  const w = bestWindow(S.hours, runDuration());
  const win = new Set(w ? w.slice.map(x => x.iso) : []);
  const inWin = list.map(h => win.has(h.iso));
  const first = inWin.indexOf(true), last = inWin.lastIndexOf(true);

  const seg = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  let bracket = '';
  if (first >= 0) {
    let x1 = pts[first][0], x2 = pts[Math.max(last, first)][0];
    if (x2 - x1 < 26) { const m = (x1 + x2) / 2; x1 = m - 13; x2 = m + 13; }
    const mid = (x1 + x2) / 2;
    bracket = `<path d="M${x1} 34 v-6 H${x2} v6" fill="none" stroke="#9FB3C8" stroke-width="1.4"/>
      <text x="${mid}" y="14" text-anchor="middle" font-size="10.5" font-weight="600" fill="#3D4C66">${T.bestTime}</text>
      <text x="${mid}" y="25" text-anchor="middle" font-size="11.5" font-weight="700" fill="#14213A">${w ? windowText(w) : ''}</text>`;
  }

  $('#dayChart').innerHTML = `
    <svg class="chart" role="img" aria-label="${T.chartSummary(list[0].score, list.at(-1).score, w ? windowText(w) : null)}" viewBox="0 0 ${W} ${H}">
      ${scoreBandRects(y, L, W - R)}
      ${bracket}
      ${pts.map(p => `<line x1="${p[0]}" y1="${p[1] + 7}" x2="${p[0]}" y2="${ROW - 12}"
          stroke="#D8E1EB" stroke-width="1" stroke-dasharray="2 3"/>`).join('')}
      <path d="${seg}" fill="none" stroke="#C7D3E0" stroke-width="1.8"/>
      ${pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="5.5"
          fill="${bandColor(list[i].score)}"/><circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2"
          fill="#fff"/>`).join('')}
      ${pts.map((p, i) => {
        const s = list[i].score, b = band(s);
        const bg = { good: '#D7F0DF', mid: '#FBEEB4', low: '#FBDCC0', bad: '#F8D5CF' }[b];
        const fg = { good: '#166534', mid: '#7A5A05', low: '#8A3F0D', bad: '#8E241B' }[b];
        return `<rect x="${p[0] - 15}" y="${ROW - 12}" width="30" height="24" rx="12" fill="${bg}"/>
          <text x="${p[0]}" y="${ROW + 4}" text-anchor="middle" font-size="12.5" font-weight="700" fill="${fg}">${s}</text>`;
      }).join('')}
      ${pts.map((p, i) => `<text x="${p[0]}" y="${LBL}" text-anchor="middle" font-size="10.5"
          fill="#7C8AA1">${pad(list[i].t.getHours())}</text>`).join('')}
    </svg>`;
}

// ── 5. ПОЧЕМУ СЕЙЧАС ХОРОШО ────────────────────────────────────────────────
$$('.utab[data-btab]').forEach(b => b.addEventListener('click', () => {
  $$('.utab[data-btab]').forEach(x => x.classList.remove('is-on'));
  b.classList.add('is-on'); S.btab = b.dataset.btab; renderBreakdown();
  syncPressed('.utab[data-btab]');
}));

function renderWhy() {
  const run = currentRun(), sc = run.score ?? 0;
  $('#whyTitle').textContent = T.whyRun(runDuration());
  $('#whyRing').innerHTML = ring(sc, 120);
  $('#whyCap').textContent = `${subFor(sc)} · ${run.window ? windowText(run.window) : '—'}${run.limiting ? ` · ${T.windowLimit(hhmm(run.limiting.hour.t), T.limitReasons[run.limiting.reason])}` : ''}`;
  renderBreakdown();
}

const FMETA = () => ({
  temp: [T.fTemp, glyph.temp, h => `${round(h.feels)}°`, h =>
    h.factors.temp.v >= 85 ? T.optimalWord : h.feels > 20 ? T.tooWarm.toLowerCase() : T.tooCold.toLowerCase()],
  humid: [T.fHumid, glyph.humid, h => `${round(h.rh)}%`, h =>
    h.factors.humid.v >= 85 ? T.comfortable : h.rh > 62 ? T.highHumidity : T.lowHumidity],
  wind: [T.fWind, glyph.wind, h => `${round(h.wind)} km/h`, h =>
    h.wind <= 9 ? T.light : h.wind <= 20 ? T.moderate.toLowerCase() : T.high.toLowerCase()],
  rain: [T.fRain, glyph.rain, h => `${h.pop}%`, h =>
    h.pop < 15 ? T.veryLow : h.pop < 40 ? T.low.toLowerCase() : T.high.toLowerCase()],
  uv: [T.fUv, glyph.uv, h => `UV ${h.uv.toFixed(0)}`, h => uvWord(h.uv)],
  air: [T.fAir, glyph.air, h => h.aqi == null ? '—' : `${T.aqiWord} ${Math.round(h.aqi)}`,
    h => h.aqi == null ? '' : T.aqiNames[aqiBand(h.aqi)[0]].toLowerCase()],
  surface: [T.fSurface, glyph.surface, h => h.recentMm > 0.5 ? T.wetEstimated : T.dryEstimated, () => ''],
  pollen: [T.fPollen, glyph.leaf, h => `${round(h.pollen ?? 0)}`, h =>
    (h.pollen ?? 0) < 10 ? T.low.toLowerCase() : (h.pollen ?? 0) < 50 ? T.moderate.toLowerCase() : T.high.toLowerCase()]
});

function factorTrend(run, key) {
  const values = (run.window?.slice || []).map(h => h.factors?.[key]?.v).filter(Number.isFinite);
  if (values.length < 2) return T.trendStable;
  const delta = values.at(-1) - values[0];
  return delta >= 5 ? `↗ ${T.trendBetter}` : delta <= -5 ? `↘ ${T.trendWorse}` : `→ ${T.trendStable}`;
}

function renderBreakdown() {
  const run = currentRun(); if (!run.window) return;
  const M = FMETA(), box = $('#breakdown'), es = Object.entries(run.factors);

  if (S.btab === 'good') {
    const good = es.filter(([, v]) => v.value.v >= 78).sort((a, b) => b[1].value.v - a[1].value.v);
    box.innerHTML = good.length
      ? `<ul class="checks" style="padding:8px 4px">${good.map(([k, v]) =>
          `<li><svg viewBox="0 0 24 24"><path d="M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7Z"/></svg>
            <span><b style="color:var(--ink)">${M[k][0]}</b> — ${M[k][2](v.hour)} <em style="color:var(--muted);font-style:normal">(${M[k][3](v.hour)})</em></span></li>`).join('')}</ul>`
      : `<p style="padding:12px 4px;font-size:13.5px;color:var(--muted);margin:0">${T.nothingGood}</p>`;
    return;
  }

  box.innerHTML = `<p class="whycap">${T.runFactorsNote}</p>` + es.sort((a, b) => b[1].value.w - a[1].value.w).map(([k, { value: v, hour: h }]) => {
    const q = M[k][3](h);
    return `<button class="frow" data-factor="${k}">
      <span class="frow__ic">${M[k][1]}</span>
      <span class="frow__k">${M[k][0]}<small>${T.worstAt(hhmm(h.t))} · ${M[k][2](h)}${q ? ` <em>(${q})</em>` : ''} · ${factorTrend(run, k)}</small></span>
      <span class="frow__n" style="color:${bandColor(v.v)}">${Math.round(v.v)}</span>
      <svg viewBox="0 0 24 24" class="i14 chevr"><path d="M9 5l7 7-7 7z"/></svg>
    </button>`;
  }).join('');
}
$('#breakdown').addEventListener('click', e => {
  const b = e.target.closest('[data-factor]');
  if (b) { S.factor = b.dataset.factor; go('factor'); }
});

// ── 6. РАЗБОР ФАКТОРА ──────────────────────────────────────────────────────
const SCALE = (key, h) => ({
  temp: [0, 30, h.feels, ['0°', '6°', '12°', '18°', '24°', '30°+'], T.tooCold, T.fine, T.ideal, T.tooWarm],
  humid: [0, 100, h.rh, ['0%', '20%', '40%', '60%', '80%', '100%'], T.dryWord, T.fine, T.ideal, T.humidWord],
  wind: [0, 45, h.wind, ['0', '9', '18', '27', '36', '45'], T.calm, T.fine, T.pleasant, T.hindering],
  rain: [0, 100, h.pop, ['0%', '20%', '40%', '60%', '80%', '100%'], T.dryWord, T.fine, T.ideal, T.fRain],
  uv: [0, 10, h.uv, ['0', '2', '4', '6', '8', '10'], T.low, T.fine, T.moderate, T.veryHigh],
  air: [0, 100, h.aqi ?? 0, ['0', '20', '40', '60', '80', '100'], T.clean, T.fine, T.ideal, T.dirty],
  surface: [0, 10, h.recentMm, ['0', '2', '4', '6', '8', '10'], T.dryWord, T.fine, T.wet, T.slippery],
  pollen: [0, 200, h.pollen ?? 0, ['0', '40', '80', '120', '160', '200'], T.low, T.fine, T.moderate, T.veryHigh]
}[key]);

const WHY_TEXT = () => S.langCode === 'ru' ? {
  temp: 'Чем жарче, тем больше крови уходит к коже на охлаждение: темп падает, а пульс растёт. Прохлада 8–17° по ощущению даёт лучшую работоспособность.',
  humid: 'При высокой влажности пот хуже испаряется, и тело перегревается даже в умеренную температуру. Низкая влажность помогает охлаждаться эффективнее.',
  wind: 'Встречный ветер добавляет к усилию примерно столько же, сколько подъём в гору, а после остановки быстро выстужает.',
  rain: 'Сам по себе дождь безопасен, но добавляет переохлаждение и натирания. Сила осадков важнее их вероятности.',
  uv: 'При УФ выше 5 нужны крем и кепка, особенно на открытых маршрутах и длинных пробежках.',
  air: 'На бегу вы вдыхаете в 5–10 раз больше воздуха, чем в покое, поэтому загрязнение бьёт сильнее, чем при прогулке.',
  surface: 'Недавний дождь и температура около нуля — главные причины скользкой дорожки и подвёрнутых стоп.',
  pollen: 'При аллергии высокая пыльца сужает дыхательные пути и заметно портит дыхание на темповых отрезках.'
} : {
  temp: 'The hotter it gets, the more blood is diverted to the skin for cooling: pace drops and heart rate climbs. A felt temperature of 8–17° gives you the best output.',
  humid: 'High humidity stops sweat evaporating, so you overheat even at moderate temperatures. Lower humidity helps your body cool down efficiently.',
  wind: 'A headwind adds roughly as much effort as a hill, and it chills you fast once you stop.',
  rain: 'Rain itself is harmless, but it adds chilling and chafing. Intensity matters more than probability.',
  uv: 'Above UV 5 you want sunscreen and a cap, especially on exposed routes and long runs.',
  air: 'Running makes you breathe 5–10 times more air than resting, so pollution hits harder than it would on a walk.',
  surface: 'Recent rain plus temperatures near freezing are the main causes of slick paths and rolled ankles.',
  pollen: 'If you have allergies, high pollen narrows your airways and noticeably hurts breathing during hard efforts.'
};

const SUBROWS = (key, h) => {
  const R = {
    temp: [[T.temperature, `${round(h.temp)}°`, glyph.temp], [T.feelsLike, `${round(h.feels)}°`, glyph.feels],
      [T.dewPoint, `${round(h.dew)}°`, glyph.dew, h.dew < 10 ? T.lowHumidity : T.highHumidity],
      [T.humidity, `${round(h.rh)}%`, glyph.humid]],
    humid: [[T.humidity, `${round(h.rh)}%`, glyph.humid], [T.dewPoint, `${round(h.dew)}°`, glyph.dew],
      [T.feelsLike, `${round(h.feels)}°`, glyph.feels]],
    wind: [[T.fWind, `${round(h.wind)} km/h`, glyph.wind],
      [T.gusts, h.gust ? `${round(h.gust)} km/h` : '—', glyph.wind],
      [T.feelsLike, `${round(h.feels)}°`, glyph.feels]],
    rain: [[T.colPrecip, `${h.pop}%`, glyph.rain], ['mm/h', h.mm.toFixed(1), glyph.rain],
      [T.fSurface, h.recentMm > 0.5 ? T.wetEstimated : T.dryEstimated, glyph.surface]],
    uv: [[T.uvIndex, `${h.uv.toFixed(0)} (${uvWord(h.uv)})`, glyph.uv],
      [T.visibility, h.vis == null ? '—' : `${(h.vis / 1000).toFixed(0)} km`, glyph.eye]],
    air: [['PM2.5', h.pm25 == null ? '—' : `${h.pm25.toFixed(0)} µg/m³`, glyph.air],
      ['PM10', h.pm10 == null ? '—' : `${h.pm10.toFixed(0)} µg/m³`, glyph.air],
      ['NO₂', h.no2 == null ? '—' : `${h.no2.toFixed(0)} µg/m³`, glyph.air],
      ['O₃', h.o3 == null ? '—' : `${h.o3.toFixed(0)} µg/m³`, glyph.air]],
    surface: [[T.fRain, `${h.recentMm.toFixed(1)} mm`, glyph.rain], [T.temperature, `${round(h.temp)}°`, glyph.temp]],
    pollen: [[T.fPollen, `${round(h.pollen ?? 0)}`, glyph.leaf]]
  };
  return R[key] || [];
};

function renderFactor() {
  const key = S.factor, h = currentRun().factors[key]?.hour || nowHour(), f = h?.factors[key];
  if (!f) return back();
  const M = FMETA()[key];
  const [lo, hi, val, ticks, l1, l2, l3, l4] = SCALE(key, h);
  const x = Math.max(2.5, Math.min(97.5, ((val - lo) / (hi - lo)) * 100));
  const col = bandColor(f.v);
  const desc = S.langCode === 'ru'
    ? `${M[0]}: ${M[2](h)}${M[3](h) ? ` — ${M[3](h)}` : ''}. ${T.worstAt(hhmm(h.t))}.`
    : `${M[0]} is ${M[2](h)}${M[3](h) ? ` — ${M[3](h)}` : ''}; ${T.worstAt(hhmm(h.t))}.`;

  $('#factorBody').innerHTML = `
    <div class="fhead"><span class="fhead__ic">${M[1]}</span><h1>${M[0]}</h1></div>
    <div class="fscore">
      <span class="fscore__pill" style="background:${col}">${Math.round(f.v)}</span>
      <div><div class="fscore__of">${T.of100}</div>
        <div class="fscore__w" style="color:${col}">${bandText(f.v)}</div></div>
    </div>
    <p class="fdesc">${desc}</p>
    <div class="scale">
      <div class="scale__bar"><div class="scale__dot" style="left:${x}%"></div></div>
      <div class="scale__lbl"><span>${l1}</span><span>${l2}</span><span>${l3}</span><span>${l4}</span></div>
      <div class="scale__ticks">${ticks.map(t => `<span>${t}</span>`).join('')}</div>
    </div>
    <div class="card" style="margin-top:14px">
      ${SUBROWS(key, h).map(([k, v, ic, note]) => `<div class="drow">
        <span class="drow__ic">${ic}</span><span class="drow__k">${k}</span>
        <span class="drow__v">${v}${note ? `<em>(${note})</em>` : ''}</span>
        <svg viewBox="0 0 24 24" class="i14 chevr"><path d="M9 5l7 7-7 7z"/></svg></div>`).join('')}
      <div class="whybox"><b>${T.whyItMatters}</b><p>${WHY_TEXT()[key]}</p>
        <small>${T.weight(f.w)}</small></div>
    </div>`;
}

// ── 7. ТАЙМЛАЙН ────────────────────────────────────────────────────────────
function renderTimeline() {
  const n = nowIndex(), list = S.hours.slice(n, n + 24);
  if (!list.length) return;
  drawTimelineChart(list);

  const partOf = hr => hr < 5 ? T.night : hr < 11 ? T.morning : hr < 17 ? T.day : hr < 22 ? T.evening : T.night;
  let segs = [];
  for (const h of list) {
    const b = band(h.score), last = segs.at(-1);
    if (last && last.b === b) last.items.push(h); else segs.push({ b, items: [h] });
  }
  segs = segs.filter(s => s.items.length >= 2);
  if (segs.length < 2) {
    segs = [];
    for (const h of list) {
      const name = partOf(h.t.getHours()), last = segs.at(-1);
      if (last && last.name === name) last.items.push(h); else segs.push({ name, items: [h] });
    }
  }

  const ICON = s => s >= 88 ? glyph.smile : s >= 80 ? glyph.checkCircle
    : s >= 65 ? glyph.thermo2 : glyph.hot;

  $('#tlList').innerHTML = segs.slice(0, 5).map(s => {
    const it = s.items, a = it[0].t, z = new Date(it.at(-1).t.getTime() + 3600e3);
    const avg = Math.round(it.reduce((x, h) => x + h.score, 0) / it.length);
    const tmin = Math.min(...it.map(h => h.temp)), tmax = Math.max(...it.map(h => h.temp));
    const pop = Math.max(...it.map(h => h.pop)), wnd = Math.max(...it.map(h => h.wind));
    const uv = Math.max(...it.map(h => h.uv));
    const bits = [
      tmax - tmin < 2 ? T.around(round(tmax)) : `${round(tmin)}–${round(tmax)}°`,
      pop >= 40 ? T.rainLikely(pop) : pop >= 20 ? T.rainChance(pop) : T.dry,
      wnd >= 20 ? T.windUp(round(wnd)) : null,
      uv >= 6 ? T.highUv(uv.toFixed(0)) : null
    ].filter(Boolean).join(', ');
    return `<div class="tlrow"><span class="tlrow__ic">${ICON(avg).replace('#1F9D4D', bandColor(avg))}</span>
      <div><div class="tlrow__h">${s.name ? s.name + ', ' : ''}${hhmm(a)} – ${hhmm(z)}
        <em style="color:${bandColor(avg)}">${bandText(avg)}</em></div>
        <p class="tlrow__p">${bits.charAt(0).toUpperCase() + bits.slice(1)}.</p></div></div>`;
  }).join('');
}

function drawTimelineChart(list) {
  const W = 340, H = 150, L = 12, R = 12, TOP = 44, BASE = 122;
  const pick = list.filter((_, i) => i % 1 === 0);
  const step = (W - L - R) / (pick.length - 1);
  const y = s => TOP + (100 - s) * 0.62;
  const pts = pick.map((h, i) => [L + i * step, y(h.score)]);
  const w = bestWindow(S.hours, runDuration());
  const win = new Set(w ? w.slice.map(x => x.iso) : []);
  const bi = pick.findIndex(h => win.has(h.iso));
  const current = currentRun().window;
  const currentSet = new Set(current ? current.slice.map(x => x.iso) : []);
  const currentIdx = pick.map((h, i) => currentSet.has(h.iso) ? i : -1).filter(i => i >= 0);
  const currentShade = currentIdx.length ? (() => {
    const a = currentIdx[0], z = currentIdx.at(-1);
    const x1 = Math.max(L, pts[a][0] - step * .42);
    const x2 = Math.min(W - R, pts[z][0] + step * .42);
    return `<rect x="${x1.toFixed(1)}" y="${TOP - 14}" width="${Math.max(10, x2 - x1).toFixed(1)}"
      height="${BASE - TOP + 16}" rx="8" fill="#2F6FEB" opacity=".07"/>`;
  })() : '';

  const lines = pts.slice(0, -1).map((p, i) =>
    `<line x1="${p[0].toFixed(1)}" y1="${p[1].toFixed(1)}" x2="${pts[i + 1][0].toFixed(1)}"
       y2="${pts[i + 1][1].toFixed(1)}" stroke="${bandColor(pick[i].score)}" stroke-width="2.4"
       stroke-linecap="round"/>`).join('');
  const area = `M${L} ${BASE} ` + pts.map(p => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ') +
    ` L${pts.at(-1)[0].toFixed(1)} ${BASE} Z`;
  const grid = [...Array(7)].map((_, i) => {
    const gx = L + (W - L - R) / 6 * i;
    return `<line x1="${gx}" y1="${TOP - 12}" x2="${gx}" y2="${BASE}" stroke="#E9EEF4" stroke-width="1"/>`;
  }).join('');

  $('#tlChart').innerHTML = `
    <svg class="chart" role="img" aria-label="${T.chartSummary(pick[0].score, pick.at(-1).score, w ? windowText(w) : null)}" viewBox="0 0 ${W} ${H}">
      <defs><linearGradient id="tla" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2E9E4F" stop-opacity=".2"/>
        <stop offset="100%" stop-color="#2E9E4F" stop-opacity=".02"/></linearGradient></defs>
      ${scoreBandRects(y, L, W - R)}
      ${grid}
      ${currentShade}
      <path d="${area}" fill="url(#tla)"/>
      ${lines}
      ${pts.filter((_, i) => i % 2 === 0).map((p, i) =>
        `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.6" fill="${bandColor(pick[i * 2].score)}"/>`).join('')}
      ${bi >= 0 ? `<line x1="${pts[bi][0].toFixed(1)}" y1="28" x2="${pts[bi][0].toFixed(1)}"
          y2="${pts[bi][1].toFixed(1)}" stroke="#2E9E4F" stroke-width="1.4"/>
        <path d="M${Math.max(6, pts[bi][0] - 22)} 14 l4 4 7-8" fill="none" stroke="#2E9E4F" stroke-width="2.2"
          stroke-linecap="round" stroke-linejoin="round"/>
        <text x="${pts[bi][0] + 4}" y="12" font-size="10.5" font-weight="700" fill="#2E9E4F">${T.bestWindow}</text>
        <text x="${pts[bi][0] + 4}" y="25" font-size="11.5" font-weight="700" fill="#14213A">${w ? windowText(w) : ''}</text>` : ''}
      ${pick.map((h, i) => i % 2 === 0
        ? `<text x="${pts[i][0].toFixed(1)}" y="${BASE + 16}" text-anchor="middle" font-size="10.5"
             fill="#7C8AA1">${pad(h.t.getHours())}</text>` : '').join('')}
    </svg>`;
}

// ── 8. ВОЗДУХ ──────────────────────────────────────────────────────────────
function renderAir() {
  const h = nowHour(), A = S.bundle.air?.hourly;
  if (!A || h?.aqi == null) {
    $('#aqiCard').innerHTML = `<h3 class="card__h card__h--lg">${T.airTitle}</h3>
      <p style="margin:0;font-size:13.5px;color:var(--muted)">${T.noAir}</p>`;
    $('#pollenCard').innerHTML = ''; return;
  }
  const [bi, color] = aqiBand(h.aqi);
  const name = T.aqiNames[bi];
  const hint = h.aqi <= 40 ? T.breathEasy : h.aqi <= 60 ? T.airOkMost
    : h.aqi <= 80 ? T.airEase : h.aqi <= 100 ? T.airIndoor : T.airAvoid;
  const lvl = (ok) => `<span class="tagpill" style="background:${ok ? '#DCF2E3' : '#FBEEB4'};
    color:${ok ? '#166534' : '#7A5A05'}">• ${ok ? T.low : T.moderate}</span>`;

  $('#aqiCard').innerHTML = `
    <h3 class="card__h card__h--lg">${T.airTitle}</h3>
    <div class="aqihead">
      <span class="aqichip" style="background:${color}">${name}</span>
      <div><div class="aqihead__v">${T.aqiWord} ${Math.round(h.aqi)}</div>
      <div class="aqihead__s">${hint}</div></div></div>
    ${[['PM2.5', h.pm25, 25], ['PM10', h.pm10, 50], ['NO<sub>2</sub>', h.no2, 100], ['O<sub>3</sub>', h.o3, 120]]
      .map(([k, v, lim]) => `<div class="arow"><span class="arow__k">${k}</span>
        <span class="arow__v">${v == null ? '—' : v.toFixed(0)} µg/m³</span>
        ${lvl(v != null && v <= lim)}</div>`).join('')}`;

  const ai = A.time.indexOf(h.iso);
  const P = [['willow', 'Willow|Ива', A.alder_pollen?.[ai]], ['birch', 'Birch|Берёза', A.birch_pollen?.[ai]],
    ['grass', 'Grass|Злаки', A.grass_pollen?.[ai]], ['mugwort', 'Mugwort|Полынь', A.mugwort_pollen?.[ai]],
    ['ragweed', 'Ragweed|Амброзия', A.ragweed_pollen?.[ai]], ['olive', 'Olive|Олива', A.olive_pollen?.[ai]]]
    .filter(p => p[2] != null);
  const nameOf = s => s.split('|')[S.langCode === 'ru' ? 1 : 0];
  const plevel = v => v < 10 ? [T.low, '#DCF2E3', '#166534'] : v < 50 ? [T.moderate, '#FBE7C0', '#8A5A0B']
    : v < 500 ? [T.high, '#FBDCC0', '#8A3F0D'] : [T.veryHigh, '#F8D5CF', '#8E241B'];

  $('#pollenCard').innerHTML = `
    <div class="pollenhead">${glyph.leaf}<span>${T.pollenOptional}</span></div>
    ${P.length ? P.map(([kind, nm, v]) => {
      const [w, bg, fg] = plevel(v);
      return `<div class="arow arow--pollen"><span class="arow__ic">${plant(kind)}</span>
        <span class="arow__k">${nameOf(nm)}</span>
        <span class="tagpill" style="background:${bg};color:${fg}">• ${w}</span></div>`;
    }).join('') : `<p style="margin:8px 0 0;font-size:13.5px;color:var(--muted)">${T.noPollen}</p>`}
    <div class="switchrow"><span>${T.considerPollen}</span>
      <button class="switch ${S.profile.pollen === 'on' ? 'is-on' : ''}" id="pollenSwitch" role="switch"
        aria-checked="${S.profile.pollen === 'on'}" aria-label="${T.considerPollen}"></button></div>`;

  $('#pollenSwitch').addEventListener('click', () => {
    S.profile.pollen = S.profile.pollen === 'on' ? 'off' : 'on';
    saveProfile(S.profile); recompute(); paint();
  });
}

// ── 9. WEATHER HUB ─────────────────────────────────────────────────────────
const isPraguePlace = place => /^(prague|praha|prag|прага)$/i.test(String(place?.name || '').trim());

function renderWeatherHub() {
  const W = S.bundle.weather, cur = W.current, h = nowHour(), d = placeNow(S.bundle);
  const hero = $('#weatherHero');
  hero.classList.toggle('is-prague', isPraguePlace(S.place));
  $('#weatherPlaceName').textContent = S.place.name;
  $('#weatherHeroDate').textContent = `${dowOf(d)}, ${dateOf(d)} · ${hhmm(d)}`;
  $('#weatherHeroIcon').innerHTML = weatherIcon(cur.weather_code, cur.is_day);
  $('#weatherHeroTemp').textContent = round(cur.temperature_2m);
  $('#weatherHeroCond').textContent = T.weather[cur.weather_code] || '';
  $('#weatherHeroFeels').textContent = `${T.feelsLike} ${round(cur.apparent_temperature)}°`;
  $('#weatherHeroMinMax').innerHTML =
    `<span>↑ ${round(W.daily.temperature_2m_max[0])}°</span><span>↓ ${round(W.daily.temperature_2m_min[0])}°</span>`;

  const sc = currentRun().score ?? 0;
  const runCard = $('#weatherRunScore');
  runCard.className = `weather-run-score is-${band(sc)}`;
  $('#weatherRunValue').textContent = sc;
  $('#weatherRunBand').textContent = bandText(sc);
  runCard.setAttribute('aria-label', `${T.weatherRunNow}: ${sc} ${T.of100}, ${bandText(sc)}. ${T.weatherRunAction}`);

  renderWeatherHourly();
  renderWeatherDaily();
  renderWeatherAir();
  updateRadarExpandControl();
  initRadar().then(() => setTimeout(() => R.map?.invalidateSize(), 0)).catch(() => {});
}

function renderWeatherHourly() {
  const box = $('#weatherHourly'), n = Math.max(0, nowIndex());
  const list = S.hours.slice(n, n + 8);
  $$('[data-weather-mode]').forEach(b => {
    const active = b.dataset.weatherMode === S.weatherMode;
    b.classList.toggle('is-on', active);
    b.setAttribute('aria-pressed', String(active));
  });
  if (!list.length) { box.innerHTML = ''; return; }

  if (S.weatherMode === 'cards') {
    box.innerHTML = `<div class="weather-hourly__cards">${list.map((h, i) => `
      <button class="weather-hour" type="button" data-hour="${h.iso}">
        <span class="weather-hour__time">${i === 0 ? T.now : hhmm(h.t)}</span>
        <span class="weather-hour__icon">${weatherIcon(h.code, h.isDay)}</span>
        <b>${round(h.temp)}°</b>
        <small>${glyph.rain}<span>${h.pop}%</span></small>
      </button>`).join('')}</div>`;
    return;
  }

  const W = 340, H = 166, L = 18, RGT = 18, TOP = 24, BASE = 118;
  const temps = list.map(h => h.temp);
  const lo = Math.floor(Math.min(...temps) - 2), hi = Math.ceil(Math.max(...temps) + 2);
  const span = Math.max(4, hi - lo);
  const step = (W - L - RGT) / Math.max(1, list.length - 1);
  const y = v => TOP + (hi - v) / span * 62;
  const pts = list.map((h, i) => [L + i * step, y(h.temp)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  box.innerHTML = `<div class="weather-hourly__graph">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${T.weatherHourlyTitle}">
      <path d="${line}" fill="none" stroke="#2F80ED" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      ${pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4" fill="#2F80ED"/>
        <text x="${p[0].toFixed(1)}" y="${Math.max(13,p[1]-10).toFixed(1)}" text-anchor="middle" class="weather-graph__temp">${round(list[i].temp)}°</text>`).join('')}
      ${list.map((h, i) => {
        const x = L + i * step, bh = Math.max(2, h.pop * .30);
        return `<rect x="${(x-9).toFixed(1)}" y="${(BASE-bh).toFixed(1)}" width="18" height="${bh.toFixed(1)}" rx="4" fill="#58A8F6" opacity=".72"/>
          <text x="${x.toFixed(1)}" y="${BASE+14}" text-anchor="middle" class="weather-graph__pop">${h.pop}%</text>
          <text x="${x.toFixed(1)}" y="${H-6}" text-anchor="middle" class="weather-graph__time">${i===0?T.now:`${pad(h.t.getHours())}:00`}</text>`;
      }).join('')}
    </svg>
    <div class="weather-graph__legend"><span><i class="is-temp"></i>${T.temperature}</span><span><i class="is-rain"></i>${T.colPrecip}</span></div>
  </div>`;
}

function renderWeatherDaily() {
  const D = S.bundle.weather.daily;
  $('#weatherDaily').innerHTML = D.time.slice(0, 6).map((iso, i) => {
    const dt = new Date(iso + 'T12:00');
    return `<button type="button" class="weather-day" data-day="${iso}">
      <span class="weather-day__date"><b>${i === 0 ? T.today : dowOf(dt)}</b><small>${dateOf(dt)}</small></span>
      <span class="weather-day__icon">${weatherIcon(D.weather_code[i], 1)}</span>
      <span class="weather-day__temp"><small>${round(D.temperature_2m_min[i])}°</small><b>${round(D.temperature_2m_max[i])}°</b></span>
      <span class="weather-day__rain">${glyph.rain}<b>${D.precipitation_probability_max[i] ?? 0}%</b></span>
      <svg viewBox="0 0 24 24" class="i14 chevr"><path d="M9 5l7 7-7 7z"/></svg>
    </button>`;
  }).join('');
}

function renderWeatherAir() {
  const h = nowHour();
  const box = $('#weatherAir');
  const aqi = h?.aqi;
  const aqiInfo = aqi == null ? null : aqiBand(aqi);
  const aqiName = aqiInfo ? T.aqiNames[aqiInfo[0]] : '—';
  const pollen = h?.pollen;
  const pollenName = pollen == null ? '—' : pollen < 10 ? T.low : pollen < 50 ? T.moderate : pollen < 500 ? T.high : T.veryHigh;
  box.innerHTML = `
    <button class="weather-air__item" type="button" data-go="air">
      <span class="weather-air__ic">${glyph.air}</span>
      <span><small>${T.weatherAqiLabel}</small><b>${aqi == null ? '—' : `${T.aqiWord} ${Math.round(aqi)}`}</b><em>${aqiName}</em></span>
    </button>
    <button class="weather-air__item" type="button" data-go="air">
      <span class="weather-air__ic">${glyph.leaf}</span>
      <span><small>${T.weatherPollen}</small><b>${pollenName}</b><em>${pollen == null ? T.noPollen : ''}</em></span>
    </button>`;
}

function updateRadarExpandControl() {
  const b = $('#weatherRadarExpand');
  if (!b) return;
  b.innerHTML = S.radarExpanded
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4Z"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5v2H6v3H4Zm11-5h5v5h-2V6h-3V4ZM4 15h2v3h3v2H4v-5Zm14 0h2v5h-5v-2h3v-3Z"/></svg>';
  b.setAttribute('aria-label', S.radarExpanded ? T.weatherCloseRadar : T.weatherExpandRadar);
}

function setRadarExpanded(on) {
  S.radarExpanded = !!on;
  const card = $('#weatherRadarCard');
  if (!card) return;
  card.classList.toggle('is-expanded', S.radarExpanded);
  document.body.classList.toggle('radar-expanded', S.radarExpanded);
  updateRadarExpandControl();
  setLayerMenuOpen(false);
  renderTicks();
  setTimeout(() => R.map?.invalidateSize(), 40);
}

$('#weatherPlace').addEventListener('click', () => go('cities'));
$('#weatherLocate').addEventListener('click', locate);
$('.weather-hourly-mode').addEventListener('click', e => {
  const b = e.target.closest('[data-weather-mode]'); if (!b) return;
  S.weatherMode = b.dataset.weatherMode;
  if (S.bundle) renderWeatherHourly();
});
$('#weatherHourly').addEventListener('click', e => {
  const b = e.target.closest('[data-hour]'); if (!b) return;
  const h = S.hours.find(x => x.iso === b.dataset.hour); if (h) openHourSheet(h);
});
$('#weatherDaily').addEventListener('click', e => {
  const b = e.target.closest('[data-day]'); if (b) openDaySheet(b.dataset.day);
});
$('#weatherRadarExpand').addEventListener('click', () => setRadarExpanded(!S.radarExpanded));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && S.radarExpanded) { e.preventDefault(); setRadarExpanded(false); }
});

// // ── 9. РАДАР ───────────────────────────────────────────────────────────────
// Публичный API RainViewer с 2026 года не отдаёт тайлы выше 7-го зума:
// вместо осадков приходит серая заглушка «Zoom Level Not Supported» с кодом 200,
// которую Leaflet принимает за нормальный тайл. Держим карту в этих рамках.
const RADAR_NATIVE_Z = 7;
const MAP_MAX_Z = 10;

const BASEMAPS = [
  ['standard', 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', 'map-base--standard'],
  ['light', 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', 'map-base--light'],
  ['dark', 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', 'map-base--dark']
];
const R = { map: null, base: null, baseIdx: 0, marker: null, frames: [], layers: new Map(),
  idx: 0, timer: null, ready: false, placeKey: '', nowIdx: 0, modelToldOnce: false,
  modelReady: false, modelLoading: false, modelRetryAt: 0 };

const placeKey = p => `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;

function mapState(kind, msg) {
  const el = $('#mapState');
  if (kind === 'hide') { el.hidden = true; $('#radarStatus').textContent = msg || T.layerReady; return; }
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.hidden = false;
  el.innerHTML = kind === 'loading'
    ? `<div class="mapstate__box"><span class="spinner"></span><span>${msg}</span></div>`
    : `<div class="mapstate__box"><span>${msg}</span>
        <button class="mapstate__retry" id="mapRetry">${T.retry}</button></div>`;
  if (kind === 'error') $('#mapRetry').addEventListener('click', () => { R.ready = false; initRadar(); });
}

async function initRadar() {
  $('#mapCity').textContent = S.place.name;

  if (R.ready) {
    R.map.invalidateSize();
    if (R.placeKey !== placeKey(S.place)) {   // сменили город — переносим карту
      R.placeKey = placeKey(S.place);
      R.map.setView([S.place.lat, S.place.lon], R.map.getZoom());
      R.marker.setLatLng([S.place.lat, S.place.lon]);
      dropModelFrames();                     // прогноз построен вокруг прежней точки
    }
    ensureModelForecast();
    return;
  }

  $('#radarPlay').disabled = true; $('#radarTime').disabled = true;
  mapState('loading', T.radarLoading);
  try {
    await loadLeaflet();
    if (!R.map) {
      R.map = L.map('map', { zoomControl: false, attributionControl: true, maxZoom: MAP_MAX_Z })
        .setView([S.place.lat, S.place.lon], RADAR_NATIVE_Z);
      R.map.attributionControl.setPrefix('');
      setBasemap(0);
      R.marker = L.circleMarker([S.place.lat, S.place.lon],
        { radius: 8, color: '#fff', weight: 3, fillColor: '#2F6FEB', fillOpacity: 1 }).addTo(R.map);
      bindMapControls();
    }
    R.placeKey = placeKey(S.place);
    mapState('loading', T.mapReady);
    await loadFrames();
    await firstLayerReady();
    mapState('hide', T.layerReady);
    $('#radarPlay').disabled = false; $('#radarTime').disabled = false;
    R.ready = true;
    // Прогноз тянем отдельно и уже после показа радара: медленный ответ
    // Open-Meteo не должен задерживать карту, а его сбой — ломать радар.
    ensureModelForecast();
  } catch (e) {
    console.error('radar init failed:', e);
    mapState('error', T.radarOffline);
    $('#radarPlay').disabled = true; $('#radarTime').disabled = true;
  }
}

function firstLayerReady() {
  const layer = R.layers.get(R.idx);
  if (!layer || R.frames[R.idx]?.kind === 'model') return Promise.resolve();
  return new Promise((resolve, reject) => {
    let loaded = false;
    const timeout = setTimeout(() => finish(new Error('precipitation timeout')), 12000);
    function finish(error) {
      clearTimeout(timeout);
      layer.off('tileload', onLoad);
      error && !loaded ? reject(error) : resolve();
    }
    function onLoad() { loaded = true; finish(); }
    layer.on('tileload', onLoad);
    if (layer._precipLoaded) finish();
  });
}

function setLayerMenuOpen(on) {
  const menu = $('#mapLayerMenu');
  if (!menu) return;
  menu.hidden = !on;
  $('#btnLayers')?.setAttribute('aria-expanded', String(!!on));
}

function syncLayerMenu() {
  $('[data-map-layer]').forEach(b => {
    const active = Number(b.dataset.mapLayer) === R.baseIdx;
    b.classList.toggle('is-on', active);
    b.setAttribute('aria-pressed', String(active));
  });
}

function setBasemap(i) {
  R.baseIdx = Math.max(0, Math.min(BASEMAPS.length - 1, Number(i) || 0));
  if (R.base) R.map.removeLayer(R.base);
  R.base = L.tileLayer(BASEMAPS[R.baseIdx][1], {
    attribution: '© OpenStreetMap contributors · © RainViewer',
    maxZoom: MAP_MAX_Z,
    zIndex: 100,
    className: BASEMAPS[R.baseIdx][2]
  }).addTo(R.map);
  syncLayerMenu();
}

// Пробный тайл: если 512 px недоступны — молча откатываемся на 256.
let tileSizeCache = null;
function tileSize(host, path) {
  if (tileSizeCache) return Promise.resolve(tileSizeCache);
  return new Promise(res => {
    const img = new Image();
    const done = v => { tileSizeCache = v; res(v); };
    const t = setTimeout(() => done(256), 4000);
    img.onload = () => { clearTimeout(t); done(img.naturalWidth >= 512 ? 512 : 256); };
    img.onerror = () => { clearTimeout(t); done(256); };
    img.src = `${host}${path}/512/1/1/1/4/1_1.png`;
  });
}

async function loadFrames() {
  const j = await fetch('https://api.rainviewer.com/public/weather-maps.json').then(r => {
    if (!r.ok) throw new Error('radar'); return r.json();
  });
  const host = j.host || 'https://tilecache.rainviewer.com';
  const past = j.radar?.past || [], soon = j.radar?.nowcast || [];
  if (!past.length && !soon.length) throw new Error('empty');

  // RainViewer отдаёт максимум 7-й зум, поэтому тайлы всё равно растягиваются.
  // Берём 512 px там, где они есть, — картинка вдвое плотнее при том же охвате.
  const size = await tileSize(host, (past[0] || soon[0]).path);

  R.frames = [...past, ...soon].map(f => ({
    time: f.time * 1000,
    kind: 'radar',
    url: `${host}${f.path}/${size}/{z}/{x}/{y}/4/1_1.png`,
    forecast: f.time * 1000 > Date.now()
  }));
  if (!R.frames.length) throw new Error('empty');

  R.layers.forEach(l => R.map.removeLayer(l));
  R.layers.clear();
  R.modelReady = false;
  R.modelRetryAt = 0;
  R.nowIdx = Math.max(0, past.length - 1);
  R.idx = R.nowIdx;

  const sl = $('#radarTime');
  sl.max = R.frames.length - 1; sl.value = R.idx;
  renderTicks();
  showFrame(R.idx);
}

// ── Прогноз осадков на 6 часов вперёд ──────────────────────────────────────
// RainViewer заглядывает максимум на полчаса. Дальше рисуем уже не радар,
// а модель: сетка точек Open-Meteo, билинейная интерполяция между узлами
// и та же цветовая шкала, что в легенде. Разрешение — десятки километров,
// поэтому слой намеренно полупрозрачнее радарного, а кадр подписан «по модели».
const MODEL_HOURS = 6;
const GRID = 8;                        // 8×8 достаточно для грубого регионального слоя
const MODEL_BATCH = 32;                // небольшие запросы стабильнее одного пакета на сотни точек
const GRID_DLON = 3.4;                 // половина ширины области, градусы
// По вертикали видимая часть карты зависит от широты (проекция Меркатора),
// поэтому высоту области считаем от неё, иначе прогноз не закрывает экран.
const gridDLat = lat => Math.min(4.6, Math.max(2, 4.6 * Math.cos(lat * Math.PI / 180)));

const PRECIP_STOPS = [                 // мм/ч → цвет, совпадает с .radar__grad
  [0.1, [127, 212, 193]], [0.4, [95, 196, 126]], [1, [201, 222, 94]],
  [2, [242, 209, 76]], [4, [238, 154, 63]], [8, [228, 96, 63]],
  [16, [195, 58, 107]], [30, [156, 47, 165]]
];

function precipColor(mm) {
  if (!(mm > 0.08)) return [0, 0, 0, 0];
  let col = PRECIP_STOPS[PRECIP_STOPS.length - 1][1];
  for (let i = 0; i < PRECIP_STOPS.length; i++) {
    const [lim, c] = PRECIP_STOPS[i];
    if (mm <= lim) {
      const [plim, pc] = PRECIP_STOPS[i - 1] || [0, PRECIP_STOPS[0][1]];
      const t = lim > plim ? (mm - plim) / (lim - plim) : 0;
      col = c.map((v, k) => Math.round(pc[k] + (v - pc[k]) * t));
      break;
    }
  }
  return [col[0], col[1], col[2], Math.round(255 * Math.min(1, .3 + mm / 3))];
}

// Сетка 8×8 растягивается на картинку 128×128 — края получаются мягкими.
function paintGrid(vals) {
  const N = 128, cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(N, N);
  for (let y = 0; y < N; y++) {
    const gy = y / (N - 1) * (GRID - 1), y0 = Math.floor(gy), y1 = Math.min(GRID - 1, y0 + 1), ty = gy - y0;
    for (let x = 0; x < N; x++) {
      const gx = x / (N - 1) * (GRID - 1), x0 = Math.floor(gx), x1 = Math.min(GRID - 1, x0 + 1), tx = gx - x0;
      const v = vals[y0][x0] * (1 - tx) * (1 - ty) + vals[y0][x1] * tx * (1 - ty)
              + vals[y1][x0] * (1 - tx) * ty + vals[y1][x1] * tx * ty;
      const c = precipColor(v), p = (y * N + x) * 4;
      img.data[p] = c[0]; img.data[p + 1] = c[1]; img.data[p + 2] = c[2]; img.data[p + 3] = c[3];
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL('image/png');
}

// Модельные кадры всегда лежат в хвосте — их можно отбросить, не трогая радар.
function dropModelFrames() {
  R.modelReady = false;
  R.modelRetryAt = 0;
  const keep = R.frames.filter(f => f.kind !== 'model').length;
  if (keep !== R.frames.length) {
    R.layers.forEach((l, k) => { if (k >= keep) { R.map.removeLayer(l); R.layers.delete(k); } });
    R.frames.length = keep;
    if (R.idx >= keep) R.idx = R.nowIdx;
  }
  const sl = $('#radarTime');
  sl.max = Math.max(0, keep - 1);
  renderTicks();
  if (R.frames[R.idx]) showFrame(R.idx);
}

function ensureModelForecast() {
  if (!R.frames.length || R.modelReady || R.modelLoading || Date.now() < R.modelRetryAt) return;
  R.modelLoading = true;
  loadModel()
    .then(ok => { if (ok) { R.modelReady = true; R.modelRetryAt = 0; } })
    .catch(e => {
      R.modelReady = false;
      R.modelRetryAt = Date.now() + 30000;
      console.warn('precip forecast unavailable:', e);
    })
    .finally(() => {
      R.modelLoading = false;
      if (!R.modelReady && R.placeKey === placeKey(S.place) && Date.now() >= R.modelRetryAt) {
        setTimeout(ensureModelForecast, 0);
      }
    });
}

async function fetchModelBatch(points) {
  const lats = points.map(p => p.lat).join(',');
  const lons = points.map(p => p.lon).join(',');
  const res = await fetch('https://api.open-meteo.com/v1/forecast'
    + `?latitude=${lats}&longitude=${lons}`
    + '&hourly=precipitation&forecast_days=2&timezone=UTC&timeformat=unixtime')
    .then(r => { if (!r.ok) throw new Error('model'); return r.json(); });
  const rows = Array.isArray(res) ? res : [res];
  if (rows.length !== points.length) throw new Error('grid batch');
  return rows;
}

async function loadModel() {
  const key = placeKey(S.place);
  const lat0 = S.place.lat, lon0 = S.place.lon, dLat = gridDLat(lat0);
  const top = Math.min(89.5, lat0 + dLat), bot = Math.max(-89.5, lat0 - dLat);
  const points = [];
  for (let r = 0; r < GRID; r++)
    for (let c = 0; c < GRID; c++) {
      points.push({
        lat: (top - r * (top - bot) / (GRID - 1)).toFixed(2),
        lon: (lon0 - GRID_DLON + c * (2 * GRID_DLON / (GRID - 1))).toFixed(2)
      });
    }

  const batches = [];
  for (let i = 0; i < points.length; i += MODEL_BATCH) batches.push(points.slice(i, i + MODEL_BATCH));
  const pts = (await Promise.all(batches.map(fetchModelBatch))).flat();

  if (pts.length !== GRID * GRID) throw new Error('grid');
  if (key !== placeKey(S.place) || !R.frames.length) return false;   // город успели сменить

  const times = pts[0].hourly.time.map(t => t * 1000);
  const after = R.frames[R.frames.length - 1].time;
  const limit = Date.now() + MODEL_HOURS * 3600e3;
  const bounds = [[bot, lon0 - GRID_DLON], [top, lon0 + GRID_DLON]];
  const add = [];

  for (let h = 0; h < times.length && add.length < MODEL_HOURS; h++) {
    if (!(times[h] > after) || times[h] > limit) continue;
    const vals = [];
    for (let r = 0; r < GRID; r++) {
      const row = [];
      for (let c = 0; c < GRID; c++) row.push(pts[r * GRID + c].hourly?.precipitation?.[h] ?? 0);
      vals.push(row);
    }
    add.push({ time: times[h], kind: 'model', forecast: true, img: paintGrid(vals), bounds });
  }

  if (add.length) {
    R.frames.push(...add);
    const sl = $('#radarTime');
    sl.max = R.frames.length - 1;
    renderTicks();
    showFrame(R.idx);
  }
  return true;
}

// Слои кешируются: кадр не пересоздаётся каждый раз, поэтому нет мигания.
const frameOpacity = i => R.frames[i] && R.frames[i].kind === 'model' ? .55 : .78;

function layerFor(i) {
  if (R.layers.has(i)) return R.layers.get(i);
  const f = R.frames[i];
  const l = f.kind === 'model'
    ? L.imageOverlay(f.img, f.bounds, { opacity: 0, zIndex: 300 + i, interactive: false })
    : L.tileLayer(f.url, {
        opacity: 0, zIndex: 300 + i,
        tileSize: 256,
        maxZoom: MAP_MAX_Z,
        maxNativeZoom: RADAR_NATIVE_Z,   // выше RainViewer отдаёт заглушку «Zoom Level Not Supported»
        updateWhenZooming: false,
        crossOrigin: true
      });
  if (f.kind === 'radar') l.on('tileload', () => { l._precipLoaded = true; });
  l.addTo(R.map);
  R.layers.set(i, l);
  return l;
}

function showFrame(i) {
  if (!R.frames[i]) return;
  R.idx = i;
  const cur = layerFor(i);
  R.layers.forEach((l, k) => l.setOpacity(k === i ? frameOpacity(k) : 0));
  cur.setOpacity(frameOpacity(i));
  layerFor((i + 1) % R.frames.length);            // подгружаем следующий заранее

  const f = R.frames[i];
  const word = f.kind === 'model' ? T.modelWord : f.forecast ? T.forecastWord : T.pastWord;
  $('#radarLabel').innerHTML = i === R.nowIdx
    ? `<b>${T.now}</b>`
    : `<b>${hhmm(atPlace(f.time))}</b><small>${word}</small>`;
  $('#radarTime').value = i;
  $$('#radarTicks span').forEach(el => el.classList.toggle('on', +el.dataset.i === i));

  // Один раз объясняем, что дальше получаса это уже не радар.
  if (f.kind === 'model' && !R.modelToldOnce) { R.modelToldOnce = true; toast(T.modelNote); }
}

function renderTicks() {
  const n = R.frames.length, last = n - 1;
  // Всегда показываем начало, «сейчас» и конец — и ставим метку туда, где кадр на шкале.
  const at = i => (last ? i / last : 0) * 100;
  const MIN = 15;                       // минимальный зазор между метками, %
  const idxs = [];
  const candidates = S.radarExpanded
    ? [0, R.nowIdx, Math.round((R.nowIdx + last) / 2), last]
    : [0, R.nowIdx, last];
  for (const i of candidates) {
    if (i < 0 || i > last) continue;
    if (idxs.some(j => Math.abs(at(j) - at(i)) < MIN)) continue;
    idxs.push(i);
  }
  idxs.sort((a, b) => a - b);
  $('#radarTicks').innerHTML = idxs.map(i => {
    const pos = at(i);
    const shift = i === 0 ? 'translateX(-4px)' : i === last ? 'translateX(-100%)' : 'translateX(-50%)';
    return `<span data-i="${i}" style="left:${pos}%;transform:${shift}"
      class="${i === R.idx ? 'on' : ''}">${i === R.nowIdx ? T.now : hhmm(atPlace(R.frames[i].time))}</span>`;
  }).join('');
}

function bindMapControls() {
  $('#radarTime').addEventListener('input', e => { stopPlay(); showFrame(+e.target.value); });
  $('#radarPlay').addEventListener('click', () => R.timer ? stopPlay() : startPlay());
  $('#btnZoomIn').addEventListener('click', () => R.map.zoomIn());
  $('#btnZoomOut').addEventListener('click', () => R.map.zoomOut());
  $('#btnMapLocate').addEventListener('click', () => R.map.setView([S.place.lat, S.place.lon], 8));
  $('#btnLayers').addEventListener('click', e => {
    e.stopPropagation();
    setLayerMenuOpen($('#mapLayerMenu').hidden);
  });
  $('#mapLayerMenu').addEventListener('click', e => {
    const b = e.target.closest('[data-map-layer]'); if (!b) return;
    e.stopPropagation();
    setBasemap(Number(b.dataset.mapLayer));
    setLayerMenuOpen(false);
    toast(T.basemapNames[R.baseIdx]);
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#mapLayerMenu') && !e.target.closest('#btnLayers')) setLayerMenuOpen(false);
  });
  $('#mapLive').addEventListener('click', () => { stopPlay(); showFrame(R.nowIdx); });
  $('#radarTicks').addEventListener('click', e => {
    const t = e.target.closest('[data-i]'); if (t) { stopPlay(); showFrame(+t.dataset.i); }
  });
}

function startPlay() {
  if (!R.ready || $('#radarPlay').disabled || !R.frames.length) return;
  $('#radarPlay').innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg>';
  $('#radarPlay').setAttribute('aria-label', T.pause);
  const tick = () => {
    const next = (R.idx + 1) % R.frames.length;
    showFrame(next);
    R.timer = setTimeout(tick, next === R.frames.length - 1 ? 1400 : 520); // пауза на последнем кадре
  };
  R.timer = setTimeout(tick, 520);
}
function stopPlay() {
  clearTimeout(R.timer); R.timer = null;
  $('#radarPlay').innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
  $('#radarPlay').setAttribute('aria-label', T.play);
}

function loadLeaflet() {
  if (window.L) return Promise.resolve();
  return new Promise((res, rej) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'vendor/leaflet/leaflet.css';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = 'vendor/leaflet/leaflet.js';
    s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
}

// ── 10. ДЕТАЛИ И ПРОФИЛЬ ───────────────────────────────────────────────────
function renderDetails() {
  const h = nowHour(), D = S.bundle.weather.daily;
  const dl = D.daylight_duration?.[0];
  const f = moonFraction(placeNow(S.bundle));
  const mi = Math.round(f * 8) % 8;

  $('#detailsList').innerHTML = [
    [glyph.uv, T.uvIndex, `${h.uv.toFixed(0)} (${uvWord(h.uv)})`],
    [glyph.eye, T.visibility, h.vis == null ? '—' : `${(h.vis / 1000).toFixed(0)} km`],
    [glyph.sunrise, T.sunrise, timeOrDash(D.sunrise?.[0])],
    [glyph.sunset, T.sunset, timeOrDash(D.sunset?.[0])],
    [glyph.moonphase(f), T.moonPhase, T.moonNames[mi]],
    [glyph.clock, T.daylight, dl ? `${Math.floor(dl / 3600)}h ${Math.round(dl % 3600 / 60)}m` : '—']
  ].map(([ic, k, v]) => `<div class="drow" style="grid-template-columns:26px 1fr auto">
      <span class="drow__ic">${ic}</span><span class="drow__k">${k}</span>
      <span class="drow__v">${v}</span></div>`).join('');

  $('#detailsLinks').innerHTML = [
    [glyph.trend, T.tempTrends, 'hourly'], [glyph.gauge, T.feelsTrend, 'analysis'],
    [glyph.models, T.modelsCompare, 'timeline']
  ].map(([ic, k, to]) => `<button class="drow" data-go="${to}">
      <span class="drow__ic">${ic}</span><span class="drow__k">${k}</span><span></span>
      <svg viewBox="0 0 24 24" class="i14 chevr"><path d="M9 5l7 7-7 7z"/></svg></button>`).join('');

  const P = S.profile;
  const V = {
    heat: { low: T.lowWord, normal: T.normal, high: T.highWord }[P.heat],
    cold: { low: T.lowWord, normal: T.normal, high: T.highWord }[P.cold],
    rain: { drier: T.preferDrier, ok: T.rainFine }[P.rain],
    air: { normal: T.normal, high: T.highWord }[P.air],
    pollen: P.pollen === 'on' ? T.on : T.off,
    duration: T.minutes(P.duration)
  };
  $('#profileList').innerHTML = [
    ['heat', T.heatTolerance, glyph.uv], ['cold', T.coldTolerance, glyph.temp],
    ['rain', T.rainPreference, glyph.rain], ['air', T.airSensitivity, glyph.air],
    ['pollen', T.pollenSensitivity, glyph.leaf], ['duration', T.usualRunDuration, glyph.clock]
  ].map(([k, label, ic]) => `<button class="drow" data-opt="${k}">
      <span class="drow__ic">${ic}</span><span class="drow__k">${label}</span>
      <span class="drow__v" style="font-weight:560;color:var(--ink-2)">${V[k]}</span>
      <svg viewBox="0 0 24 24" class="i14 chevr"><path d="M9 5l7 7-7 7z"/></svg></button>`).join('');

  $('#routeTitle').textContent = T.routeTitle;
  $('#routeImportLabel').textContent = T.routeImport;
  $('#routeClear').textContent = T.routeClear;
  $('#routeClear').hidden = !S.route;
  $('#routeSummary').textContent = S.route
    ? T.routeSummary(S.route.distanceKm.toFixed(1), S.route.ascentM, routeWindLabel())
    : '';
  renderRouteWeatherDetails();
  $('#historyTitle').textContent = T.historyTitle;
  const effortName = e => e < 0 ? T.feedbackEasier : e > 0 ? T.feedbackHarder : T.feedbackExpected;
  $('#historyList').innerHTML = S.history.length ? S.history.slice(0, 8).map(item => {
    const d = new Date(item.savedAt);
    return `<div class="history-row"><span><b>${item.place || '—'}</b><small>${d.toLocaleDateString(T.lang)} · ${item.duration} min</small></span>
      <strong style="color:${bandColor(item.score)}">${item.score}</strong><em>${effortName(item.effort)}</em></div>`;
  }).join('') : `<p class="history-empty">${T.historyEmpty}</p>`;

  $('#langChooser').innerHTML = [['en', 'English'], ['ru', 'Русский']]
    .map(([c, n]) => `<button class="chip ${S.langCode === c ? 'is-on' : ''}" data-lang="${c}">${n}</button>`).join('');

  const releaseDate = new Date(RELEASE_DATE + 'T12:00:00Z').toLocaleDateString(T.lang, {
    day: 'numeric', month: 'short', year: 'numeric'
  });
  $('#appVersionMeta').textContent = `v${APP_VERSION} · ${T.updatedOn(releaseDate)}`;
  $('#appVersionBadge').textContent = T.updateCurrent;
  $('#whatsNewList').innerHTML = (RELEASE_NOTES[S.langCode] || RELEASE_NOTES.en)
    .map(note => `<li>${note}</li>`).join('');
}
$('#profileList').addEventListener('click', e => {
  const b = e.target.closest('[data-opt]'); if (b) openProfileSheet(b.dataset.opt);
});
$('#langChooser').addEventListener('click', e => {
  const b = e.target.closest('[data-lang]'); if (!b) return;
  S.langCode = b.dataset.lang; T = LANGS[S.langCode]; setLang(S.langCode); paint();
});

$('#gpxFile').addEventListener('change', async e => {
  const file = e.target.files?.[0]; if (!file) return;
  try {
    const route = parseGpx(await file.text());
    if (!route) return toast(T.routeInvalid);
    route.name = file.name.replace(/\.gpx$/i, '') || T.routeTitle;
    S.route = route; saveRoute(route);
    S.routeForecast = null; S.routeWeather = null; S.routeWeatherError = false;
    S.plan.mode = 'distance'; S.plan.distanceKm = route.distanceKm; saveRunPlan(S.plan);
    refreshRouteForecast();
    toast(T.routeLoaded); if (S.bundle) paint();
  } catch { toast(T.routeInvalid); }
  finally { e.target.value = ''; }
});
$('#routeClear').addEventListener('click', () => {
  ++routeRequestId; routeController?.abort();
  S.route = null; S.routeForecast = null; S.routeWeather = null;
  S.routeWeatherLoading = false; S.routeWeatherError = false;
  saveRoute(null); if (S.bundle) paint();
});

// ── ГОРОДА ─────────────────────────────────────────────────────────────────
function renderCities() {
  const cities = loadCities();
  const list = $('#cityList'); list.replaceChildren();
  cities.forEach((c, i) => {
    const row = document.createElement('div'); row.className = 'cityrow';
    const button = document.createElement('button'); button.dataset.city = i;
    const name = document.createElement('b'); name.textContent = c.name;
    const country = document.createElement('small'); country.textContent = c.country || '';
    button.append(name, country); row.append(button);
    if (cities.length > 1) {
      const remove = document.createElement('button'); remove.className = 'del';
      remove.dataset.delcity = i; remove.textContent = T.remove; row.append(remove);
    }
    list.append(row);
  });
}
$('#cityList').addEventListener('click', e => {
  const d = e.target.closest('[data-delcity]');
  if (d) { const c = loadCities(); c.splice(+d.dataset.delcity, 1); saveCities(c); renderCities(); return; }
  const c = e.target.closest('[data-city]');
  if (c) { S.place = loadCities()[+c.dataset.city]; load(); back(); }
});
let searchTimer, searchRequestId = 0, searchController;
$('#cityQ').addEventListener('input', e => {
  clearTimeout(searchTimer);
  const id = ++searchRequestId;
  searchController?.abort();
  const q = e.target.value.trim();
  $('#cityRes').replaceChildren(); $('#cityRes').onclick = null;
  if (q.length < 2) return;
  searchTimer = setTimeout(async () => {
    try {
      searchController = new AbortController();
      const res = await searchCity(q, S.langCode, searchController.signal);
      if (id !== searchRequestId || $('#cityQ').value.trim() !== q) return;
      const list = $('#cityRes'); list.replaceChildren();
      res.forEach((r, i) => {
        const li = document.createElement('li'); li.dataset.res = i;
        const name = document.createElement('span'); name.textContent = r.name;
        const country = document.createElement('small'); country.textContent = r.country;
        li.append(name, country); list.append(li);
      });
      if (!res.length) { const li = document.createElement('li'); li.textContent = T.nothingFound; list.append(li); }
      $('#cityRes').onclick = ev => {
        const li = ev.target.closest('[data-res]'); if (!li) return;
        const city = res[+li.dataset.res], cities = loadCities();
        if (!validPlace(city)) return;
        if (!cities.some(x => x.name === city.name && Math.abs(x.lat - city.lat) < .01)) cities.push(city);
        saveCities(cities); S.place = city;
        ++searchRequestId; searchController?.abort();
        $('#cityQ').value = ''; $('#cityRes').replaceChildren();
        load(); back();
      };
    } catch {
      if (id !== searchRequestId || $('#cityQ').value.trim() !== q) return;
      const li = document.createElement('li'); li.textContent = T.searchOffline;
      $('#cityRes').replaceChildren(li); $('#cityRes').onclick = null;
    }
  }, 320);
});

// ── ШТОРКИ ─────────────────────────────────────────────────────────────────
function openSheet(html) {
  sheetReturnFocus = document.activeElement;
  const old = $('#sheetoverBody'), fresh = document.createElement('div');
  fresh.id = 'sheetoverBody'; old.replaceWith(fresh); fresh.innerHTML = html;
  fresh.querySelector('h3').id = 'sheetTitle';
  $('#sheetover').hidden = false; document.body.style.overflow = 'hidden';
  $('#app').inert = true;
  fresh.querySelector('h3').tabIndex = -1;
  fresh.querySelector('h3').focus();
  return fresh;
}
let sheetReturnFocus;
function closeSheet() {
  $('#sheetover').hidden = true; document.body.style.overflow = '';
  $('#app').inert = false;
  if (sheetReturnFocus?.isConnected) sheetReturnFocus.focus();
}
document.addEventListener('keydown', e => {
  if ($('#sheetover').hidden) return;
  if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return; }
  if (e.key !== 'Tab') return;
  const items = $$('button, input, [tabindex="-1"]', $('#sheetover')).filter(x => !x.disabled);
  const first = items[0], last = items.at(-1);
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

function openHourSheet(h) {
  const M = FMETA();
  openSheet(`<h3>${pad(h.t.getHours())}:00 · ${T.weather[h.code] || ''}</h3>
    <p>${dowOf(h.t)}, ${dateOf(h.t)}</p>
    <div class="card" style="display:flex;align-items:center;gap:14px">
      ${ring(h.score, 96)}
      <div><div style="font-size:17px;font-weight:680">${bandText(h.score)}</div>
      <div style="font-size:13.5px;color:var(--muted);margin-top:3px">${mainConditions(h)}</div></div></div>
    <div class="card">${Object.entries(h.factors).sort((a, b) => b[1].w - a[1].w).map(([k, v]) => `
      <div class="drow" style="grid-template-columns:26px 1fr auto">
        <span class="drow__ic">${M[k][1]}</span>
        <span class="drow__k">${M[k][0]}<small style="display:block;font-size:12.5px;color:var(--muted);
          font-weight:500">${M[k][2](h)}</small></span>
        <span class="drow__v" style="color:${bandColor(v.v)}">${Math.round(v.v)}</span></div>`).join('')}</div>`);
}

function openDaySheet(iso) {
  const dt = new Date(iso + 'T12:00');
  const day = S.hours.filter(h => h.iso.slice(0, 10) === iso);
  const bw = bestWindowOfDay(S.hours, iso, runDuration());
  openSheet(`<h3>${dowOf(dt)}, ${dateOf(dt)}</h3>
    ${bw ? `<p>${T.bestWindow}: ${windowText(bw)} · ${bw.score}</p>` : ''}
    <div class="table">
      <div class="thead">${[T.colTime, T.colWeather, T.colTemp, T.colPrecip, T.colScore].map(x => `<span>${x}</span>`).join('')}</div>
      ${day.filter((_, i) => i % 2 === 0).map(h => `<div class="trow">
        <span class="trow__t">${pad(h.t.getHours())}:00</span>
        <span class="trow__i">${weatherIcon(h.code, h.isDay)}</span>
        <span class="trow__temp">${round(h.temp)}°</span>
        <span class="trow__p">${h.pop}%</span>
        <span class="trow__s"><span class="pill s-${band(h.score)}">${h.score}</span></span></div>`).join('')}
    </div>`);
}

function profileOpts(key) {
  return {
    duration: [T.chooseDuration, T.hintDuration,
      [[30, T.minutes(30)], [45, T.minutes(45)], [60, T.minutes(60)], [90, T.minutes(90)], [120, T.minutes(120)]]],
    heat: [T.chooseHeat, T.hintHeat, [['low', T.lowWord], ['normal', T.normal], ['high', T.highWord]]],
    cold: [T.chooseCold, T.hintCold, [['low', T.lowWord], ['normal', T.normal], ['high', T.highWord]]],
    rain: [T.chooseRain, T.hintRain, [['drier', T.preferDrier], ['ok', T.rainFine]]],
    air: [T.chooseAir, T.hintAir, [['normal', T.normal], ['high', T.highWord]]],
    pollen: [T.choosePollen, T.hintPollen, [['off', T.no], ['on', T.yes]]]
  }[key];
}

function openProfileSheet(key) {
  const [title, hint, options] = profileOpts(key);
  const body = openSheet(`<h3>${title}</h3><p>${hint}</p><div class="chooser">${options.map(([v, l]) =>
    `<button class="chip ${String(S.profile[key]) === String(v) ? 'is-on' : ''}" data-set="${v}">${l}</button>`).join('')}</div>`);
  body.addEventListener('click', e => {
    const b = e.target.closest('[data-set]'); if (!b) return;
    if (key === 'duration') selectDuration(S.profile, b.dataset.set, saveProfile);
    else { S.profile[key] = b.dataset.set; saveProfile(S.profile); }
    recompute(); closeSheet(); paint(); toast(T.saved);
  });
}

function openFeedbackSheet() {
  const run = currentRun();
  const body = openSheet(`<h3>${T.feedbackTitle}</h3>
    <div class="chooser">
      <button class="chip" data-effort="-1">${T.feedbackEasier}</button>
      <button class="chip" data-effort="0">${T.feedbackExpected}</button>
      <button class="chip" data-effort="1">${T.feedbackHarder}</button>
    </div>`);
  body.addEventListener('click', e => {
    const b = e.target.closest('[data-effort]'); if (!b) return;
    S.history = addRun({
      place: S.place.name,
      score: run.score ?? 0,
      duration: runDuration(),
      distanceKm: S.plan.mode === 'distance' ? S.plan.distanceKm : null,
      effort: Number(b.dataset.effort),
      startIso: run.window?.slice?.[0]?.iso || null
    });
    closeSheet(); paint(); toast(T.feedbackSaved);
  });
}

// ── УСТАНОВКА, SW, СТАРТ ───────────────────────────────────────────────────
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); installEvt = e; $('#btnInstall').hidden = false;
});
$('#dataRetry').addEventListener('click', () => { dataError(false); load(); });
$('#btnInstall').addEventListener('click', async () => {
  if (!installEvt) return;
  installEvt.prompt(); await installEvt.userChoice;
  installEvt = null; $('#btnInstall').hidden = true;
});
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('sw.js');
      if (S.watch?.enabled && S.backgroundWatch?.active) await syncBackgroundWatch();
    } catch {}
  });
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && S.bundle && Date.now() - S.bundle.at > 12 * 60e3) load();
});
setInterval(() => {
  if (!S.bundle || document.hidden) return;
  if (expireDisplayedBundle()) return;
  if (S.screen === 'home') renderHome();
}, 60e3);

const SCREENS = ['home', 'hourly', 'daily', 'analysis', 'why', 'factor', 'timeline', 'air', 'radar', 'details', 'cities'];
function fromHash() {
  const h = location.hash.replace('#', '');
  if (SCREENS.includes(h) && h !== S.screen) go(h);
}
window.addEventListener('hashchange', fromHash);
window.__go = go;
window.__stackDepth = () => S.stack.length;

staticText();
load().then(fromHash);
