const THEMES = ['clear', 'cloud', 'rain', 'snow', 'storm', 'fog'];

export function weatherHeroTheme(code) {
  const value = Number(code);
  if ([95, 96, 99].includes(value)) return 'storm';
  if ([45, 48].includes(value)) return 'fog';
  if ((value >= 51 && value <= 67) || (value >= 80 && value <= 82)) return 'rain';
  if ((value >= 71 && value <= 77) || value === 85 || value === 86) return 'snow';
  if ([1, 2, 3].includes(value)) return 'cloud';
  return 'clear';
}

export function applyWeatherHeroTheme(element, code, isDay, localArtwork = false) {
  if (!element) return 'clear';
  const theme = weatherHeroTheme(code);
  element.classList.remove(...THEMES.map(x => `hero-theme--${x}`), 'is-day', 'is-night', 'is-prague');
  element.classList.add(`hero-theme--${theme}`, Number(isDay) === 0 ? 'is-night' : 'is-day');
  element.classList.toggle('is-prague', !!localArtwork);
  element.dataset.weatherTheme = theme;
  return theme;
}
