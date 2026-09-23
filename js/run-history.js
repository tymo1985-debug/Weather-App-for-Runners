const KEY='rw.runHistory';
export function loadHistory(storage=localStorage){
  try{const v=JSON.parse(storage.getItem(KEY)||'[]');return Array.isArray(v)?v:[];}catch{return [];}
}
export function addRun(entry,storage=localStorage){
  const list=loadHistory(storage);
  list.unshift({...entry,id:entry.id||Date.now(),savedAt:entry.savedAt||Date.now()});
  const trimmed=list.slice(0,50); storage.setItem(KEY,JSON.stringify(trimmed)); return trimmed;
}
export function effortHint(history, score){
  const similar=(history||[]).filter(x=>Number.isFinite(x.score)&&Math.abs(x.score-score)<=8&&[-1,0,1].includes(x.effort));
  if(similar.length<3) return null;
  const avg=similar.reduce((a,x)=>a+x.effort,0)/similar.length;
  return {count:similar.length,tendency:avg>.34?'harder':avg<-.34?'easier':'expected'};
}
