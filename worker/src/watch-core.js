import {
  DEFAULT_PROFILE, buildHours, runStartOptions, bestStartOption
} from '../../js/engine.js';
import {
  normalizeRunPlan, plannedDuration, timeToMinutes, hasAvailability
} from '../../js/run-plan.js';

const FORECAST='https://api.open-meteo.com/v1/forecast';
const AIR='https://air-quality-api.open-meteo.com/v1/air-quality';

const finite=v=>Number.isFinite(Number(v));
const pick=(v,allowed,fallback)=>allowed.includes(v)?v:fallback;

export function normalizeProfile(value={}){
  const p={...DEFAULT_PROFILE,...(value&&typeof value==='object'?value:{})};
  return {
    heat:pick(p.heat,['low','normal','high'],'normal'),
    cold:pick(p.cold,['low','normal','high'],'normal'),
    rain:pick(p.rain,['drier','ok'],'drier'),
    air:pick(p.air,['normal','high'],'normal'),
    pollen:pick(p.pollen,['off','on'],'off'),
    duration:Math.max(15,Math.min(360,Math.round(Number(p.duration)||60)))
  };
}

export function normalizePlace(value){
  const p=value&&typeof value==='object'?value:{};
  const lat=Number(p.lat),lon=Number(p.lon);
  if(!finite(lat)||!finite(lon)||lat<-90||lat>90||lon<-180||lon>180) return null;
  return {
    name:String(p.name||'Run location').slice(0,120),
    country:String(p.country||'').slice(0,160),
    lat,lon
  };
}

export function normalizeSubscription(value){
  const s=value&&typeof value==='object'?value:{};
  let endpoint;
  try{
    endpoint=new URL(String(s.endpoint||''));
    if(endpoint.protocol!=='https:') return null;
  }catch{return null;}
  const keys=s.keys&&typeof s.keys==='object'?s.keys:{};
  const p256dh=String(keys.p256dh||''),auth=String(keys.auth||'');
  if(!p256dh||!auth||p256dh.length>512||auth.length>256) return null;
  return {
    endpoint:endpoint.href,
    expirationTime:Number.isFinite(Number(s.expirationTime))?Number(s.expirationTime):null,
    keys:{p256dh,auth}
  };
}

export function normalizeWatchRequest(body){
  if(!body||typeof body!=='object') return null;
  const id=String(body.watchId||'');
  if(!/^[A-Za-z0-9_-]{22,64}$/.test(id)) return null;
  const place=normalizePlace(body.place);
  const subscription=normalizeSubscription(body.subscription);
  if(!place||!subscription) return null;
  return {
    watchId:id,
    subscription,
    place,
    profile:normalizeProfile(body.profile),
    plan:normalizeRunPlan(body.plan),
    lang:body.lang==='ru'?'ru':'en'
  };
}

export async function fetchWatchBundle(config,{fetchFn=globalThis.fetch,signal}={}){
  const place=config.place;
  const q=`latitude=${place.lat}&longitude=${place.lon}&timezone=auto`;
  const fUrl=`${FORECAST}?${q}&forecast_days=3&hourly=temperature_2m,apparent_temperature,`+
    'relative_humidity_2m,dew_point_2m,precipitation,precipitation_probability,weather_code,'+
    'wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,is_day,visibility';
  const aUrl=`${AIR}?${q}&forecast_days=3&hourly=pm10,pm2_5,nitrogen_dioxide,ozone,european_aqi,`+
    'alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,ragweed_pollen,olive_pollen';
  const [wr,ar]=await Promise.all([
    fetchFn(fUrl,{signal}),
    fetchFn(aUrl,{signal}).catch(()=>null)
  ]);
  if(!wr?.ok) throw new Error('forecast');
  const weather=await wr.json();
  const air=ar?.ok?await ar.json():null;
  return {weather,air,place,at:Date.now()};
}

export function computeWatchOption(bundle,config,now=Date.now()){
  const profile=normalizeProfile(config.profile);
  const plan=normalizeRunPlan(config.plan);
  const duration=plannedDuration(profile.duration,plan);
  const hours=buildHours(bundle,profile);
  const fromMin=timeToMinutes(plan.availableFrom),toMin=timeToMinutes(plan.availableTo);
  const options=runStartOptions(hours,duration,{
    now,
    horizonHours:4,
    fromMin:hasAvailability(plan)?fromMin:null,
    toMin:hasAvailability(plan)?toMin:null
  });
  const best=bestStartOption(options);
  if(!best?.slice?.length){
    return {available:false,duration,checkedAt:now,score:null,startIso:null,startTs:null,endTs:null,hazard:false};
  }
  const start=best.slice[0];
  return {
    available:true,
    duration,
    checkedAt:now,
    score:best.score,
    startIso:start.iso,
    startTs:start.ts,
    endTs:start.ts+duration*60000,
    hazard:!!best.hazard
  };
}

export function meaningfulWatchChange(previous,next,{
  now=Date.now(),lastNotifiedAt=0,cooldownMs=60*60e3
}={}){
  if(!previous||!next) return null;
  let reason=null,urgent=false,scoreDelta=null,startMovedMin=null;
  if(previous.available&&!next.available){
    reason='unavailable';
  }else if(!previous.available&&next.available){
    reason='available';
  }else if(previous.available&&next.available){
    if(previous.hazard!==next.hazard){
      reason=next.hazard?'hazard':'hazardCleared';
      urgent=!!next.hazard;
    }
    scoreDelta=Number(next.score)-Number(previous.score);
    if(!reason&&Number.isFinite(scoreDelta)&&Math.abs(scoreDelta)>=10) reason='score';
    if(Number.isFinite(previous.startTs)&&Number.isFinite(next.startTs))
      startMovedMin=Math.round((next.startTs-previous.startTs)/60000);
    if(!reason&&Number.isFinite(startMovedMin)&&Math.abs(startMovedMin)>=60) reason='start';
  }
  if(!reason) return null;
  if(!urgent&&Number.isFinite(lastNotifiedAt)&&lastNotifiedAt>0&&now-lastNotifiedAt<cooldownMs) return null;
  return {reason,urgent,scoreDelta,startMovedMin};
}

const timeOf=state=>state?.startIso?.slice?.(11,16)||'—';

export function notificationPayload(change,next,lang='en'){
  const ru=lang==='ru';
  const title=ru?'Окно пробежки изменилось':'Your run window changed';
  let body;
  switch(change?.reason){
    case 'hazard':
      body=ru?'В выбранном окне появился погодный риск. Откройте приложение и проверьте детали.'
        :'A weather risk appeared in the selected run window. Open the app to check the details.';
      break;
    case 'hazardCleared':
      body=ru?`Погодное ограничение ушло. Текущий вариант: ${timeOf(next)} · ${next.score}/100.`
        :`The weather limitation cleared. Current option: ${timeOf(next)} · ${next.score}/100.`;
      break;
    case 'score':
      body=ru?`Оценка изменилась на ${change.scoreDelta>0?'+':''}${change.scoreDelta} · сейчас ${next.score}/100.`
        :`The score changed by ${change.scoreDelta>0?'+':''}${change.scoreDelta} · now ${next.score}/100.`;
      break;
    case 'start':
      body=ru?`Лучшее время старта теперь около ${timeOf(next)}.`
        :`The better start time is now around ${timeOf(next)}.`;
      break;
    case 'unavailable':
      body=ru?'Полная пробежка больше не помещается в выбранное окно.'
        :'A complete run no longer fits the selected availability window.';
      break;
    case 'available':
      body=ru?`Снова найдено подходящее окно: ${timeOf(next)} · ${next.score}/100.`
        :`A complete run window is available again: ${timeOf(next)} · ${next.score}/100.`;
      break;
    default:
      body=ru?'Проверьте обновлённые условия для пробежки.':'Check the updated conditions for your run.';
  }
  return {
    type:'weather-watch',
    title,
    body,
    url:'./',
    data:{reason:change?.reason||'change',score:next?.score??null,startIso:next?.startIso??null}
  };
}
