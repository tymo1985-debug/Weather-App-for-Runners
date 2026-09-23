const KEY='rw.routePlan';
const R=6371;

const rad=d=>d*Math.PI/180;

export function routeDistance(a,b){
  if(!a||!b) return 0;
  const dLat=rad(b.lat-a.lat), dLon=rad(b.lon-a.lon);
  const x=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(Math.max(0,Math.min(1,x))));
}

export function routeBearing(a,b){
  if(!a||!b) return null;
  const y=Math.sin(rad(b.lon-a.lon))*Math.cos(rad(b.lat));
  const x=Math.cos(rad(a.lat))*Math.sin(rad(b.lat))-Math.sin(rad(a.lat))*Math.cos(rad(b.lat))*Math.cos(rad(b.lon-a.lon));
  const value=(Math.atan2(y,x)*180/Math.PI+360)%360;
  return Number.isFinite(value)?value:null;
}

function interpolatePoint(a,b,t){
  const ele=Number.isFinite(a.ele)&&Number.isFinite(b.ele)
    ? a.ele+(b.ele-a.ele)*t
    : Number.isFinite(a.ele)?a.ele:Number.isFinite(b.ele)?b.ele:null;
  return {lat:a.lat+(b.lat-a.lat)*t,lon:a.lon+(b.lon-a.lon)*t,ele};
}

export function sampleRoutePoints(points,maxPoints=120){
  const src=(points||[]).filter(p=>Number.isFinite(p?.lat)&&Number.isFinite(p?.lon));
  if(src.length<=2||src.length<=maxPoints) return src.map(p=>({...p}));
  const cumulative=[0];
  for(let i=1;i<src.length;i++) cumulative[i]=cumulative[i-1]+routeDistance(src[i-1],src[i]);
  const total=cumulative.at(-1);
  if(!(total>0)) return [src[0],src.at(-1)].map(p=>({...p}));
  const count=Math.max(2,Math.min(maxPoints,src.length));
  const out=[];
  let seg=1;
  for(let n=0;n<count;n++){
    const target=total*n/(count-1);
    while(seg<cumulative.length-1&&cumulative[seg]<target) seg++;
    const a=src[seg-1],b=src[seg];
    const start=cumulative[seg-1],span=Math.max(1e-9,cumulative[seg]-start);
    out.push(interpolatePoint(a,b,Math.max(0,Math.min(1,(target-start)/span))));
  }
  return out;
}

function readAttr(attrs,name){
  const m=String(attrs||'').match(new RegExp('\\b'+name+'\\s*=\\s*["\\\']([^"\\\']+)["\\\']','i'));
  return m?.[1];
}

export function parseGpx(text){
  const pts=[];
  const re=/<(trkpt|rtept)\b([^>]*?)(?:\/\s*>|>([\s\S]*?)<\/\1\s*>)/gi;
  let m;
  while((m=re.exec(String(text||'')))){
    const lat=Number(readAttr(m[2],'lat')),lon=Number(readAttr(m[2],'lon'));
    const em=String(m[3]||'').match(/<ele\b[^>]*>([^<]+)<\/ele>/i);
    const ele=em?Number(em[1]):null;
    if(Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=-90&&lat<=90&&lon>=-180&&lon<=180)
      pts.push({lat,lon,ele:Number.isFinite(ele)?ele:null});
  }
  if(pts.length<2) return null;
  let distanceKm=0,ascentM=0,bx=0,by=0;
  for(let i=1;i<pts.length;i++){
    const len=routeDistance(pts[i-1],pts[i]);
    distanceKm+=len;
    if(pts[i-1].ele!=null&&pts[i].ele!=null&&pts[i].ele>pts[i-1].ele) ascentM+=pts[i].ele-pts[i-1].ele;
    const b=routeBearing(pts[i-1],pts[i]);
    if(Number.isFinite(b)&&len>0){bx+=Math.cos(rad(b))*len;by+=Math.sin(rad(b))*len;}
  }
  const mainBearing=(Math.atan2(by,bx)*180/Math.PI+360)%360;
  return {
    name:'GPX route',
    distanceKm:+distanceKm.toFixed(2),
    ascentM:Math.round(ascentM),
    mainBearing:Number.isFinite(mainBearing)?Math.round(mainBearing):0,
    points:sampleRoutePoints(pts,120)
  };
}

export function loadRoute(storage=localStorage){
  try{return JSON.parse(storage.getItem(KEY)||'null');}catch{return null;}
}
export function saveRoute(route,storage=localStorage){
  if(!route){storage.removeItem(KEY);return;} storage.setItem(KEY,JSON.stringify(route));
}

const angleDiff=(a,b)=>Math.abs((((a-b)+540)%360)-180);
export function routeWindContext(route,windDir){
  if(!route||!Number.isFinite(windDir)) return null;
  const d=angleDiff(route.mainBearing,windDir);
  return d<45?'headwind':d>135?'tailwind':'crosswind';
}
