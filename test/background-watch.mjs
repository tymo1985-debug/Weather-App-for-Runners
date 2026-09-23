import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeWatchRequest, meaningfulWatchChange, notificationPayload, computeWatchOption
} from '../worker/src/watch-core.js';
import { urlBase64ToUint8Array } from '../js/background-watch.js';

const subscription={
  endpoint:'https://push.example.test/send/abc',
  expirationTime:null,
  keys:{p256dh:'abc123',auth:'xyz456'}
};

test('background watch validates a compact server record',()=>{
  const r=normalizeWatchRequest({
    watchId:'abcdefghijklmnopqrstuv',
    subscription,
    place:{name:'Prague',lat:50.08,lon:14.43,country:'Czechia'},
    profile:{duration:60,heat:'normal',cold:'normal',rain:'drier',air:'normal',pollen:'off'},
    plan:{mode:'duration',distanceKm:10,paceSecPerKm:360,availableFrom:'17:00',availableTo:'22:00'},
    lang:'ru'
  });
  assert.ok(r);
  assert.equal(r.lang,'ru');
  assert.equal(r.place.name,'Prague');
  assert.equal(normalizeWatchRequest({...r,watchId:'short'}),null);
});

test('background notifications require a meaningful change and respect cooldown',()=>{
  const prev={available:true,score:80,startTs:1_000_000,startIso:'2026-09-23T18:00',hazard:false};
  const small={...prev,score:74};
  assert.equal(meaningfulWatchChange(prev,small,{now:10_000_000}),null);
  const large={...prev,score:66};
  assert.equal(meaningfulWatchChange(prev,large,{now:10_000_000}).reason,'score');
  const shifted={...prev,startTs:prev.startTs+60*60000,startIso:'2026-09-23T19:00'};
  assert.equal(meaningfulWatchChange(prev,shifted,{now:10_000_000}).reason,'start');
  assert.equal(meaningfulWatchChange(prev,shifted,{now:10_000_000,lastNotifiedAt:9_900_000}),null);
  const hazard={...prev,hazard:true};
  assert.equal(meaningfulWatchChange(prev,hazard,{now:10_000_000,lastNotifiedAt:9_900_000}).reason,'hazard');
});

test('push payload is localized and contains navigation data',()=>{
  const next={available:true,score:72,startIso:'2026-09-23T19:00'};
  const p=notificationPayload({reason:'start'},next,'ru');
  assert.match(p.body,/19:00/);
  assert.equal(p.type,'weather-watch');
  assert.equal(p.url,'./index.html');
});

test('application server key decoder handles base64url',()=>{
  const bytes=urlBase64ToUint8Array('AQIDBA');
  assert.deepEqual([...bytes],[1,2,3,4]);
});

test('server watch option uses the existing run scorer and availability window',()=>{
  const time=['2026-09-23T16:00','2026-09-23T17:00','2026-09-23T18:00','2026-09-23T19:00','2026-09-23T20:00'];
  const weather={
    utc_offset_seconds:0,
    hourly:{
      time,
      temperature_2m:[12,12,12,12,12],
      apparent_temperature:[12,12,12,12,12],
      relative_humidity_2m:[50,50,50,50,50],
      dew_point_2m:[5,5,5,5,5],
      precipitation:[0,0,0,0,0],
      precipitation_probability:[0,0,0,0,0],
      weather_code:[0,0,0,0,0],
      wind_speed_10m:[5,5,5,5,5],
      wind_direction_10m:[0,0,0,0,0],
      wind_gusts_10m:[8,8,8,8,8],
      uv_index:[0,0,0,0,0],
      is_day:[1,1,1,1,1],
      visibility:[10000,10000,10000,10000,10000]
    }
  };
  const bundle={weather,air:null,place:{name:'X',lat:50,lon:14}};
  const state=computeWatchOption(bundle,{
    profile:{duration:60},
    plan:{mode:'duration',availableFrom:'17:00',availableTo:'20:00'}
  },Date.parse('2026-09-23T16:15:00Z'));
  assert.equal(state.available,true);
  assert.equal(state.startIso,'2026-09-23T17:00');
  assert.ok(Number.isFinite(state.score));
});
