import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../css/accessibility.css',import.meta.url),'utf8');
const mobile=fs.readFileSync(new URL('../css/mobile-layout.css',import.meta.url),'utf8');
const androidActivity=fs.readFileSync(new URL('../android/app/src/main/java/com/alextymoshchuk/runweather/MainActivity.java',import.meta.url),'utf8');

test('tab lists support roving focus and keyboard navigation',()=>{
  assert.match(app,/syncTabState/);
  assert.match(app,/ArrowLeft.*ArrowRight.*Home.*End/);
  assert.match(html,/planner-tabs" role="tablist"/);
  assert.match(html,/run-details-tabs" role="tablist"/);
});

test('city removal names the affected city for assistive technology',()=>{
  assert.match(app,/T\.removeCity\(c\.name\)/);
});

test('secondary phone labels have a dedicated readable typography layer',()=>{
  assert.match(html,/css\/accessibility\.css/);
  assert.match(css,/text-size-adjust:100%/);
  assert.match(css,/font-size:max\(11\.5px/);
});

test('More stays below system bars and offers an explicit back action',()=>{
  assert.match(html,/more-page__back[^>]*data-back/);
  assert.match(mobile,/\.more-page\.safe-top/);
  assert.match(mobile,/\.screen--weather \.weather-hero\.safe-top/);
});

test('Home fills tall screens and uses a city-neutral weather backdrop',()=>{
  assert.match(mobile,/\.screen--home\.is-active\{display:flex/);
  assert.match(mobile,/linear-gradient\(165deg,#3593DF/);
  assert.doesNotMatch(mobile,/prague/i);
});

test('browser history makes Android system Back follow the app stack',()=>{
  assert.match(app,/history\.pushState/);
  assert.match(app,/addEventListener\('popstate'/);
  assert.match(androidActivity,/OnBackPressedCallback/);
  assert.match(androidActivity,/bridge\.getWebView\(\)\.goBack\(\)/);
});

test('secondary screens clear system bars and hide root navigation',()=>{
  assert.match(mobile,/\.topbar\.safe-top/);
  assert.match(mobile,/\.modal-top\.safe-top/);
  assert.match(mobile,/body\.is-secondary-screen \.tabbar\{display:none\}/);
  assert.match(app,/TOP_LEVEL_SCREENS/);
});

test('Settings and About are focused screens with their own Back control',()=>{
  assert.match(html,/data-screen="settings"[\s\S]*moreSettingsPanelTitle/);
  assert.match(html,/data-screen="about"[\s\S]*moreAboutPanelTitle/);
  assert.match(html,/id="moreSettingsRow" data-go="settings"/);
  assert.match(html,/id="moreAboutRow" data-go="about"/);
});

test('active city and frequent compact controls have clear phone ergonomics',()=>{
  assert.match(app,/cityrow__active/);
  assert.match(app,/T\.activeCity/);
  assert.match(mobile,/\.radar-quick__choices button/);
  assert.match(mobile,/\.cityrow \.del\{min-height:44px/);
});
