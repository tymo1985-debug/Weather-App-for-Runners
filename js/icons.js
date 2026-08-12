// Иконки погоды — собственные SVG, без внешних зависимостей.
const sun = (s = 1) => `
  <circle cx="32" cy="32" r="12" fill="#FDB813"/>
  ${[...Array(8)].map((_, i) => {
    const a = (i * Math.PI) / 4;
    const x1 = 32 + Math.cos(a) * 18, y1 = 32 + Math.sin(a) * 18;
    const x2 = 32 + Math.cos(a) * 25, y2 = 32 + Math.sin(a) * 25;
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#FDB813" stroke-width="4.5" stroke-linecap="round"/>`;
  }).join('')}`;

const moon = `<path d="M42 38a16 16 0 0 1-19.6-21.6A17 17 0 1 0 42 38Z" fill="#C8D6EA"/>`;

const cloud = (x = 0, y = 0, c1 = '#E6EDF6', c2 = '#C6D3E3', sc = 1) =>
  `<g transform="translate(${x} ${y}) scale(${sc})">
    <path d="M20 46a11 11 0 0 1-.6-22 15 15 0 0 1 28.3 4.3A9.5 9.5 0 0 1 46 46Z" fill="${c1}"/>
    <path d="M20 46a11 11 0 0 1-.6-22c.4 0 .8 0 1.2.1A11 11 0 0 0 23 46Z" fill="${c2}"/>
  </g>`;

const drops = (n = 3, color = '#4FA8E8') =>
  [...Array(n)].map((_, i) =>
    `<path d="M${21 + i * 11} 49c0 0-3.5 4.4-3.5 6.4a3.5 3.5 0 0 0 7 0c0-2-3.5-6.4-3.5-6.4Z" fill="${color}" opacity="${1 - i * 0.08}"/>`
  ).join('');

const flakes = (n = 3) =>
  [...Array(n)].map((_, i) =>
    `<g transform="translate(${21 + i * 11} 54)" stroke="#9CC7E8" stroke-width="2.2" stroke-linecap="round">
      <line x1="-4" y1="0" x2="4" y2="0"/><line x1="-2" y1="-3.4" x2="2" y2="3.4"/><line x1="2" y1="-3.4" x2="-2" y2="3.4"/>
    </g>`
  ).join('');

const bolt = `<path d="M34 46 24 60h7l-3 10 12-15h-7l4-9Z" fill="#F5A623"/>`;

const wrap = (inner) =>
  `<svg viewBox="0 0 64 72" xmlns="http://www.w3.org/2000/svg" role="img">${inner}</svg>`;

// WMO weather code -> иконка
export function weatherIcon(code, isDay = 1) {
  const base = isDay ? sun() : moon;
  const c = Number(code);
  if (c === 0) return wrap(base);
  if (c === 1) return wrap(base + cloud(10, 12, '#EEF3F9', '#D2DEEB', 0.62));
  if (c === 2) return wrap(`<g transform="translate(-6 -6) scale(.8)">${base}</g>` + cloud(4, 6, '#EDF3F9', '#CBD8E7', 0.86));
  if (c === 3) return wrap(cloud(0, 4, '#DCE5F0', '#BDCBDD', 1));
  if (c === 45 || c === 48) return wrap(cloud(0, 0, '#E2E9F1', '#C6D2DF', .95) +
    `<g stroke="#B7C4D4" stroke-width="3.5" stroke-linecap="round"><line x1="16" y1="54" x2="48" y2="54"/><line x1="21" y1="62" x2="43" y2="62"/></g>`);
  if ([51, 53, 55, 56, 57].includes(c)) return wrap(cloud(0, 0, '#E2E9F1', '#C6D2DF', .95) + drops(2, '#7FC0EA'));
  if ([61, 63, 80, 81].includes(c)) return wrap(cloud(0, 0, '#DDE6F1', '#BDCBDD', .95) + drops(3));
  if ([65, 82].includes(c)) return wrap(cloud(0, 0, '#C9D6E6', '#A9BACE', .95) + drops(4, '#2F80ED'));
  if ([66, 67].includes(c)) return wrap(cloud(0, 0, '#DDE6F1', '#BDCBDD', .95) + drops(2) + flakes(1));
  if ([71, 73, 75, 77, 85, 86].includes(c)) return wrap(cloud(0, 0, '#E6EDF6', '#C6D3E3', .95) + flakes(3));
  if ([95, 96, 99].includes(c)) return wrap(cloud(0, -2, '#C3D0E0', '#A3B4C9', .95) + bolt);
  return wrap(base);
}

export const WEATHER_TEXT = {
  0: 'Ясно', 1: 'Малооблачно', 2: 'Переменная облачность', 3: 'Пасмурно',
  45: 'Туман', 48: 'Изморозь', 51: 'Слабая морось', 53: 'Морось', 55: 'Сильная морось',
  56: 'Ледяная морось', 57: 'Ледяная морось', 61: 'Небольшой дождь', 63: 'Дождь', 65: 'Сильный дождь',
  66: 'Ледяной дождь', 67: 'Ледяной дождь', 71: 'Небольшой снег', 73: 'Снег', 75: 'Сильный снег',
  77: 'Снежная крупа', 80: 'Кратковременный дождь', 81: 'Ливень', 82: 'Сильный ливень',
  85: 'Снегопад', 86: 'Сильный снегопад', 95: 'Гроза', 96: 'Гроза с градом', 99: 'Гроза с градом'
};

export const glyph = {
  temp: `<svg viewBox="0 0 24 24" fill="none"><path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0Z" stroke="#E4735B" stroke-width="1.8"/><path d="M12 8v7" stroke="#E4735B" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  humid: `<svg viewBox="0 0 24 24"><path d="M12 3s6 6.7 6 10.5a6 6 0 1 1-12 0C6 9.7 12 3 12 3Z" fill="#4FA8E8"/></svg>`,
  wind: `<svg viewBox="0 0 24 24" fill="none" stroke="#5FA8D3" stroke-width="1.8" stroke-linecap="round"><path d="M3 8h11a2.5 2.5 0 1 0-2.5-2.5"/><path d="M3 12h15a2.5 2.5 0 1 1-2.5 2.5"/><path d="M3 16h8a2 2 0 1 1-2 2"/></svg>`,
  rain: `<svg viewBox="0 0 24 24"><path d="M7 15a4 4 0 0 1-.3-8 5.5 5.5 0 0 1 10.5 1.6A3.6 3.6 0 0 1 17 15Z" fill="#B9C9DC"/><path d="M8 17.5 7 20m4.5-2.5-1 2.5m5.5-2.5-1 2.5" stroke="#4FA8E8" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  uv: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.5" fill="#F3B01B"/><g stroke="#F3B01B" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/></g></svg>`,
  air: `<svg viewBox="0 0 24 24"><path d="M12 20c0-6 4-9 8-9-1 6-4 9-8 9Z" fill="#5FBF7E"/><path d="M12 20c0-5-3-7.5-7-7.5.9 5 3.6 7.5 7 7.5Z" fill="#8FD3A3"/><path d="M12 20v-6" stroke="#3E9C61" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  surface: `<svg viewBox="0 0 24 24"><path d="M12 4c3 4 5 6.5 5 9a5 5 0 1 1-10 0c0-2.5 2-5 5-9Z" fill="#7FB77E"/></svg>`,
  feels: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="#E4735B" stroke-width="1.8"/><path d="M9 13c1.5 1.6 4.5 1.6 6 0" stroke="#E4735B" stroke-width="1.8" stroke-linecap="round"/><circle cx="9.5" cy="10" r="1.1" fill="#E4735B"/><circle cx="14.5" cy="10" r="1.1" fill="#E4735B"/></svg>`,
  dew: `<svg viewBox="0 0 24 24"><path d="M12 4s5 6 5 9a5 5 0 1 1-10 0c0-3 5-9 5-9Z" fill="#6FB3E0"/><circle cx="10" cy="14" r="1.4" fill="#fff" opacity=".8"/></svg>`,
  eye: `<svg viewBox="0 0 24 24"><path d="M12 5c5 0 9 4.5 9 7s-4 7-9 7-9-4.5-9-7 4-7 9-7Zm0 3.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" fill="#8C9CB5"/></svg>`,
  sunrise: `<svg viewBox="0 0 24 24"><path d="M12 4 8.5 8h7L12 4Z" fill="#F3B01B"/><circle cx="12" cy="15" r="3.5" fill="#F3B01B"/><path d="M3 20h18" stroke="#F3B01B" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  sunset: `<svg viewBox="0 0 24 24"><path d="M12 9 8.5 5h7L12 9Z" fill="#EF8A47"/><circle cx="12" cy="15" r="3.5" fill="#EF8A47"/><path d="M3 20h18" stroke="#EF8A47" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  moonp: `<svg viewBox="0 0 24 24"><path d="M15 3a9 9 0 1 0 0 18 9 9 0 0 1 0-18Z" fill="#8C9CB5"/></svg>`,
  clock: `<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm1 9.6 3.4 2-1 1.7L11 13.6V7h2v5.6Z" fill="#8C9CB5"/></svg>`,
  check: `<svg viewBox="0 0 24 24"><path d="M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7Z"/></svg>`,
  warn: `<svg viewBox="0 0 24 24"><path d="M12 3 1.5 21h21L12 3Zm1 13h-2v2h2v-2Zm0-6h-2v5h2v-5Z"/></svg>`,
  leaf: `<svg viewBox="0 0 24 24"><path d="M5 19c0-8 6-13 14-13 0 8-5 14-13 14l-1-1Z" fill="#5FBF7E"/><path d="M6 19c3-5 6-8 11-10" stroke="#3E9C61" stroke-width="1.4" stroke-linecap="round" fill="none"/></svg>`
};

// Дополнительные глифы для экранов деталей, воздуха и карты
Object.assign(glyph, {
  runner: `<svg viewBox="0 0 24 24"><path d="M13.5 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM9.8 8.9 7 10.4 5.6 8.6 9.9 6a2.6 2.6 0 0 1 2.9.2l2 1.6 2.4-.9.7 1.9-3.4 1.3-1.3-1-1 4.1 3 2.6 1.5 5.2-2 .6-1.3-4.4-4-3.4-1.4 5-1.9 3.4-1.8-1 1.7-3 1.7-6.9Z"/></svg>`,
  alarm: `<svg viewBox="0 0 24 24" fill="none" stroke="#5B8DEF" stroke-width="1.7"><circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.5M5 4 2.5 6.5M19 4l2.5 2.5" stroke-linecap="round"/></svg>`,
  target: `<svg viewBox="0 0 24 24" fill="none" stroke="#8C9CB5" stroke-width="1.7"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1.2" fill="#8C9CB5"/></svg>`,
  moonphase: (f) => `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="#2C3E56"/>
    <path d="${moonPath(f)}" fill="#E3E9F1"/>
    <circle cx="12" cy="12" r="8.5" fill="none" stroke="#8C9CB5" stroke-width="1.1"/></svg>`,
  trend: `<svg viewBox="0 0 24 24" fill="none" stroke="#8C9CB5" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 16.5 8 11l3.5 3.5L20 6"/><path d="M15 6h5v5"/></svg>`,
  models: `<svg viewBox="0 0 24 24" fill="none" stroke="#8C9CB5" stroke-width="1.7"><rect x="3" y="4" width="7" height="7" rx="1.6"/><rect x="14" y="4" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/></svg>`,
  gauge: `<svg viewBox="0 0 24 24" fill="none" stroke="#8C9CB5" stroke-width="1.7" stroke-linecap="round"><path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4.2-4.6"/></svg>`,
  layers: `<svg viewBox="0 0 24 24"><path d="m12 3 9 5-9 5-9-5 9-5Z" fill="#2C3E56"/><path d="m3 12.5 9 5 9-5" fill="none" stroke="#2C3E56" stroke-width="1.8" stroke-linejoin="round"/><path d="m3 16.5 9 5 9-5" fill="none" stroke="#8C9CB5" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  navigate: `<svg viewBox="0 0 24 24"><path d="M21 3 3 10.5l7.6 2.9L13.5 21 21 3Z" fill="#2C3E56"/></svg>`,
  plus: `<svg viewBox="0 0 24 24"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>`,
  minus: `<svg viewBox="0 0 24 24"><path d="M5 11h14v2H5z"/></svg>`,
  shareIcon: `<svg viewBox="0 0 24 24"><path d="M12 3 7.8 7.2l1.4 1.4L11 6.8V16h2V6.8l1.8 1.8 1.4-1.4L12 3ZM5 12h2v7h10v-7h2v9H5v-9Z"/></svg>`,
  arrowRight: `<svg viewBox="0 0 24 24"><path d="M13 5l7 7-7 7-1.4-1.4 4.6-4.6H4v-2h12.2L11.6 6.4z"/></svg>`,
  arrowDown: `<svg viewBox="0 0 24 24"><path d="M11 4v12.2l-4.6-4.6L5 13l7 7 7-7-1.4-1.4-4.6 4.6V4z"/></svg>`,
  smile: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#1F9D4D"/><circle cx="9.3" cy="10.3" r="1.3" fill="#fff"/><circle cx="14.7" cy="10.3" r="1.3" fill="#fff"/><path d="M8.4 14.2c1.9 2 5.3 2 7.2 0" stroke="#fff" stroke-width="1.7" fill="none" stroke-linecap="round"/></svg>`,
  hot: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#EF6C2E"/><path d="M12 6c2.4 3 3.8 5 3.8 6.8a3.8 3.8 0 0 1-7.6 0C8.2 11 9.6 9 12 6Z" fill="#fff"/></svg>`,
  thermo2: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#E9A21B"/><path d="M13.2 13.4V7.6a1.2 1.2 0 1 0-2.4 0v5.8a3 3 0 1 0 2.4 0Z" fill="#fff"/></svg>`,
  clockG: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#1F9D4D"/><path d="M12.9 11.7V7h-1.8v5.5l3.6 2.2.9-1.5-2.7-1.5Z" fill="#fff"/></svg>`,
  checkCircle: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#1F9D4D"/><path d="m10.6 15.3-3-3 1.3-1.3 1.7 1.7 4.5-4.5 1.3 1.3-5.8 5.8Z" fill="#fff"/></svg>`,
  pin: `<svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/></svg>`,
  star: `<svg viewBox="0 0 24 24"><path d="m12 17.3 6.2 3.7-1.6-7 5.4-4.7-7.1-.6L12 2 9.1 8.7l-7.1.6 5.4 4.7-1.6 7z"/></svg>`,
  globe: `<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2c1.7 2.3 2.6 5.1 2.6 8s-.9 5.7-2.6 8c-1.7-2.3-2.6-5.1-2.6-8s.9-5.7 2.6-8ZM4.3 11h3.1a19 19 0 0 0 .9 5.4A8 8 0 0 1 4.3 11Zm0-2A8 8 0 0 1 8.3 4.6 19 19 0 0 0 7.4 9H4.3Zm12.3 0a19 19 0 0 0-.9-4.4A8 8 0 0 1 19.7 9h-3.1Zm0 2h3.1a8 8 0 0 1-4 5.4 19 19 0 0 0 .9-5.4Z"/></svg>`,
  person: `<svg viewBox="0 0 24 24"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.4 0-8 2.2-8 5v3h16v-3c0-2.8-3.6-5-8-5Z"/></svg>`,
  house: `<svg viewBox="0 0 24 24"><path d="M12 3 3 10.5V21h6v-6h6v6h6V10.5z"/></svg>`
});

// Растения для раздела пыльцы
export const plant = (kind) => {
  const c = { willow: '#93C271', birch: '#7FB35C', grass: '#6FA84E',
    mugwort: '#A3C98A', ragweed: '#86B863', olive: '#7CA85A' }[kind] || '#8FBF6A';
  const leaf = (y, dir) =>
    `<path d="M0 0c4.2-1.8 7.1-0.8 7.8 1.5C5.1 3.4 1.9 3 0 0Z" fill="${c}"
       transform="translate(12 ${y}) scale(${dir} 1)"/>`;
  return `<svg viewBox="0 0 24 24">
    <path d="M12 21.5V8" stroke="#6F9E4B" stroke-width="1.6" stroke-linecap="round" fill="none"/>
    ${leaf(10, 1)}${leaf(13, -1)}${leaf(16, 1)}${leaf(19, -1)}
    <ellipse cx="12" cy="6.8" rx="2" ry="2.7" fill="${c}"/></svg>`;
};

function moonPath(f) {
  const R = 8.5, cx = 12, cy = 12;
  const k = (1 - Math.cos(2 * Math.PI * f)) / 2;   // освещённая доля
  const rx = (R * Math.abs(1 - 2 * k)).toFixed(2);
  const waxing = f < 0.5;
  const semi = waxing ? 1 : 0;
  const term = ((k > 0.5) === waxing) ? 1 : 0;
  return `M${cx} ${cy - R} A${R} ${R} 0 0 ${semi} ${cx} ${cy + R} A${rx} ${R} 0 0 ${term} ${cx} ${cy - R} Z`;
}

export function moonFraction(date) {
  const known = Date.UTC(2000, 0, 6, 18, 14); // новолуние
  const syn = 29.530588853 * 86400000;
  return (((date.getTime() - known) % syn) + syn) % syn / syn;
}
