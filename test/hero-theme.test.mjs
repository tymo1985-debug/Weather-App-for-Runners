import test from 'node:test';
import assert from 'node:assert/strict';
import { weatherHeroTheme, applyWeatherHeroTheme } from '../js/hero-theme.js';

test('weather hero classifies common weather states', () => {
  assert.equal(weatherHeroTheme(0), 'clear');
  assert.equal(weatherHeroTheme(3), 'cloud');
  assert.equal(weatherHeroTheme(61), 'rain');
  assert.equal(weatherHeroTheme(75), 'snow');
  assert.equal(weatherHeroTheme(95), 'storm');
  assert.equal(weatherHeroTheme(45), 'fog');
});

test('weather hero applies day, night and optional local artwork independently', () => {
  const values = new Set();
  const element = {
    dataset: {},
    classList: {
      add: (...items) => items.forEach(x => values.add(x)),
      remove: (...items) => items.forEach(x => values.delete(x)),
      toggle: (item, on) => on ? values.add(item) : values.delete(item)
    }
  };
  applyWeatherHeroTheme(element, 61, 0, false);
  assert.ok(values.has('hero-theme--rain'));
  assert.ok(values.has('is-night'));
  assert.ok(!values.has('is-prague'));
  applyWeatherHeroTheme(element, 0, 1, true);
  assert.ok(values.has('hero-theme--clear'));
  assert.ok(values.has('is-day'));
  assert.ok(values.has('is-prague'));
});
