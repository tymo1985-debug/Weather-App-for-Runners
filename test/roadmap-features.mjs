import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWatch, watchChange } from '../js/weather-watch.js';
import { parseGpx, routeWindContext } from '../js/route-plan.js';
import { effortHint } from '../js/run-history.js';

test('weather watch reacts to meaningful score, time or hazard changes',()=>{
  const opt={score:80,hazard:false,slice:[{iso:'2026-09-23T18:00'}]};
  const w=makeWatch(opt,{lat:50,lon:14},60);
  assert.equal(watchChange(w,{score:74,hazard:false,slice:[{iso:'2026-09-23T18:00'}]}),null);
  assert.equal(watchChange(w,{score:65,hazard:false,slice:[{iso:'2026-09-23T18:00'}]}).scoreDelta,-15);
  assert.equal(watchChange(w,{score:80,hazard:true,slice:[{iso:'2026-09-23T18:00'}]}).hazardChanged,true);
});

test('GPX parser extracts route distance, ascent and wind context',()=>{
  const g='<gpx><trk><trkseg><trkpt lat="50.0" lon="14.0"><ele>200</ele></trkpt><trkpt lat="50.01" lon="14.0"><ele>230</ele></trkpt><trkpt lat="50.02" lon="14.0"><ele>220</ele></trkpt></trkseg></trk></gpx>';
  const r=parseGpx(g); assert.ok(r.distanceKm>2); assert.equal(r.ascentM,30); assert.ok(r.points.length>=2);
  assert.equal(routeWindContext({...r,mainBearing:0},0),'headwind');
  assert.equal(routeWindContext({...r,mainBearing:0},180),'tailwind');
});

test('history only personalizes after enough similar feedback',()=>{
  assert.equal(effortHint([{score:80,effort:1},{score:82,effort:1}],81),null);
  assert.equal(effortHint([{score:80,effort:1},{score:82,effort:1},{score:78,effort:0}],81).tendency,'harder');
});
