import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGpx } from '../js/route-plan.js';
import {
  routeForecastSamples, routeEtaSamples, windComponents, aggregateRouteWeather,
  fetchRouteForecast, routeWeatherAt
} from '../js/route-weather.js';

const route = {
  distanceKm: 10,
  mainBearing: 90,
  points: [
    { lat: 50, lon: 14, ele: 200 },
    { lat: 50, lon: 14.05, ele: 210 },
    { lat: 50, lon: 14.10, ele: 205 },
    { lat: 50, lon: 14.15, ele: 215 }
  ]
};

test('GPX parser accepts reversed attributes and self-closing track points', () => {
  const g='<gpx><trk><trkseg>'+
    '<trkpt lon="14.0" lat="50.0"><ele>200</ele></trkpt>'+
    '<trkpt lon="14.01" lat="50.01"/>'+
    '<trkpt lat="50.02" lon="14.02"><ele>230</ele></trkpt>'+
    '</trkseg></trk></gpx>';
  const r=parseGpx(g);
  assert.ok(r);
  assert.ok(r.distanceKm>2);
  assert.equal(r.points.length,3);
  assert.equal(r.ascentM,30);
});

test('route samples are bounded and ETA follows route progress', () => {
  const samples=routeForecastSamples(route);
  assert.ok(samples.length>=3&&samples.length<=8);
  assert.equal(samples[0].progress,0);
  assert.equal(samples.at(-1).progress,1);
  const eta=routeEtaSamples(route,1_000_000,60);
  assert.equal(eta[0].etaMs,1_000_000);
  assert.equal(eta.at(-1).etaMs,1_000_000+60*60_000);
});

test('wind components distinguish headwind, tailwind and crosswind', () => {
  const head=windComponents(20,90,90);
  const tail=windComponents(20,270,90);
  const cross=windComponents(20,0,90);
  assert.ok(head.headwindKmh>19&&head.tailwindKmh===0);
  assert.ok(tail.tailwindKmh>19&&tail.headwindKmh===0);
  assert.ok(cross.crosswindKmh>19);
});

test('route aggregation keeps partial coverage separate from the run score', () => {
  const summary=aggregateRouteWeather([
    { weather:{ temp:12,feels:11,mm:0,pop:10,wind:8,gust:12,headwindKmh:4,crosswindKmh:3,code:0 } },
    { weather:null },
    { weather:{ temp:10,feels:8,mm:1,pop:75,wind:24,gust:38,headwindKmh:22,crosswindKmh:5,code:61 } }
  ]);
  assert.equal(summary.availableCount,2);
  assert.equal(summary.totalCount,3);
  assert.ok(summary.alerts.includes('rain'));
  assert.ok(summary.alerts.includes('wind'));
  assert.equal(summary.maxHeadwind,22);
  assert.equal('score' in summary,false);
});

test('route forecast batches points and reuses fresh cache', async () => {
  const store=new Map();
  const storage={
    getItem:k=>store.get(k)??null,
    setItem:(k,v)=>store.set(k,v)
  };
  let calls=0;
  const fetchFn=async url=>{
    calls++;
    assert.match(url,/latitude=/);
    assert.match(url,/longitude=/);
    const count=(new URL(url)).searchParams.get('latitude').split(',').length;
    const point=()=>({hourly:{
      time:[1_800_000_000,1_800_003_600],
      temperature_2m:[12,13],apparent_temperature:[11,12],
      precipitation:[0,0],precipitation_probability:[5,10],weather_code:[0,0],
      wind_speed_10m:[10,12],wind_direction_10m:[90,90],wind_gusts_10m:[15,18],uv_index:[1,1]
    }});
    return {ok:true,json:async()=>Array.from({length:count},point)};
  };
  const a=await fetchRouteForecast(route,{fetchFn,storage,now:1_800_000_000_000});
  const b=await fetchRouteForecast(route,{fetchFn,storage,now:1_800_000_060_000});
  assert.equal(calls,1);
  assert.equal(a.cached,false);
  assert.equal(b.cached,true);
});

test('route weather interpolates conditions at each ETA', () => {
  const samples=routeForecastSamples(route);
  const start=1_800_000_000_000;
  const baseSec=start/1000;
  const payload=()=>({hourly:{
    time:[baseSec,baseSec+3600],
    temperature_2m:[10,14],apparent_temperature:[9,13],
    precipitation:[0,1],precipitation_probability:[10,70],weather_code:[0,61],
    wind_speed_10m:[10,20],wind_direction_10m:[90,90],wind_gusts_10m:[12,24],uv_index:[1,2]
  }});
  const summary=routeWeatherAt({samples,points:samples.map(payload)},route,start,60);
  assert.ok(summary);
  assert.equal(summary.totalCount,samples.length);
  assert.ok(summary.tempMin>=10&&summary.tempMax<=14);
  assert.ok(summary.maxHeadwind>=10);
});
