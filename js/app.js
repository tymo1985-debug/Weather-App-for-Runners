import { weatherIcon, glyph, plant, moonFraction } from './icons.js';
import { LANGS, pickLang, setLang } from './i18n.js';
import {
  DEFAULT_PLACE, loadProfile, saveProfile, loadCities, saveCities,
  fetchAll, cachedBundle, searchCity, reverseGeocode,
  buildHours, bestWindow, bestWindowOfDay, band, bandColor, aqiBand, WEIGHTS
} from './engine.js';

// ── Состояние ──────────────────────────────────────────────────────────────
const S = {
  place: loadCities()[0] || DEFAULT_PLACE,
  profile: loadProfile(),
  langCode: pickLang(),
  bundle: null, hours: [],
  range: 'hours', dcol: 'score', btab: 'score',
  factor: 'temp',
  screen: 'home', stack: []
};
let T = LANGS[S.langCode];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
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
  details: renderDetails, cities: renderCities, radar: initRadar
};
const TAB_OF = { home: 'home', hourly: 'home', daily: 'home', analysis: 'home', why: 'home',
  factor: 'home', timeline: 'home', air: 'home', radar: 'radar', cities: 'cities', details: 'details' };

function go(name, push = true) {
  if (name === S.screen) return;
  if (push) S.stack.push(S.screen);
  S.screen = name;
  $$('.screen').forEach(s => s.classList.toggle('is-active', s.dataset.screen === name));
  $$('.tab').forEach(t => t.classList.toggle('is-on', t.dataset.go === TAB_OF[name]));
  window.scrollTo(0, 0);
  if (S.bundle) RENDER[name]?.();
}
function back() { go(S.stack.pop() || 'home', false); }

document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]'); if (g) return go(g.dataset.go);
  if (e.target.closest('[data-back]')) return back();
  if (e.target.closest('[data-close-sheet]')) return closeSheet();
  if (e.target.closest('[data-share]')) return share();
});

async function share() {
  const w = bestWindow(S.hours, S.profile.duration);
  const txt = `${S.place.name} — ${T.runningConditions.toLowerCase()}: ${nowScore()}/100. ` +
    `${T.bestTime}: ${w ? windowText(w) : '—'}.`;
  if (navigator.share) { try { await navigator.share({ text: txt }); return; } catch {} }
  try { await navigator.clipboard.writeText(txt); toast(T.copied); } catch { toast(txt); }
}

// ── Данные ─────────────────────────────────────────────────────────────────
async function load() {
  const cached = cachedBundle(S.place);
  if (cached) { S.bundle = cached; recompute(); paint(); }
  try { S.bundle = await fetchAll(S.place); recompute(); paint(); }
  catch { cached ? toast(T.offline) : ($('#heroCond').textContent = T.noData); }
}
function recompute() { S.hours = buildHours(S.bundle, S.profile); }
function paint() { staticText(); RENDER[S.screen]?.(); }

const nowIndex = () => {
  const t = Date.now();
  const i = S.hours.findIndex(h => h.t.getTime() > t - 1800e3);
  return i < 0 ? 0 : i;
};
const nowHour = () => S.hours[nowIndex()] || null;
const nowScore = () => nowHour()?.score ?? 0;
const windowText = w => `${hhmm(w.slice[0].t)} – ${hhmm(new Date(w.slice.at(-1).t.getTime() + 3600e3))}`;

// ── Статические подписи ────────────────────────────────────────────────────
function staticText() {
  document.documentElement.lang = S.langCode;
  $('#pinIcon').innerHTML = glyph.pin;
  $('#btnLocate').innerHTML = glyph.navigate.replace('#2C3E56', 'currentColor');
  $('#btnAddCity').innerHTML = glyph.plus;
  $('#scoreRunIc').innerHTML = glyph.runner;
  $('#icBest').innerHTML = glyph.alarm;
  $('#icDur').innerHTML = glyph.target;
  $('#icUv').innerHTML = glyph.uv;
  $('#scoreHeadLbl').textContent = T.runningConditions;
  $('#lblBestTime').textContent = T.bestTime;
  $('#lblDuration').textContent = T.duration;
  $('#lblUv').textContent = T.uvIndex;
  $('#lblViewDetails').textContent = T.viewDetails;
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
  $('#mapPin').innerHTML = glyph.pin;
  $('#mapLive').textContent = T.liveRadar;
  $('#btnLayers').innerHTML = glyph.layers;
  $('#btnMapLocate').innerHTML = glyph.navigate;
  $('#btnZoomIn').innerHTML = glyph.plus;
  $('#btnZoomOut').innerHTML = glyph.minus;
  $('#radarLegend').innerHTML = [T.legLight, T.legModerate, T.legHeavy, T.legExtreme]
    .map(x => `<span>${x}</span>`).join('');
  if (!timer) $('#radarPlay').innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
  if (!frames.length) $('#radarLabel').textContent = T.now;
  $('#detailsTitle').textContent = T.weatherDetails;
  $('#profileTitle').textContent = T.yourProfile;
  $('#langTitle').textContent = T.language;
  $('#btnInstall').textContent = T.install;
  $('#tagline').textContent = T.tagline;
  $('#fineprint').textContent = T.dataNote;
  $('#citiesTitle').textContent = T.cities;
  $('#cityQ').placeholder = T.searchCity;
  $$('.tab').forEach(b => {
    b.querySelector('.tab__ic').innerHTML = glyph[b.querySelector('.tab__ic').dataset.ic];
    b.querySelector('[data-t]').textContent = T[b.querySelector('[data-t]').dataset.t];
  });
}

// ── 1. ГЛАВНАЯ ─────────────────────────────────────────────────────────────
function renderHome() {
  const W = S.bundle.weather, cur = W.current, h = nowHour(), d = new Date();
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

  const sc = nowScore(), b = band(sc);
  $('#cardScore').className = 'scorecard' + (b === 'good' ? '' : ' is-' + b);
  $('#scoreBig').textContent = sc;
  $('#scoreLabel').textContent = bandText(sc);
  $('#scoreSub').textContent = subFor(sc);

  const w = bestWindow(S.hours, S.profile.duration);
  $('#factWindow').textContent = w ? windowText(w) : '—';
  $('#factDuration').textContent = T.min(S.profile.duration);
  $('#factUv').textContent = `${(h?.uv ?? 0).toFixed(0)} (${uvWord(h?.uv ?? 0)})`;
  $('#updatedAt').textContent = T.updatedAt(hhmm(new Date(S.bundle.at)));
  renderStrip();
}

function renderStrip() {
  const box = $('#strip'), n = nowIndex();
  if (S.range === 'days') {
    const D = S.bundle.weather.daily;
    box.innerHTML = D.time.map((t, i) => {
      const dt = new Date(t + 'T12:00');
      const bw = bestWindowOfDay(S.hours, t, S.profile.duration);
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
  if (S.range === 'days') { go('daily'); } else renderStrip();
}));
$('#cardScore').addEventListener('click', () => go('analysis'));
$('#strip').addEventListener('click', () => go(S.range === 'days' ? 'daily' : 'hourly'));
$('#btnPlace').addEventListener('click', () => go('cities'));
$('#btnAddCity').addEventListener('click', () => go('cities'));
$('#btnLocate').addEventListener('click', locate);

function locate() {
  if (!navigator.geolocation) return toast(T.myLocation + ' —');
  navigator.geolocation.getCurrentPosition(async pos => {
    const p = await reverseGeocode(+pos.coords.latitude.toFixed(3), +pos.coords.longitude.toFixed(3), S.langCode);
    S.place = p; const c = loadCities(); c[0] = p; saveCities(c); load();
  }, () => toast(T.searchOffline), { timeout: 8000, maximumAge: 6e5 });
}

// ── 2. ПОЧАСОВОЙ ───────────────────────────────────────────────────────────
function renderHourly() {
  const d = new Date();
  $('#hourlyCity').textContent = S.place.name;
  $('#hourlyDate').textContent = `${dowOf(d)}, ${dateOf(d)}`;
  const n = nowIndex(), list = S.hours.slice(n, n + 24);
  const w = bestWindow(S.hours, S.profile.duration);
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
}));

function renderDaily() {
  const D = S.bundle.weather.daily;
  const lastCol = S.dcol === 'score' ? T.colBestRun : S.dcol === 'precip' ? T.colPrecip : T.colMinMax;
  $('#dailyHead').innerHTML = [T.colDay, T.colWeather, T.colTemp, T.colPrecip, lastCol, '']
    .map(x => `<span>${x}</span>`).join('');

  let bestI = -1, bestV = -1;
  const sc = D.time.map((t, i) => {
    const bw = bestWindowOfDay(S.hours, t, S.profile.duration);
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
  const sc = nowScore(), h = nowHour();
  const w = bestWindow(S.hours, S.profile.duration);
  $('#ringWrap').innerHTML = ring(sc) +
    `<div class="ringcap" style="color:${bandColor(sc)}">${subFor(sc)}</div>`;

  const rows = [
    [T.bestTime, w ? windowText(w) : '—', ''],
    [T.duration, T.min(S.profile.duration), S.profile.duration === 60 ? `<em>(${T.defaultWord})</em>` : ''],
    [T.mainConditions, mainConditions(h), '']
  ];
  $('#analysisChecks').innerHTML = rows.map(([k, v, extra]) =>
    `<li>${glyph.checkCircle}<span><b>${k}</b><span class="v">${v}${extra}</span></span></li>`).join('');

  drawDayChart();

  const title = sc >= 80 ? T.thingsGreat : sc >= 65 ? T.thingsOk : T.thingsPoor;
  $('#analysisNote').innerHTML = `
    <div class="notecard__top">${weatherIcon(h?.code ?? 0, h?.isDay ?? 1).replace('viewBox="0 0 64 72"', 'viewBox="6 6 52 52"')}
      <div><b>${title}</b><p>${explain(h, sc)}</p></div></div>
    <button class="btnwide" data-go="why">${T.detailedAnalysis}
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

function explain(h, sc) {
  if (!h) return '';
  const N = F_NAME();
  const es = Object.entries(h.factors);
  const meaningful = es.filter(([k]) => k !== 'surface');
  const worst = es.slice().sort((a, b) => a[1].v - b[1].v)[0];
  const best = meaningful.sort((a, b) => b[1].w * b[1].v - a[1].w * a[1].v)[0];
  return S.langCode === 'ru'
    ? (sc >= 80
      ? `Больше всего помогает: ${N[best[0]].toLowerCase()}. Самое слабое место — ${N[worst[0]].toLowerCase()}, но на итог оно почти не влияет.`
      : `Сильнее всего оценку снижает ${N[worst[0]].toLowerCase()}. Лучше всего сейчас ${N[best[0]].toLowerCase()}.`)
    : (sc >= 80
      ? `${N[best[0]]} helps the most right now. The weakest link is ${N[worst[0]].toLowerCase()}, but it barely moves the total.`
      : `${N[worst[0]]} costs you the most points. ${N[best[0]]} is the strongest part right now.`);
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
  const w = bestWindow(S.hours, S.profile.duration);
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
    <svg class="chart" viewBox="0 0 ${W} ${H}">
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
}));

function renderWhy() {
  const sc = nowScore();
  $('#whyTitle').textContent = sc >= 80 ? T.whyGreat : T.whyOk;
  $('#whyRing').innerHTML = ring(sc, 120);
  $('#whyCap').textContent = sc >= 80 ? T.optimal : subFor(sc);
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

function renderBreakdown() {
  const h = nowHour(); if (!h) return;
  const M = FMETA(), box = $('#breakdown'), es = Object.entries(h.factors);

  if (S.btab === 'good') {
    const good = es.filter(([, v]) => v.v >= 78).sort((a, b) => b[1].v - a[1].v);
    box.innerHTML = good.length
      ? `<ul class="checks" style="padding:8px 4px">${good.map(([k, v]) =>
          `<li><svg viewBox="0 0 24 24"><path d="M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7Z"/></svg>
            <span><b style="color:var(--ink)">${M[k][0]}</b> — ${M[k][2](h)} <em style="color:var(--muted);font-style:normal">(${M[k][3](h)})</em></span></li>`).join('')}</ul>`
      : `<p style="padding:12px 4px;font-size:13.5px;color:var(--muted);margin:0">${T.nothingGood}</p>`;
    return;
  }

  box.innerHTML = es.sort((a, b) => b[1].w - a[1].w).map(([k, v]) => {
    const contrib = Math.round((v.v - 60) * v.w / 100);
    const q = M[k][3](h);
    return `<button class="frow" data-factor="${k}">
      <span class="frow__ic">${M[k][1]}</span>
      <span class="frow__k">${M[k][0]}<small>${M[k][2](h)}${q ? ` <em>(${q})</em>` : ''}</small></span>
      <span class="frow__n" style="color:${bandColor(v.v)}">${Math.round(v.v)}</span>
      <span class="frow__w ${contrib >= 0 ? 'up' : 'down'}">${contrib >= 0 ? '+' : '−'}${Math.abs(contrib)}</span>
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
  const h = nowHour(), key = S.factor, f = h.factors[key];
  if (!f) return back();
  const M = FMETA()[key];
  const [lo, hi, val, ticks, l1, l2, l3, l4] = SCALE(key, h);
  const x = Math.max(2.5, Math.min(97.5, ((val - lo) / (hi - lo)) * 100));
  const col = bandColor(f.v);
  const desc = S.langCode === 'ru'
    ? `${M[0]}: ${M[2](h)}${M[3](h) ? ` — ${M[3](h)}` : ''}.`
    : `${M[0]} is ${M[2](h)}${M[3](h) ? ` — ${M[3](h)}` : ''}.`;

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
  const w = bestWindow(S.hours, S.profile.duration);
  const win = new Set(w ? w.slice.map(x => x.iso) : []);
  const bi = pick.findIndex(h => win.has(h.iso));

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
    <svg class="chart" viewBox="0 0 ${W} ${H}">
      <defs><linearGradient id="tla" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2E9E4F" stop-opacity=".2"/>
        <stop offset="100%" stop-color="#2E9E4F" stop-opacity=".02"/></linearGradient></defs>
      ${grid}
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
        aria-checked="${S.profile.pollen === 'on'}"></button></div>`;

  $('#pollenSwitch').addEventListener('click', () => {
    S.profile.pollen = S.profile.pollen === 'on' ? 'off' : 'on';
    saveProfile(S.profile); recompute(); paint();
  });
}

// ── 9. РАДАР ───────────────────────────────────────────────────────────────
let map, frames = [], layer = null, fi = 0, timer = null, mapReady = false;

async function initRadar() {
  $('#mapCity').textContent = S.place.name;
  if (mapReady) { map.invalidateSize(); return; }
  try {
    await loadLeaflet();
    map = L.map('map', { zoomControl: false, attributionControl: true })
      .setView([S.place.lat, S.place.lon], 8);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      { attribution: '© OpenStreetMap, © CARTO', maxZoom: 14 }).addTo(map);
    L.circleMarker([S.place.lat, S.place.lon],
      { radius: 8, color: '#fff', weight: 3, fillColor: '#2F6FEB', fillOpacity: 1 }).addTo(map);

    const j = await fetch('https://api.rainviewer.com/public/weather-maps.json').then(r => r.json());
    const host = j.host || 'https://tilecache.rainviewer.com';
    frames = [...(j.radar?.past || []), ...(j.radar?.nowcast || [])]
      .map(f => ({ ...f, url: `${host}${f.path}/256/{z}/{x}/{y}/4/1_1.png` }));
    fi = Math.max(0, (j.radar?.past?.length || 1) - 1);
    const sl = $('#radarTime'); sl.max = frames.length - 1; sl.value = fi;
    sl.addEventListener('input', () => { stopPlay(); showFrame(+sl.value); });
    $('#radarPlay').addEventListener('click', () => timer ? stopPlay() : startPlay());
    $('#btnZoomIn').addEventListener('click', () => map.zoomIn());
    $('#btnZoomOut').addEventListener('click', () => map.zoomOut());
    $('#btnMapLocate').addEventListener('click', () => map.setView([S.place.lat, S.place.lon], 9));
    $('#btnLayers').addEventListener('click', () => toast(T.layers));
    stopPlay(); showFrame(fi); mapReady = true;
  } catch {
    $('#map').innerHTML = `<div style="display:grid;place-items:center;height:100%;padding:28px;
      text-align:center;color:#C7D3E0;font-size:14px">${T.radarOffline}</div>`;
  }
}
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  return new Promise((res, rej) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
}
function showFrame(i) {
  if (!frames[i]) return;
  fi = i;
  const next = L.tileLayer(frames[i].url, { opacity: .8, zIndex: 400 }).addTo(map);
  const prev = layer; layer = next;
  setTimeout(() => prev && map.removeLayer(prev), 200);
  const d = new Date(frames[i].time * 1000);
  $('#radarLabel').textContent = frames[i].time * 1000 <= Date.now() ? T.now : hhmm(d);
  $('#radarTime').value = i;
  $('#radarTicks').innerHTML = frames.map((f, k) => k % Math.ceil(frames.length / 4) === 0
    ? `<span class="${k === i ? 'on' : ''}">${k === 0 ? T.now : hhmm(new Date(f.time * 1000))}</span>` : '').join('');
}
function startPlay() {
  $('#radarPlay').innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg>';
  timer = setInterval(() => showFrame((fi + 1) % frames.length), 600);
}
function stopPlay() {
  clearInterval(timer); timer = null;
  $('#radarPlay').innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
}

// ── 10. ДЕТАЛИ И ПРОФИЛЬ ───────────────────────────────────────────────────
function renderDetails() {
  const h = nowHour(), D = S.bundle.weather.daily;
  const sr = new Date(D.sunrise[0]), ss = new Date(D.sunset[0]), dl = D.daylight_duration?.[0];
  const f = moonFraction(new Date());
  const mi = Math.round(f * 8) % 8;

  $('#detailsList').innerHTML = [
    [glyph.uv, T.uvIndex, `${h.uv.toFixed(0)} (${uvWord(h.uv)})`],
    [glyph.eye, T.visibility, h.vis == null ? '—' : `${(h.vis / 1000).toFixed(0)} km`],
    [glyph.sunrise, T.sunrise, hhmm(sr)],
    [glyph.sunset, T.sunset, hhmm(ss)],
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
    ['pollen', T.pollenSensitivity, glyph.leaf], ['duration', T.planToRun, glyph.clock]
  ].map(([k, label, ic]) => `<button class="drow" data-opt="${k}">
      <span class="drow__ic">${ic}</span><span class="drow__k">${label}</span>
      <span class="drow__v" style="font-weight:560;color:var(--ink-2)">${V[k]}</span>
      <svg viewBox="0 0 24 24" class="i14 chevr"><path d="M9 5l7 7-7 7z"/></svg></button>`).join('');

  $('#langChooser').innerHTML = [['en', 'English'], ['ru', 'Русский']]
    .map(([c, n]) => `<button class="chip ${S.langCode === c ? 'is-on' : ''}" data-lang="${c}">${n}</button>`).join('');
}
$('#profileList').addEventListener('click', e => {
  const b = e.target.closest('[data-opt]'); if (b) openProfileSheet(b.dataset.opt);
});
$('#langChooser').addEventListener('click', e => {
  const b = e.target.closest('[data-lang]'); if (!b) return;
  S.langCode = b.dataset.lang; T = LANGS[S.langCode]; setLang(S.langCode); paint();
});

// ── ГОРОДА ─────────────────────────────────────────────────────────────────
function renderCities() {
  const cities = loadCities();
  $('#cityList').innerHTML = cities.map((c, i) => `
    <div class="cityrow">
      <button data-city="${i}"><b>${c.name}</b><small>${c.country || ''}</small></button>
      ${cities.length > 1 ? `<button class="del" data-delcity="${i}">${T.remove}</button>` : ''}
    </div>`).join('');
}
$('#cityList').addEventListener('click', e => {
  const d = e.target.closest('[data-delcity]');
  if (d) { const c = loadCities(); c.splice(+d.dataset.delcity, 1); saveCities(c); renderCities(); return; }
  const c = e.target.closest('[data-city]');
  if (c) { S.place = loadCities()[+c.dataset.city]; go('home'); load(); }
});
let searchTimer;
$('#cityQ').addEventListener('input', e => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (q.length < 2) return ($('#cityRes').innerHTML = '');
  searchTimer = setTimeout(async () => {
    try {
      const res = await searchCity(q);
      $('#cityRes').innerHTML = res.map((r, i) =>
        `<li data-res="${i}"><span>${r.name}</span><small>${r.country}</small></li>`).join('')
        || `<li>${T.nothingFound}</li>`;
      $('#cityRes').onclick = ev => {
        const li = ev.target.closest('[data-res]'); if (!li) return;
        const city = res[+li.dataset.res], cities = loadCities();
        if (!cities.some(x => x.name === city.name && Math.abs(x.lat - city.lat) < .01)) cities.push(city);
        saveCities(cities); S.place = city;
        $('#cityQ').value = ''; $('#cityRes').innerHTML = '';
        go('home'); load();
      };
    } catch { $('#cityRes').innerHTML = `<li>${T.searchOffline}</li>`; }
  }, 320);
});

// ── ШТОРКИ ─────────────────────────────────────────────────────────────────
function openSheet(html) {
  const old = $('#sheetoverBody'), fresh = document.createElement('div');
  fresh.id = 'sheetoverBody'; old.replaceWith(fresh); fresh.innerHTML = html;
  $('#sheetover').hidden = false; document.body.style.overflow = 'hidden';
  return fresh;
}
function closeSheet() { $('#sheetover').hidden = true; document.body.style.overflow = ''; }

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
  const bw = bestWindowOfDay(S.hours, iso, S.profile.duration);
  openSheet(`<h3>${dowOf(dt)}, ${dateOf(dt)}</h3>
    ${bw ? `<p>${T.bestWindow}: ${hhmm(bw.slice[0].t)} – ${hhmm(new Date(bw.slice.at(-1).t.getTime() + 3600e3))} · ${bw.score}</p>` : ''}
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
    S.profile[key] = key === 'duration' ? Number(b.dataset.set) : b.dataset.set;
    saveProfile(S.profile); recompute(); closeSheet(); paint(); toast(T.saved);
  });
}

// ── УСТАНОВКА, SW, СТАРТ ───────────────────────────────────────────────────
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); installEvt = e; $('#btnInstall').hidden = false;
});
$('#btnInstall').addEventListener('click', async () => {
  if (!installEvt) return;
  installEvt.prompt(); await installEvt.userChoice;
  installEvt = null; $('#btnInstall').hidden = true;
});
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && S.bundle && Date.now() - S.bundle.at > 12 * 60e3) load();
});
setInterval(() => { if (S.bundle && !document.hidden && S.screen === 'home') renderHome(); }, 60e3);

const SCREENS = ['home', 'hourly', 'daily', 'analysis', 'why', 'factor', 'timeline', 'air', 'radar', 'details', 'cities'];
function fromHash() {
  const h = location.hash.replace('#', '');
  if (SCREENS.includes(h) && h !== S.screen) go(h);
}
window.addEventListener('hashchange', fromHash);
window.__go = go;

staticText();
load().then(fromHash);
