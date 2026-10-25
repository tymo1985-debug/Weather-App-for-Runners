import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../css/accessibility.css',import.meta.url),'utf8');

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
