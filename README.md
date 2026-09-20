# Run Weather - PWA

Прогноз погоды с оценкой условий для бега. Собрано ровно по десяти экранам макета:
главная, почасовой прогноз, 10 дней, обзор условий, разбор оценки, разбор фактора,
таймлайн на сутки, воздух и пыльца, радар осадков, детали и настройки.

Интерфейс на английском (как в макете) и на русском - переключатель в разделе Profile.
По умолчанию язык берётся из системы.

## Экраны и код

| Экран макета | Функция в `js/app.js` |
|---|---|
| 1. Home / Main Screen | `renderHome`, `renderStrip` |
| 2. Hourly Forecast | `renderHourly` |
| 3. 10-Day Forecast | `renderDaily` |
| 4. Runner Analysis - Overview | `renderAnalysis`, `drawDayChart` |
| 5. Why it's good now | `renderWhy`, `renderBreakdown` |
| 6. Detailed factor analysis | `renderFactor` |
| 7. Runner timeline | `renderTimeline`, `drawTimelineChart` |
| 8. Air quality & pollen | `renderAir` |
| 9. Radar / Map | `initRadar` |
| 10. Weather details & settings | `renderDetails` |

## Файлы

- `index.html` - разметка всех экранов
- `css/styles.css` - оформление
- `js/app.js` - экраны и навигация
- `js/engine.js` - загрузка данных и расчёт оценки
- `js/i18n.js` - строки интерфейса (en / ru)
- `js/icons.js` - иконки погоды и интерфейса, фазы Луны, растения
- `sw.js`, `manifest.webmanifest`, `icons/` - установка и офлайн

## Запуск

Нужен HTTP-сервер: модули и сервис-воркер не работают через `file://`.

```bash
python3 -m http.server 8000
```

Для установки на телефон нужен HTTPS - выложите папку на GitHub Pages, Netlify,
Vercel или Cloudflare Pages. Сборка не требуется.

## Данные

Погода, качество воздуха, пыльца и поиск городов - [Open-Meteo](https://open-meteo.com),
без ключа. Радар - [RainViewer](https://www.rainviewer.com), подложка - CARTO / OpenStreetMap
через Leaflet. Обратный геокодинг - BigDataCloud.

## Как считается оценка

Каждый фактор даёт 0-100 баллов, затем берётся взвешенная сумма (`WEIGHTS` в `js/engine.js`):
температура 30, осадки 22, ветер 12, воздух 12, влажность 10, УФ 8, покрытие 6, пыльца 8
(если включена). Итог смещается к худшему фактору в пропорции 80/20, чтобы одно плохое
условие не растворялось в среднем. Отдельные ограничители: гроза - не выше 30,
мокрая дорога около нуля - не выше 52.

Профиль бегуна - переносимость жары и холода, отношение к дождю, чувствительность
к воздуху и пыльце, планируемая длительность - сдвигает пороги факторов и длину окна,
которое ищет приложение.

## Что стоит добавить дальше

- Утреннее уведомление с лучшим окном на день.
- Экран сравнения нескольких городов.
- Учёт маршрута: тень, набор высоты, близость к дорогам.
- Обучение оценки на реальных пробежках из трекера.
# Near-term start advice (Part B)

The home screen compares a complete run starting now with hourly forecast starts
within the selected 1- or 2-hour availability horizon. It uses the selected
30/45/60/90/120-minute duration and the existing whole-window scorer and
safety caps. Forecast hours are treated as approximate starts, not precise
minute-level predictions. A later start is worth recommending only if its
score rises by at least 7 points for a wait of up to 60 minutes, or 10 points
for a longer wait. Equal-scoring candidates prefer the earlier start. Hazardous
future windows and incomplete run windows are not suggested. With insufficient
data for a comparison, the existing full-day information remains available.

# Practical run advice (Part C)

The home screen shows up to two short tips for the selected near-term run
window and duration, using the forecast already loaded for scoring. Ordinary
conditions show no tip. Priority is thunder, meaningful rain, strong wind,
heat, then cold; thunder suppresses a duplicate rain tip. The advice does not
change scores or request additional weather data.
