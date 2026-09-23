import { routeBearing, routeDistance, sampleRoutePoints } from './route-plan.js';

const FORECAST='https://api.open-meteo.com/v1/forecast';
const CACHE_KEY='rw.routeForecast.v1';
export const ROUTE_CACHE_TTL_MS=20*60e3;
export const ROUTE_CACHE_STALE_MS=6*60*60e3;
export const ROUTE_MAX_SAMPLES=8;

const rad=d=>d*Math.PI/180;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=v=>Number.isFinite(Number(v));

function storageGet(storage,key){
  try{return storage?.getItem?.(key)||null;}catch{return null;}
}
function storageSet(storage,key,value){
  try{storage?.setItem?.(key,value);}catch{}
}

export function routeForecastSamples(route,maxSamples=ROUTE_MAX_SAMPLES){
  const points=(route?.points||[]).filter(p=>finite(p?.lat)&&finite(p?.lon));
  if(points.length<2||!(Number(route?.distanceKm)>0)) return [];
  const desired=Math.max(3,Math.min(maxSamples,Math.ceil(Number(route.distanceKm)/3)+1));
  const sampled=sampleRoutePoints(points,Math.min(desired,points.length));
  return sampled.map((point,i)=>{
    const progress=sampled.length===1?0:i/(sampled.length-1);
    const neighbour=i<sampled.length-1?sampled[i+1]:sampled[i-1];
    const bearing=i<sampled.length-1?routeBearing(point,neighbour):routeBearing(neighbour,point);
    return {
      lat:+Number(point.lat).toFixed(5),
      lon:+Number(point.lon).toFixed(5),
      ele:finite(point.ele)?Number(point.ele):null,
      progress,
      distanceKm:Number(route.distanceKm)*progress,
      bearing:Number.isFinite(bearing)?bearing:Number(route.mainBearing)||0
    };
  });
}

export function routeEtaSamples(route,startMs,durationMin,maxSamples=ROUTE_MAX_SAMPLES){
  const start=Number(startMs),duration=Number(durationMin);
  if(!Number.isFinite(start)||!(duration>0)) return [];
  return routeForecastSamples(route,maxSamples).map(s=>({
    ...s,
    etaMs:start+s.progress*duration*60000
  }));
}

// Open-Meteo wind direction is the direction the wind comes FROM.
// Positive headwind therefore means wind arriving from the direction of travel.
export function windComponents(speedKmh,windDirFrom,bearing){
  const speed=Number(speedKmh);
  if(!Number.isFinite(speed)||!Number.isFinite(windDirFrom)||!Number.isFinite(bearing)) return null;
  const diff=rad((((Number(windDirFrom)-Number(bearing))+540)%360)-180);
  const along=speed*Math.cos(diff);
  const cross=Math.abs(speed*Math.sin(diff));
  return {
    headwindKmh:Math.max(0,along),
    tailwindKmh:Math.max(0,-along),
    crosswindKmh:cross,
    kind:along>speed*.35?'headwind':along<-speed*.35?'tailwind':'crosswind'
  };
}

export function routeForecastKey(route,maxSamples=ROUTE_MAX_SAMPLES){
  const pts=routeForecastSamples(route,maxSamples);
  return pts.map(p=>`${p.lat.toFixed(3)},${p.lon.toFixed(3)}`).join('|');
}

function cachedForecast(route,storage,now,maxAge){
  const raw=storageGet(storage,CACHE_KEY);
  if(!raw) return null;
  try{
    const item=JSON.parse(raw),key=routeForecastKey(route);
    if(item?.key!==key||!Number.isFinite(item?.at)||now-item.at<0||now-item.at>maxAge) return null;
    if(!Array.isArray(item.samples)||!Array.isArray(item.points)) return null;
    return {...item,cached:true,stale:now-item.at>ROUTE_CACHE_TTL_MS};
  }catch{return null;}
}

export async function fetchRouteForecast(route,{
  fetchFn=globalThis.fetch,
  storage=globalThis.localStorage,
  now=Date.now(),
  signal
}={}){
  const fresh=cachedForecast(route,storage,now,ROUTE_CACHE_TTL_MS);
  if(fresh) return fresh;
  const samples=routeForecastSamples(route);
  if(samples.length<2) throw new Error('route');
  const lat=samples.map(p=>p.lat).join(',');
  const lon=samples.map(p=>p.lon).join(',');
  const hourly=[
    'temperature_2m','apparent_temperature','precipitation','precipitation_probability',
    'weather_code','wind_speed_10m','wind_direction_10m','wind_gusts_10m','uv_index'
  ].join(',');
  const url=`${FORECAST}?latitude=${lat}&longitude=${lon}&hourly=${hourly}`+
    '&forecast_days=3&timezone=UTC&timeformat=unixtime&wind_speed_unit=kmh';
  try{
    const response=await fetchFn(url,{signal});
    if(!response?.ok) throw new Error('route-forecast');
    const json=await response.json();
    const points=(Array.isArray(json)?json:[json]).map(x=>x?.hourly?.time?.length?x:null);
    if(!points.some(Boolean)) throw new Error('route-forecast');
    const item={key:routeForecastKey(route),at:now,samples,points,cached:false,stale:false};
    storageSet(storage,CACHE_KEY,JSON.stringify(item));
    return item;
  }catch(error){
    const stale=cachedForecast(route,storage,now,ROUTE_CACHE_STALE_MS);
    if(stale) return {...stale,cached:true,stale:true};
    throw error;
  }
}

function valueAt(hourly,key,targetSec){
  const times=hourly?.time;
  const vals=hourly?.[key];
  if(!Array.isArray(times)||!Array.isArray(vals)||!times.length) return null;
  if(targetSec<Number(times[0])||targetSec>Number(times.at(-1))) return null;
  let hi=times.findIndex(t=>Number(t)>=targetSec);
  if(hi<0) hi=times.length-1;
  const lo=Math.max(0,hi-1);
  const a=Number(vals[lo]),b=Number(vals[hi]);
  if(!Number.isFinite(a)&&!Number.isFinite(b)) return null;
  if(lo===hi||!Number.isFinite(a)) return Number.isFinite(b)?b:null;
  if(!Number.isFinite(b)) return a;
  const span=Math.max(1,Number(times[hi])-Number(times[lo]));
  const t=clamp((targetSec-Number(times[lo]))/span,0,1);
  return a+(b-a)*t;
}

function nearestValue(hourly,key,targetSec){
  const times=hourly?.time,vals=hourly?.[key];
  if(!Array.isArray(times)||!Array.isArray(vals)||!times.length) return null;
  let best=-1,bestD=Infinity;
  for(let i=0;i<times.length;i++){
    const d=Math.abs(Number(times[i])-targetSec);
    if(d<bestD){best=i;bestD=d;}
  }
  const v=Number(vals[best]);
  return Number.isFinite(v)?v:null;
}

export function routeWeatherAt(forecast,route,startMs,durationMin){
  const eta=routeEtaSamples(route,startMs,durationMin,forecast?.samples?.length||ROUTE_MAX_SAMPLES);
  if(!eta.length||!Array.isArray(forecast?.points)) return null;
  const points=eta.map((sample,i)=>{
    const hourly=forecast.points[i]?.hourly;
    if(!hourly) return {...sample,weather:null};
    const targetSec=sample.etaMs/1000;
    const wind=valueAt(hourly,'wind_speed_10m',targetSec);
    const windDir=valueAt(hourly,'wind_direction_10m',targetSec);
    const components=windComponents(wind,windDir,sample.bearing);
    return {...sample,weather:{
      temp:valueAt(hourly,'temperature_2m',targetSec),
      feels:valueAt(hourly,'apparent_temperature',targetSec),
      mm:valueAt(hourly,'precipitation',targetSec),
      pop:valueAt(hourly,'precipitation_probability',targetSec),
      code:nearestValue(hourly,'weather_code',targetSec),
      wind,windDir,
      gust:valueAt(hourly,'wind_gusts_10m',targetSec),
      uv:valueAt(hourly,'uv_index',targetSec),
      ...components
    }};
  });
  return aggregateRouteWeather(points,{cached:!!forecast.cached,stale:!!forecast.stale});
}

export function aggregateRouteWeather(points,meta={}){
  const available=(points||[]).filter(p=>p?.weather&&[
    p.weather.temp,p.weather.feels,p.weather.mm,p.weather.pop,p.weather.wind
  ].some(Number.isFinite));
  if(!available.length) return null;
  const vals=key=>available.map(p=>p.weather[key]).filter(Number.isFinite);
  const min=key=>{const v=vals(key);return v.length?Math.min(...v):null;};
  const max=key=>{const v=vals(key);return v.length?Math.max(...v):null;};
  const alerts=[];
  if(available.some(p=>[95,96,99].includes(Math.round(p.weather.code)))) alerts.push('thunder');
  if(available.some(p=>(p.weather.mm??0)>=3||((p.weather.pop??0)>=70&&(p.weather.mm??0)>=.5))) alerts.push('rain');
  if(available.some(p=>(p.weather.headwindKmh??0)>=20||(p.weather.gust??0)>=35)) alerts.push('wind');
  if(available.some(p=>(p.weather.feels??-99)>=30)) alerts.push('heat');
  if(available.some(p=>(p.weather.feels??99)<=2)) alerts.push('cold');
  const severity=p=>{
    const w=p.weather;
    if([95,96,99].includes(Math.round(w.code))) return 100;
    return Math.max(
      (w.mm??0)*10,
      (w.pop??0)*.45,
      (w.headwindKmh??0)*2,
      (w.gust??0)*1.15,
      Math.max(0,(w.feels??20)-26)*7,
      Math.max(0,4-(w.feels??20))*5
    );
  };
  let worst=available[0];
  for(const p of available.slice(1)) if(severity(p)>severity(worst)) worst=p;
  return {
    points,
    availableCount:available.length,
    totalCount:(points||[]).length,
    coverage:(points||[]).length?available.length/(points||[]).length:0,
    cached:!!meta.cached,
    stale:!!meta.stale,
    alerts,
    worstIndex:(points||[]).indexOf(worst),
    tempMin:min('temp'),tempMax:max('temp'),
    feelsMin:min('feels'),feelsMax:max('feels'),
    maxPop:max('pop'),maxMm:max('mm'),maxWind:max('wind'),maxGust:max('gust'),
    maxHeadwind:max('headwindKmh'),maxCrosswind:max('crosswindKmh')
  };
}
