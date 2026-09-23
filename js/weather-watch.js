const KEY='rw.weatherWatch';

export function loadWatch(storage=localStorage){
  try{ const v=JSON.parse(storage.getItem(KEY)||'null'); return v&&typeof v==='object'?v:null; }catch{return null;}
}
export function saveWatch(value,storage=localStorage){
  if(!value){ storage.removeItem(KEY); return; }
  storage.setItem(KEY,JSON.stringify(value));
}
export function makeWatch(option, place, duration){
  if(!option?.slice?.length) return null;
  return {
    enabled:true, placeKey:`${place.lat.toFixed(2)},${place.lon.toFixed(2)}`,
    startIso:option.slice[0].iso, score:option.score, duration,
    hazard:!!option.hazard, createdAt:Date.now()
  };
}
export function watchChange(watch, option){
  if(!watch||!option) return null;
  const scoreDelta=option.score-watch.score;
  const startChanged=option.slice?.[0]?.iso&&option.slice[0].iso!==watch.startIso;
  const hazardChanged=!!option.hazard!==!!watch.hazard;
  if(hazardChanged||Math.abs(scoreDelta)>=10||startChanged)
    return {scoreDelta,startChanged,hazardChanged};
  return null;
}
