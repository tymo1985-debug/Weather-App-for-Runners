import { weatherIcon, WEATHER_TEXT, glyph } from './icons.js';
import {
  DEFAULT_PLACE, loadProfile, saveProfile, loadCities, saveCities,
  fetchAll, cachedBundle, searchCity, reverseGeocode,
  buildHours, bestWindow, bestWindowOfDay, band, bandText, bandColor,
  aqiBand, POLLEN_LEVEL, WEIGHTS
} from './engine.js';

// ── Состояние ──────────────────────────────────────────────────────────────
const S = {
  place: loadCities()[0] || DEFAULT_PLACE,
  profile: loadProfile(),
  bundle: null,
  hours: [],
  range: 'hours',
  dcol: 'score',
  screen: 'home',
  stack: []
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const round = v => (v == null || Number.isNaN(v) ? '—' : Math.round(v));
const DOW = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const dayLabel = d => `${DOW[d.getDay()]}`;
const dateLabel = d => `${d.getDate()} ${MON[d.getMonth()]}`;
const todayISO = () => new Date().toISOString().slice(0, 10);

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(t._x); t._x = setTimeout(() => (t.hidden = true), 2600);
}

// ── Навигация ──────────────────────────────────────────────────────────────
function go(name, push = true) {
  if (name === 'cities') return openCitySheet();
  if (name === S.screen) return;
  if (push && S.screen) S.stack.push(S.screen);
  S.screen = name;
  $$('.screen').forEach(s => s.classList.toggle('is-active', s.dataset.screen === name));
  $$('.tab').forEach(t => t.classList.toggle('is-on',
    t.dataset.go === name || (name === 'hourly' || name === 'daily' || name === 'analysis' ? t.dataset.go === 'home' : false)));
  window.scrollTo(0, 0);
  if (name === 'radar') initRadar();
  if (name === 'air') renderAir();
  if (name === 'details') renderDetails();
  if (name === 'analysis') renderAnalysis();
  if (name === 'hourly') renderHourly();
  if (name === 'daily') renderDaily();
}
function back() { go(S.stack.pop() || 'home', false); }

document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-go]'); if (g) return go(g.dataset.go);
  if (e.target.closest('[data-back]')) return back();
  if (e.target.closest('[data-close-sheet]')) return closeSheet();
  if (e.target.closest('[data-share]')) return share();
});

async function share() {
  const w = bestWindow(S.hours, S.profile.duration);
  const txt = `${S.place.name}: условия для бега ${nowScore()}/100. Лучшее окно ${w ? windowText(w) : '—'}.`;
  if (navigator.share) { try { await navigator.share({ text: txt, title: 'Погода для бега' }); } catch {} }
  else { try { await navigator.clipboard.writeText(txt); toast('Скопировано'); } catch { toast(txt); } }
}

// ── Загрузка данных ────────────────────────────────────────────────────────
async function load(showSkeleton = true) {
  if (showSkeleton) $('#heroCond').textContent = 'Обновляем…';
  const cached = cachedBundle(S.place);
  if (cached) { S.bundle = cached; recompute(); renderAll(); }
  try {
    S.bundle = await fetchAll(S.place);
    recompute(); renderAll();
  } catch (err) {
    if (!cached) {
      $('#heroCond').textContent = 'Нет данных';
      $('#heroFeels').textContent = 'Проверьте соединение и потяните, чтобы обновить.';
    } else toast('Показан сохранённый прогноз');
  }
}
function recompute() { S.hours = buildHours(S.bundle, S.profile); }

const nowIndex = () => {
  const t = Date.now();
  let i = S.hours.findIndex(h => h.t.getTime() > t - 1800e3);
  return i < 0 ? 0 : i;
};
const nowHour = () => S.hours[nowIndex()] || null;
const nowScore = () => nowHour()?.score ?? 0;

function windowText(w) {
  const a = w.slice[0].t, b = new Date(w.slice.at(-1).t.getTime() + 3600e3);
  return `${hhmm(a)} – ${hhmm(b)}`;
}

// ── Главная ────────────────────────────────────────────────────────────────
function renderAll() {
  renderHome();
  if (S.screen === 'hourly') renderHourly();
  if (S.screen === 'daily') renderDaily();
  if (S.screen === 'analysis') renderAnalysis();
  if (S.screen === 'air') renderAir();
  if (S.screen === 'details') renderDetails();
}

function renderHome() {
  const W = S.bundle.weather, cur = W.current, h = nowHour();
  const d = new Date();
  $('#placeName').textContent = S.place.name;
  $('#heroDate').textContent = `${DOW[d.getDay()]}, ${dateLabel(d)} · ${hhmm(d)}`;
  $('#heroIcon').innerHTML = weatherIcon(cur.weather_code, cur.is_day);
  $('#heroTemp').textContent = round(cur.temperature_2m);
  $('#heroCond').textContent = WEATHER_TEXT[cur.weather_code] || '—';
  $('#heroFeels').textContent = `Ощущается как ${round(cur.apparent_temperature)}°`;
  $('#heroMinMax').innerHTML =
    `<span>↑ ${round(W.daily.temperature_2m_max[0])}°</span><span>↓ ${round(W.daily.temperature_2m_min[0])}°</span>`;

  const sc = nowScore();
  const card = $('#cardScore');
  card.className = 'card card--score ' + (band(sc) === 'good' ? '' : 'is-' + band(sc));
  $('#scoreBig').textContent = sc;
  $('#scoreLabel').textContent = bandText(sc);
  $('#scoreSub').textContent = subtitleFor(sc);

  const w = bestWindow(S.hours, S.profile.duration);
  $('#factWindow').textContent = w ? windowText(w) : '—';
  $('#factDuration').textContent = `${S.profile.duration} мин`;
  const uv = h?.uv ?? 0;
  $('#factUv').textContent = `${uv.toFixed(0)} (${uvWord(uv)})`;

  const aqi = h?.aqi;
  $('#quickAqi').innerHTML = aqi == null ? '—'
    : `<i class="dot" style="background:${aqiBand(aqi)[2]}"></i>${Math.round(aqi)}`;
  $('#updatedAt').textContent = `Обновлено в ${hhmm(new Date(S.bundle.at))} · Open-Meteo`;

  renderStrip();
  renderHomeTip(w);
}

const uvWord = v => v < 3 ? 'низкий' : v < 6 ? 'умеренный' : v < 8 ? 'высокий' : 'очень высокий';
function subtitleFor(s) {
  return s >= 88 ? 'Отличное время для пробежки' :
    s >= 80 ? 'Хорошие условия — можно бежать' :
    s >= 65 ? 'Бежать можно, но не идеально' :
    s >= 45 ? 'Лучше подождать окно получше' : 'Сегодня стоит бежать в помещении';
}

function renderHomeTip(w) {
  const el = $('#homeTip');
  if (!w) { el.hidden = true; return; }
  const cur = nowScore();
  const better = w.score - cur;
  let title, text;
  if (better <= 3) {
    title = 'Сейчас хороший момент';
    text = `Ближайшие часы не будут заметно лучше. Оценка ${cur} из 100.`;
  } else {
    title = `Лучше в ${windowText(w)}`;
    text = `Оценка поднимется до ${w.score} — на ${better} выше, чем сейчас. ${reasonWindow(w)}`;
  }
  el.hidden = false;
  el.innerHTML = `<div class="tipicon">${glyph.uv}</div><div><b>${title}</b><p>${text}</p></div>`;
}

function reasonWindow(w) {
  const a = w.slice[0], n = nowHour();
  const bits = [];
  if (n && a.feels - n.feels <= -1.5) bits.push('станет прохладнее');
  if (n && a.feels - n.feels >= 1.5) bits.push('потеплеет');
  if (n && a.pop < n.pop - 10) bits.push('меньше шанс дождя');
  if (n && a.wind < n.wind - 3) bits.push('стихнет ветер');
  if (n && a.uv < n.uv - 1.5) bits.push('ниже УФ');
  return bits.length ? bits.join(', ').replace(/^./, c => c.toUpperCase()) + '.' : '';
}

function renderStrip() {
  const box = $('#strip');
  const n = nowIndex();
  if (S.range === 'days') {
    const D = S.bundle.weather.daily;
    box.innerHTML = D.time.map((t, i) => {
      const dt = new Date(t + 'T12:00');
      const bw = bestWindowOfDay(S.hours, t, S.profile.duration);
      const sc = bw ? bw.score : null;
      return `<div class="stripitem">
        <div class="stripitem__t">${dayLabel(dt)}</div>
        <div class="stripitem__i">${weatherIcon(D.weather_code[i], 1)}</div>
        <div class="stripitem__d">${round(D.temperature_2m_max[i])}°</div>
        ${sc != null ? `<span class="pill s-${band(sc)}">${sc}</span>` : ''}
      </div>`;
    }).join('');
  } else {
    const count = S.range === 'today' ? 24 : 12;
    box.innerHTML = S.hours.slice(n, n + count).map((h, i) => `
      <div class="stripitem${i === 0 ? ' is-now' : ''}">
        <div class="stripitem__t">${i === 0 ? 'Сейчас' : pad(h.t.getHours())}</div>
        <div class="stripitem__i">${weatherIcon(h.code, h.isDay)}</div>
        <div class="stripitem__d">${round(h.temp)}°</div>
        <span class="pill s-${band(h.score)}">${h.score}</span>
      </div>`).join('');
  }
}
$$('.seg[data-range]').forEach(b => b.addEventListener('click', () => {
  $$('.seg[data-range]').forEach(x => x.classList.remove('is-on'));
  b.classList.add('is-on'); S.range = b.dataset.range;
  if (S.range === 'days') go('daily'); else renderStrip();
}));

$('#cardScore').addEventListener('click', () => go('analysis'));
$('#strip').addEventListener('click', () => go(S.range === 'days' ? 'daily' : 'hourly'));

// ── Почасовой ──────────────────────────────────────────────────────────────
function renderHourly() {
  $('#hourlyCity').textContent = S.place.name;
  const d = new Date();
  $('#hourlyDate').textContent = `${DOW[d.getDay()]}, ${dateLabel(d)}`;
  const n = nowIndex();
  const list = S.hours.slice(n, n + 24);
  const w = bestWindow(S.hours, S.profile.duration);
  const winSet = new Set(w ? w.slice.map(h => h.iso) : []);

  $('#hourlyRows').innerHTML = list.map((h, i) => `
    <button class="trow${winSet.has(h.iso) ? ' is-best' : i === 0 ? ' is-now' : ''}" data-hour="${h.iso}">
      <span class="trow__t">${pad(h.t.getHours())}:00${i === 0 ? '<small>сейчас</small>' : ''}</span>
      <span class="trow__i">${weatherIcon(h.code, h.isDay)}</span>
      <span class="trow__temp">${round(h.temp)}°</span>
      <span class="trow__p">${h.pop}%</span>
      <span class="trow__s"><span class="pill s-${band(h.score)}">${h.score}</span></span>
    </button>`).join('');

  const c = $('#windowCard');
  if (!w) { c.innerHTML = ''; return; }
  const s = w.slice[0];
  const good = [];
  const check = (ok, txt) => good.push({ ok, txt });
  check(s.feels >= 5 && s.feels <= 20, `Температура ${round(s.feels)}° по ощущению`);
  check(s.pop <= 25, `Вероятность дождя ${s.pop}%`);
  check(s.wind <= 15, `Ветер ${round(s.wind)} км/ч`);
  check(s.uv <= 4, `УФ-индекс ${s.uv.toFixed(0)} — ${uvWord(s.uv)}`);
  if (s.aqi != null) check(s.aqi <= 40, `Воздух: индекс ${Math.round(s.aqi)}`);

  c.innerHTML = `
    <h4>Лучшее окно <span class="pill pill--soft s-${band(w.score)}">${w.score}</span></h4>
    <div class="when">${windowText(w)} · ${S.profile.duration} мин</div>
    <ul class="checks">${good.map(g =>
      `<li class="${g.ok ? '' : 'warn'}">${g.ok ? glyph.check : glyph.warn}<span>${g.txt}</span></li>`).join('')}</ul>`;
}
$('#hourlyRows').addEventListener('click', e => {
  const b = e.target.closest('[data-hour]'); if (!b) return;
  const h = S.hours.find(x => x.iso === b.dataset.hour);
  if (h) openHourSheet(h);
});

// ── 10 дней ────────────────────────────────────────────────────────────────
$$('.seg[data-dcol]').forEach(b => b.addEventListener('click', () => {
  $$('.seg[data-dcol]').forEach(x => x.classList.remove('is-on'));
  b.classList.add('is-on'); S.dcol = b.dataset.dcol; renderDaily();
}));

function renderDaily() {
  const D = S.bundle.weather.daily;
  $('#dailyColLabel').textContent =
    S.dcol === 'score' ? 'Оценка' : S.dcol === 'precip' ? 'Осадки' : 'Минимум';
  let bestI = -1, bestV = -1;
  const scores = D.time.map((t, i) => {
    const bw = bestWindowOfDay(S.hours, t, S.profile.duration);
    const v = bw ? bw.score : null;
    if (v != null && v > bestV) { bestV = v; bestI = i; }
    return { v, bw };
  });

  $('#dailyRows').innerHTML = D.time.map((t, i) => {
    const dt = new Date(t + 'T12:00');
    const sc = scores[i].v;
    let last;
    if (S.dcol === 'score') {
      last = sc == null ? '—' :
        `<span class="pill ${i === bestI ? '' : 'pill--soft '}s-${band(sc)}">${sc}</span>` +
        (i === bestI ? '<span class="badge-best">лучший</span>' : '');
    } else if (S.dcol === 'precip') {
      last = `<span class="trow__p">${D.precipitation_probability_max[i] ?? 0}%</span>`;
    } else {
      last = `<span class="trow__p">${round(D.temperature_2m_min[i])}°</span>`;
    }
    return `<button class="trow trow--daily" data-day="${t}">
      <span class="trow__t">${dayLabel(dt)}<small>${dateLabel(dt)}</small></span>
      <span class="trow__i">${weatherIcon(D.weather_code[i], 1)}</span>
      <span class="trow__temp"><span class="lo">${round(D.temperature_2m_min[i])}°</span>${round(D.temperature_2m_max[i])}°</span>
      <span class="trow__p">${D.precipitation_probability_max[i] ?? 0}%</span>
      <span class="trow__s">${last}</span>
    </button>`;
  }).join('');
}
$('#dailyRows').addEventListener('click', e => {
  const b = e.target.closest('[data-day]'); if (!b) return;
  openDaySheet(b.dataset.day);
});

// ── Разбор ─────────────────────────────────────────────────────────────────
function ring(score) {
  const R = 52, C = 2 * Math.PI * R, off = C * (1 - score / 100);
  return `<svg class="ring" viewBox="0 0 120 120">
    <circle cx="60" cy="60" r="${R}" fill="none" stroke="#EDF1F6" stroke-width="11"/>
    <circle cx="60" cy="60" r="${R}" fill="none" stroke="${bandColor(score)}" stroke-width="11"
      stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${off}"
      transform="rotate(-90 60 60)"/>
    <text x="60" y="58" text-anchor="middle" class="ring__v" fill="#132038">${score}</text>
    <text x="60" y="76" text-anchor="middle" class="ring__l" fill="${bandColor(score)}">${bandText(score)}</text>
  </svg>`;
}

function renderAnalysis() {
  const sc = nowScore(), h = nowHour();
  const w = bestWindow(S.hours, S.profile.duration);
  $('#ringWrap').innerHTML = ring(sc) +
    `<div class="ringcap" style="color:${bandColor(sc)}">${subtitleFor(sc)}</div>`;

  $('#analysisChecks').innerHTML = [
    ['Лучшее время', w ? windowText(w) : '—', true],
    ['Длительность', `${S.profile.duration} мин`, true],
    ['Главное сейчас', mainConditions(h), sc >= 65]
  ].map(([k, v, ok]) => `<li class="${ok ? '' : 'warn'}">${ok ? glyph.check : glyph.warn}
      <span><b>${k}</b><br>${v}</span></li>`).join('');

  drawDayChart();

  const note = $('#analysisNote');
  note.innerHTML = `<div class="tipicon" style="width:26px;height:26px">${glyph.air}</div>
    <div><b>${sc >= 80 ? 'Сейчас всё складывается хорошо' : sc >= 65 ? 'Условия рабочие' : 'Есть что учесть'}</b>
    <p>${explain(h, sc)}</p></div>`;

  renderBreakdown('score');
  renderTimeline();
}

function mainConditions(h) {
  if (!h) return '—';
  const t = h.feels <= 5 ? 'Холодно' : h.feels <= 14 ? 'Прохладно' : h.feels <= 21 ? 'Тепло' : 'Жарко';
  const r = h.pop >= 50 ? 'дождь' : h.pop >= 20 ? 'возможен дождь' : 'сухо';
  const wnd = h.wind <= 9 ? 'слабый ветер' : h.wind <= 20 ? 'умеренный ветер' : 'сильный ветер';
  return `${t} · ${r} · ${wnd}`;
}

function explain(h, sc) {
  if (!h) return '';
  const f = h.factors;
  const worst = Object.entries(f).sort((a, b) => a[1].v - b[1].v)[0];
  const bestF = Object.entries(f).sort((a, b) => b[1].v - a[1].v)[0];
  const NAME = {
    temp: 'температура', rain: 'осадки', wind: 'ветер', humid: 'влажность',
    air: 'качество воздуха', uv: 'ультрафиолет', surface: 'состояние покрытия', pollen: 'пыльца'
  };
  if (sc >= 80) return `Больше всего помогает ${NAME[bestF[0]]}. Слабое место — ${NAME[worst[0]]}, но на общую картину оно почти не влияет.`;
  return `Сильнее всего оценку снижает ${NAME[worst[0]]}. Остальное в порядке: лучше всего сейчас ${NAME[bestF[0]]}.`;
}

function drawDayChart() {
  const n = nowIndex();
  const list = S.hours.slice(n, n + 18);
  if (!list.length) return;
  const W = 340, H = 96, P = 14;
  const step = (W - P * 2) / (list.length - 1);
  const y = s => H - P - (s / 100) * (H - P * 2);
  const pts = list.map((h, i) => [P + i * step, y(h.score)]);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${path} L${pts.at(-1)[0].toFixed(1)} ${H - P} L${P} ${H - P} Z`;
  const w = bestWindow(S.hours, S.profile.duration);
  const winSet = new Set(w ? w.slice.map(x => x.iso) : []);

  $('#dayChart').innerHTML = `
    <svg class="chart" viewBox="0 0 ${W} ${H + 30}">
      <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1F9D4D" stop-opacity=".22"/>
        <stop offset="100%" stop-color="#1F9D4D" stop-opacity="0"/></linearGradient></defs>
      <path d="${area}" fill="url(#g1)"/>
      <path d="${path}" fill="none" stroke="#9CB4C9" stroke-width="2" stroke-linejoin="round"/>
      ${pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${winSet.has(list[i].iso) ? 4.6 : 3.2}"
          fill="${bandColor(list[i].score)}"/>`).join('')}
      ${pts.map((p, i) => i % 3 === 0
        ? `<text x="${p[0].toFixed(1)}" y="${H + 16}" text-anchor="middle" font-size="10" fill="#7A8AA3">${pad(list[i].t.getHours())}</text>`
        : '').join('')}
      ${pts.map((p, i) => i % 3 === 0
        ? `<text x="${p[0].toFixed(1)}" y="${(p[1] - 8).toFixed(1)}" text-anchor="middle" font-size="10.5"
             font-weight="700" fill="${bandColor(list[i].score)}">${list[i].score}</text>` : '').join('')}
    </svg>`;
}

const FACTOR_META = {
  temp: ['Температура', glyph.temp, h => `${round(h.feels)}° по ощущению`],
  humid: ['Влажность', glyph.humid, h => `${round(h.rh)}%`],
  wind: ['Ветер', glyph.wind, h => `${round(h.wind)} км/ч`],
  rain: ['Осадки', glyph.rain, h => `${h.pop}% · ${h.mm.toFixed(1)} мм`],
  uv: ['Солнце и УФ', glyph.uv, h => `УФ ${h.uv.toFixed(0)} (${uvWord(h.uv)})`],
  air: ['Качество воздуха', glyph.air, h => h.aqi == null ? 'нет данных' : `индекс ${Math.round(h.aqi)}`],
  surface: ['Покрытие', glyph.surface, h => h.recentMm > 0.5 ? 'вероятно мокро' : 'сухо (оценка)'],
  pollen: ['Пыльца', glyph.leaf, h => POLLEN_LEVEL(h.pollen)[0]]
};

function renderBreakdown(tab) {
  const h = nowHour(); if (!h) return;
  const box = $('#breakdown');
  const entries = Object.entries(h.factors);
  if (tab === 'good') {
    const good = entries.filter(([, v]) => v.v >= 75).sort((a, b) => b[1].v - a[1].v);
    box.innerHTML = good.length ? `<ul class="checks" style="padding-top:6px">${good.map(([k, v]) =>
      `<li>${glyph.check}<span><b>${FACTOR_META[k][0]}</b> — ${FACTOR_META[k][2](h)}</span></li>`).join('')}</ul>`
      : `<p class="card__sub" style="margin:8px 0 0">Сейчас нет факторов, которые заметно помогали бы. Посмотрите таймлайн — окно найдётся.</p>`;
    return;
  }
  box.innerHTML = `<div class="legend">Балл фактора · потеря очков</div>` +
    entries.sort((a, b) => b[1].w - a[1].w).map(([k, v]) => {
      const lost = Math.round((100 - v.v) * v.w / 100);
      const M = FACTOR_META[k];
      return `<button class="frow" data-factor="${k}">
        <span class="frow__ic">${M[1]}</span>
        <span class="frow__k">${M[0]}<small>${M[2](h)}</small></span>
        <span class="frow__n" style="color:${bandColor(v.v)}">${Math.round(v.v)}</span>
        <span class="frow__w ${lost ? 'down' : 'up'}">${lost ? '−' + lost : '0'}</span>
        <svg viewBox="0 0 24 24" class="i14 chevr"><path d="M9 5l7 7-7 7z"/></svg>
      </button>`;
    }).join('');
}
$$('.tab2').forEach(b => b.addEventListener('click', () => {
  $$('.tab2').forEach(x => x.classList.remove('is-on')); b.classList.add('is-on');
  renderBreakdown(b.dataset.btab);
}));
$('#breakdown').addEventListener('click', e => {
  const b = e.target.closest('[data-factor]'); if (b) openFactorSheet(b.dataset.factor);
});

function renderTimeline() {
  const n = nowIndex();
  const list = S.hours.slice(n, n + 24);
  if (!list.length) return;

  // Сначала пробуем разбить по смене качества условий.
  let segs = [];
  for (const h of list) {
    const b = band(h.score), last = segs.at(-1);
    if (last && last.b === b) last.items.push(h); else segs.push({ b, items: [h] });
  }
  segs = segs.filter(s => s.items.length >= 2);

  // Если весь день ровный — показываем части суток.
  if (segs.length < 2) {
    const partOf = (hr) => hr < 5 ? 'Ночь' : hr < 11 ? 'Утро' : hr < 17 ? 'День' : hr < 22 ? 'Вечер' : 'Ночь';
    segs = [];
    for (const h of list) {
      const name = partOf(h.t.getHours()), last = segs.at(-1);
      if (last && last.name === name) last.items.push(h); else segs.push({ name, items: [h] });
    }
  }

  $('#timeline').innerHTML = segs.slice(0, 5).map(s => {
    const items = s.items;
    const a = items[0].t, z = new Date(items.at(-1).t.getTime() + 3600e3);
    const avg = Math.round(items.reduce((x, h) => x + h.score, 0) / items.length);
    const tmin = Math.min(...items.map(h => h.temp)), tmax = Math.max(...items.map(h => h.temp));
    const maxPop = Math.max(...items.map(h => h.pop));
    const maxW = Math.max(...items.map(h => h.wind));
    const maxUv = Math.max(...items.map(h => h.uv));
    const desc = [
      tmax - tmin < 2 ? `около ${round(tmax)}°` : `${round(tmin)}–${round(tmax)}°`,
      maxPop >= 40 ? `дождь вероятен (${maxPop}%)` : maxPop >= 20 ? `небольшой шанс дождя (${maxPop}%)` : 'сухо',
      maxW >= 20 ? `ветер до ${round(maxW)} км/ч` : null,
      maxUv >= 6 ? `высокий УФ (${maxUv.toFixed(0)})` : null
    ].filter(Boolean).join(', ');
    return `<div class="tlrow">
      <span class="frow__ic">${band(avg) === 'good' ? glyph.check : glyph.clock}</span>
      <div><div class="tlrow__h">${s.name ? s.name + ', ' : ''}${hhmm(a)} – ${hhmm(z)}
        <em style="color:${bandColor(avg)}">${bandText(avg)} · ${avg}</em></div>
        <p class="tlrow__p">${desc.charAt(0).toUpperCase() + desc.slice(1)}.</p></div>
    </div>`;
  }).join('');
}

// ── Воздух ─────────────────────────────────────────────────────────────────
function renderAir() {
  const h = nowHour();
  const A = S.bundle.air?.hourly;
  if (!A || h?.aqi == null) {
    $('#aqiCard').innerHTML = `<h3 class="card__h">Качество воздуха</h3>
      <p class="card__sub">Для этой точки данных нет. Оценка бега считается без них.</p>`;
    $('#pollenCard').innerHTML = ''; return;
  }
  const [, name, color, hint] = aqiBand(h.aqi);
  $('#aqiCard').innerHTML = `
    <h3 class="card__h">Воздух для бега</h3>
    <div class="aqihead">
      <span class="aqichip" style="background:${color}">${name}</span>
      <div><div class="aqihead__v">Индекс ${Math.round(h.aqi)}</div><div class="aqihead__s">${hint}</div></div>
    </div>
    ${[['PM2.5', h.pm25, 'мкг/м³', 25], ['PM10', h.pm10, 'мкг/м³', 50],
       ['NO<sub>2</sub>', h.no2, 'мкг/м³', 100], ['O<sub>3</sub>', h.o3, 'мкг/м³', 120]]
      .map(([k, v, u, lim]) => {
        const ok = v != null && v <= lim;
        return `<div class="arow"><span class="arow__k">${k}</span>
          <span class="arow__v">${v == null ? '—' : v.toFixed(0)} ${u}</span>
          <span class="tagpill" style="background:${ok ? '#E4F5EA' : '#FDF1D9'};color:${ok ? '#12703A' : '#8A5F06'}">
            ${ok ? 'Норма' : 'Повышено'}</span></div>`;
      }).join('')}`;

  const ai = A.time.indexOf(h.iso);
  const pollens = [
    ['Ольха', A.alder_pollen?.[ai]], ['Берёза', A.birch_pollen?.[ai]],
    ['Злаки', A.grass_pollen?.[ai]], ['Полынь', A.mugwort_pollen?.[ai]],
    ['Амброзия', A.ragweed_pollen?.[ai]], ['Олива', A.olive_pollen?.[ai]]
  ].filter(p => p[1] != null);

  $('#pollenCard').innerHTML = `
    <h3 class="card__h">Пыльца</h3>
    ${pollens.length ? pollens.map(([k, v]) => {
      const [lvl, col] = POLLEN_LEVEL(v);
      return `<div class="arow"><span class="arow__k">${k}</span>
        <span class="arow__v">${v.toFixed(0)} з/м³</span>
        <span class="tagpill" style="background:${col}1A;color:${col}">${lvl}</span></div>`;
    }).join('') : '<p class="card__sub">Для этого региона нет данных о пыльце.</p>'}
    <div class="switchrow"><span>Учитывать пыльцу в оценке</span>
      <button class="switch ${S.profile.pollen === 'on' ? 'is-on' : ''}" id="pollenSwitch" role="switch"
        aria-checked="${S.profile.pollen === 'on'}"></button></div>`;

  $('#pollenSwitch')?.addEventListener('click', () => {
    S.profile.pollen = S.profile.pollen === 'on' ? 'off' : 'on';
    saveProfile(S.profile); recompute(); renderAll();
    toast(S.profile.pollen === 'on' ? 'Пыльца учитывается' : 'Пыльца не учитывается');
  });
}

// ── Детали и профиль ───────────────────────────────────────────────────────
function renderDetails() {
  const h = nowHour(), D = S.bundle.weather.daily;
  const sr = new Date(D.sunrise[0]), ss = new Date(D.sunset[0]);
  const dl = D.daylight_duration?.[0];
  const rows = [
    [glyph.uv, 'УФ-индекс', `${h.uv.toFixed(0)} (${uvWord(h.uv)})`],
    [glyph.eye, 'Видимость', h.vis == null ? '—' : `${(h.vis / 1000).toFixed(0)} км`],
    [glyph.feels, 'Ощущается как', `${round(h.feels)}°`],
    [glyph.dew, 'Точка росы', `${round(h.dew)}°`],
    [glyph.humid, 'Влажность', `${round(h.rh)}%`],
    [glyph.wind, 'Ветер', `${round(h.wind)} км/ч${h.gust ? ` (порывы ${round(h.gust)})` : ''}`],
    [glyph.sunrise, 'Восход', hhmm(sr)],
    [glyph.sunset, 'Закат', hhmm(ss)],
    [glyph.clock, 'Световой день', dl ? `${Math.floor(dl / 3600)} ч ${Math.round(dl % 3600 / 60)} мин` : '—']
  ];
  $('#detailsList').innerHTML = rows.map(([ic, k, v]) =>
    `<div class="drow"><span class="drow__ic">${ic}</span><span class="drow__k">${k}</span><span class="drow__v">${v}</span></div>`).join('');

  const P = S.profile;
  const opts = [
    ['duration', 'Длительность пробежки', `${P.duration} мин`, glyph.clock],
    ['heat', 'Переносимость жары', { low: 'Низкая', normal: 'Обычная', high: 'Высокая' }[P.heat], glyph.temp],
    ['cold', 'Переносимость холода', { low: 'Низкая', normal: 'Обычная', high: 'Высокая' }[P.cold], glyph.dew],
    ['rain', 'Отношение к дождю', { drier: 'Предпочитаю сухо', ok: 'Дождь не мешает' }[P.rain], glyph.rain],
    ['air', 'Чувствительность к воздуху', { normal: 'Обычная', high: 'Повышенная' }[P.air], glyph.air],
    ['pollen', 'Учитывать пыльцу', P.pollen === 'on' ? 'Да' : 'Нет', glyph.leaf]
  ];
  $('#profileList').innerHTML = opts.map(([k, label, v, ic]) =>
    `<button class="drow" data-opt="${k}"><span class="drow__ic">${ic}</span>
      <span class="drow__k">${label}</span><span class="drow__v">${v} ›</span></button>`).join('');

  const cities = loadCities();
  $('#savedCities').innerHTML = cities.map((c, i) =>
    `<div class="cityrow"><button data-city="${i}" style="text-align:left;flex:1">
      <b style="font-size:14.5px">${c.name}</b><br><small style="color:var(--muted)">${c.country || ''}</small></button>
      ${cities.length > 1 ? `<button class="del" data-delcity="${i}">Убрать</button>` : ''}</div>`).join('') +
    `<button class="linkrow" id="addCity2" style="margin-top:10px">Добавить город
      <svg viewBox="0 0 24 24" class="i14"><path d="M9 5l7 7-7 7z"/></svg></button>`;
}

$('#profileList')?.addEventListener('click', e => {
  const b = e.target.closest('[data-opt]'); if (b) openProfileSheet(b.dataset.opt);
});
$('#savedCities')?.addEventListener('click', e => {
  const c = e.target.closest('[data-city]');
  const d = e.target.closest('[data-delcity]');
  if (d) {
    const cities = loadCities(); cities.splice(+d.dataset.delcity, 1);
    saveCities(cities); renderDetails(); return;
  }
  if (c) { S.place = loadCities()[+c.dataset.city]; go('home'); load(); return; }
  if (e.target.closest('#addCity2')) openCitySheet();
});

// ── Шторки ─────────────────────────────────────────────────────────────────
function openSheet(html) {
  // Пересоздаём контейнер, чтобы обработчики прошлой шторки не накапливались.
  const old = $('#sheetoverBody');
  const fresh = document.createElement('div');
  fresh.id = 'sheetoverBody';
  old.replaceWith(fresh);
  fresh.innerHTML = html;
  $('#sheetover').hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeSheet() { $('#sheetover').hidden = true; document.body.style.overflow = ''; }

function openFactorSheet(key) {
  const h = nowHour(), f = h.factors[key], M = FACTOR_META[key];
  const RANGE = {
    temp: [-10, 35, h.feels, ['−10°', '0°', '10°', '20°', '30°+'], 'Слишком холодно', 'Идеально', 'Слишком жарко'],
    humid: [0, 100, h.rh, ['0%', '25%', '50%', '75%', '100%'], 'Сухо', 'Комфортно', 'Душно'],
    wind: [0, 45, h.wind, ['0', '10', '20', '30', '45 км/ч'], 'Штиль', 'Приятно', 'Мешает бежать'],
    rain: [0, 100, h.pop, ['0%', '25%', '50%', '75%', '100%'], 'Сухо', 'Возможен дождь', 'Ливень'],
    uv: [0, 11, h.uv, ['0', '3', '6', '8', '11+'], 'Низкий', 'Умеренный', 'Экстремальный'],
    air: [0, 100, h.aqi ?? 0, ['0', '25', '50', '75', '100'], 'Чистый', 'Умеренный', 'Грязный'],
    surface: [0, 10, h.recentMm, ['0', '2', '5', '7', '10 мм'], 'Сухо', 'Влажно', 'Скользко'],
    pollen: [0, 200, h.pollen ?? 0, ['0', '50', '100', '150', '200'], 'Низкая', 'Средняя', 'Высокая']
  }[key];
  const WHY = {
    temp: 'Чем жарче, тем больше крови уходит к коже на охлаждение — темп падает, пульс растёт. Прохлада на 8–17° по ощущению даёт лучшую работоспособность.',
    humid: 'При высокой влажности пот хуже испаряется, и тело перегревается даже в умеренную температуру.',
    wind: 'Встречный ветер добавляет к усилию примерно столько же, сколько подъём в гору, а после остановки быстро выстужает.',
    rain: 'Дождь сам по себе безопасен, но добавляет переохлаждение и натирания. Важнее сила осадков, чем их вероятность.',
    uv: 'При УФ выше 5 нужен крем и кепка, особенно на открытых маршрутах и на длинных пробежках.',
    air: 'На бегу вы вдыхаете в 5–10 раз больше воздуха, чем в покое, поэтому загрязнение бьёт сильнее, чем при прогулке.',
    surface: 'Недавний дождь и температура около нуля — главные причины скользкой дорожки и подвёрнутых стоп.',
    pollen: 'При аллергии высокая пыльца сужает дыхательные пути и сильно портит дыхание на темповых отрезках.'
  };
  const [lo, hi, val, ticks, l1, l2, l3] = RANGE;
  const posx = Math.max(2, Math.min(98, ((val - lo) / (hi - lo)) * 100));
  openSheet(`
    <h3>${M[0]}</h3>
    <p class="card__sub" style="margin:2px 0 0">${M[2](h)}</p>
    <div class="bigscore">
      <b style="background:${bandColor(f.v)}1A;color:${bandColor(f.v)}">${Math.round(f.v)}</b>
      <span>из 100</span><i style="color:${bandColor(f.v)}">${bandText(f.v)}</i>
    </div>
    <div class="scale">
      <div class="scale__bar"><div class="scale__dot" style="left:${posx}%"></div></div>
      <div class="scale__lbl"><span>${l1}</span><span>${l2}</span><span>${l3}</span></div>
      <div class="scale__ticks">${ticks.map(t => `<span>${t}</span>`).join('')}</div>
    </div>
    <div class="card" style="margin-top:14px">
      <h3 class="card__h">Почему это важно</h3>
      <p style="margin:0;font-size:13.5px;color:var(--ink-2);line-height:1.5">${WHY[key]}</p>
      <p style="margin:10px 0 0;font-size:12.5px;color:var(--muted)">Вес в итоговой оценке: ${f.w}%.</p>
    </div>`);
}

function openHourSheet(h) {
  openSheet(`
    <h3>${pad(h.t.getHours())}:00 · ${WEATHER_TEXT[h.code] || ''}</h3>
    <p class="card__sub" style="margin:2px 0 10px">${dayLabel(h.t)}, ${dateLabel(h.t)}</p>
    <div class="card"><div class="aqihead">
      ${ring(h.score)}
      <div><div class="aqihead__v">${bandText(h.score)}</div>
      <div class="aqihead__s">${mainConditions(h)}</div></div></div></div>
    <div class="card">${Object.entries(h.factors).sort((a, b) => b[1].w - a[1].w).map(([k, v]) => `
      <div class="frow" style="grid-template-columns:26px 1fr auto">
        <span class="frow__ic">${FACTOR_META[k][1]}</span>
        <span class="frow__k">${FACTOR_META[k][0]}<small>${FACTOR_META[k][2](h)}</small></span>
        <span class="frow__n" style="color:${bandColor(v.v)}">${Math.round(v.v)}</span>
      </div>`).join('')}</div>`);
}

function openDaySheet(iso) {
  const dt = new Date(iso + 'T12:00');
  const day = S.hours.filter(h => h.iso.slice(0, 10) === iso);
  const bw = bestWindowOfDay(S.hours, iso, S.profile.duration);
  openSheet(`
    <h3>${DOW[dt.getDay()]}, ${dateLabel(dt)}</h3>
    ${bw ? `<p class="card__sub" style="margin:2px 0 10px">Лучшее окно ${hhmm(bw.slice[0].t)} – ${hhmm(new Date(bw.slice.at(-1).t.getTime() + 3600e3))} · оценка ${bw.score}</p>` : ''}
    <div class="card card--table">
      <div class="thead"><span>Время</span><span>Погода</span><span>Темп.</span><span>Осадки</span><span>Оценка</span></div>
      ${day.filter((_, i) => i % 2 === 0).map(h => `
        <div class="trow"><span class="trow__t">${pad(h.t.getHours())}:00</span>
          <span class="trow__i">${weatherIcon(h.code, h.isDay)}</span>
          <span class="trow__temp">${round(h.temp)}°</span>
          <span class="trow__p">${h.pop}%</span>
          <span class="trow__s"><span class="pill s-${band(h.score)}">${h.score}</span></span></div>`).join('')}
    </div>`);
}

const PROFILE_OPTS = {
  duration: ['Длительность пробежки', [[30, '30 мин'], [45, '45 мин'], [60, '60 мин'], [90, '90 мин'], [120, '2 часа']],
    'Оценка ищет лучшее окно именно такой длины.'],
  heat: ['Переносимость жары', [['low', 'Низкая'], ['normal', 'Обычная'], ['high', 'Высокая']],
    'Если жара даётся тяжело, комфортный коридор сдвинется вниз.'],
  cold: ['Переносимость холода', [['low', 'Низкая'], ['normal', 'Обычная'], ['high', 'Высокая']],
    'Влияет на то, с какой температуры оценка начинает падать.'],
  rain: ['Отношение к дождю', [['drier', 'Предпочитаю сухо'], ['ok', 'Дождь не мешает']],
    'Если дождь вам нипочём, он будет снижать оценку слабее.'],
  air: ['Чувствительность к воздуху', [['normal', 'Обычная'], ['high', 'Повышенная']],
    'При астме или аллергии выбирайте повышенную.'],
  pollen: ['Учитывать пыльцу', [['off', 'Нет'], ['on', 'Да']],
    'Добавит пыльцу отдельным фактором в оценку.']
};

function openProfileSheet(key) {
  const [title, options, hint] = PROFILE_OPTS[key];
  openSheet(`<h3>${title}</h3><p class="card__sub" style="margin:4px 0 12px">${hint}</p>
    <div class="chooser">${options.map(([v, l]) =>
      `<button class="chip ${String(S.profile[key]) === String(v) ? 'is-on' : ''}" data-set="${v}">${l}</button>`).join('')}</div>`);
  $('#sheetoverBody').addEventListener('click', e => {
    const b = e.target.closest('[data-set]'); if (!b) return;
    const v = b.dataset.set;
    S.profile[key] = key === 'duration' ? Number(v) : v;
    saveProfile(S.profile); recompute(); renderAll(); closeSheet();
    toast('Профиль обновлён');
  });
}

function openCitySheet() {
  openSheet(`<h3>Добавить город</h3>
    <input class="searchbox" id="cityQ" placeholder="Например, Варшава" autocomplete="off">
    <ul class="reslist" id="cityRes"></ul>`);
  const inp = $('#cityQ'); inp.focus();
  let t;
  inp.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      if (inp.value.trim().length < 2) return ($('#cityRes').innerHTML = '');
      try {
        const res = await searchCity(inp.value.trim());
        $('#cityRes').innerHTML = res.map((r, i) =>
          `<li data-res="${i}"><span>${r.name}</span><small>${r.country}</small></li>`).join('')
          || '<li>Ничего не нашлось</li>';
        $('#cityRes').onclick = e => {
          const li = e.target.closest('[data-res]'); if (!li) return;
          const c = res[+li.dataset.res];
          const cities = loadCities();
          if (!cities.some(x => x.name === c.name && Math.abs(x.lat - c.lat) < 0.01)) cities.push(c);
          saveCities(cities); S.place = c; closeSheet(); go('home'); load();
        };
      } catch { $('#cityRes').innerHTML = '<li>Поиск недоступен без сети</li>'; }
    }, 320);
  });
}

$('#btnAddCity').addEventListener('click', openCitySheet);
$('#btnPlace').addEventListener('click', openCitySheet);
$('#btnLocate').addEventListener('click', () => {
  if (!navigator.geolocation) return toast('Геолокация недоступна');
  toast('Определяем местоположение…');
  navigator.geolocation.getCurrentPosition(async pos => {
    const p = await reverseGeocode(+pos.coords.latitude.toFixed(3), +pos.coords.longitude.toFixed(3));
    S.place = p;
    const cities = loadCities();
    cities[0] = p; saveCities(cities);
    load();
  }, () => toast('Не удалось определить место'), { timeout: 8000, maximumAge: 6e5 });
});

// ── Радар ──────────────────────────────────────────────────────────────────
let map, radarFrames = [], radarLayer = null, radarIdx = 0, radarTimer = null, radarReady = false;

async function initRadar() {
  if (radarReady) { map?.invalidateSize(); return; }
  try {
    await loadLeaflet();
    map = L.map('map', { zoomControl: false, attributionControl: true })
      .setView([S.place.lat, S.place.lon], 8);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      { attribution: '© OpenStreetMap, © CARTO', maxZoom: 14 }).addTo(map);
    L.circleMarker([S.place.lat, S.place.lon],
      { radius: 7, color: '#fff', weight: 3, fillColor: '#2F80ED', fillOpacity: 1 }).addTo(map);

    const j = await fetch('https://api.rainviewer.com/public/weather-maps.json').then(r => r.json());
    radarFrames = [...(j.radar?.past || []), ...(j.radar?.nowcast || [])];
    const host = j.host || 'https://tilecache.rainviewer.com';
    radarFrames = radarFrames.map(f => ({ ...f, url: `${host}${f.path}/256/{z}/{x}/{y}/4/1_1.png` }));
    radarIdx = Math.max(0, (j.radar?.past?.length || 1) - 1);
    const sl = $('#radarTime'); sl.max = radarFrames.length - 1; sl.value = radarIdx;
    showFrame(radarIdx);
    sl.addEventListener('input', () => { stopRadar(); showFrame(+sl.value); });
    $('#radarPlay').addEventListener('click', toggleRadar);
    radarReady = true;
  } catch {
    $('#map').innerHTML = `<div style="display:grid;place-items:center;height:100%;padding:24px;text-align:center;color:#7A8AA3;font-size:14px">
      Радар доступен только онлайн. Подключитесь к сети и откройте карту ещё раз.</div>`;
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
  if (!radarFrames[i]) return;
  radarIdx = i;
  const next = L.tileLayer(radarFrames[i].url, { opacity: 0.75, zIndex: 400 }).addTo(map);
  const prev = radarLayer; radarLayer = next;
  setTimeout(() => prev && map.removeLayer(prev), 220);
  const d = new Date(radarFrames[i].time * 1000);
  const past = radarFrames[i].time * 1000 <= Date.now();
  $('#radarLabel').textContent = `${hhmm(d)} · ${past ? 'было' : 'прогноз'}`;
  $('#radarTime').value = i;
}
function toggleRadar() { radarTimer ? stopRadar() : startRadar(); }
function startRadar() {
  $('#radarPlay').innerHTML = '<svg viewBox="0 0 24 24" class="i20"><path d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg>';
  radarTimer = setInterval(() => showFrame((radarIdx + 1) % radarFrames.length), 620);
}
function stopRadar() {
  clearInterval(radarTimer); radarTimer = null;
  $('#radarPlay').innerHTML = '<svg viewBox="0 0 24 24" class="i20"><path d="M8 5v14l11-7z"/></svg>';
}

// ── Установка PWA + сервис-воркер ──────────────────────────────────────────
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

// Обновление при возврате в приложение
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && S.bundle && Date.now() - S.bundle.at > 12 * 60e3) load(false);
});
setInterval(() => { if (S.bundle && !document.hidden) renderHome(); }, 60e3);

// ── Переходы по адресу (#analysis, #radar — ярлыки установленного приложения)
const SCREENS = ['home', 'hourly', 'daily', 'analysis', 'air', 'radar', 'details'];
function fromHash() {
  const h = location.hash.replace('#', '');
  if (SCREENS.includes(h) && h !== S.screen) go(h);
}
window.addEventListener('hashchange', fromHash);
window.__go = go; // используется ярлыками и автотестами

// ── Старт ──────────────────────────────────────────────────────────────────
load().then(() => fromHash());
