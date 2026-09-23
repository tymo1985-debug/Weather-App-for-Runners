const KEY='rw.routePlan';
const R=6371;

const rad=d=>d*Math.PI/180;
function hav(a,b){
  const dLat=rad(b.lat-a.lat), dLon=rad(b.lon-a.lon);
  const x=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
}
function bearing(a,b){
  const y=Math.sin(rad(b.lon-a.lon))*Math.cos(rad(b.lat));
  const x=Math.cos(rad(a.lat))*Math.sin(rad(b.lat))-Math.sin(rad(a.lat))*Math.cos(rad(b.lat))*Math.cos(rad(b.lon-a.lon));
  return (Math.atan2(y,x)*180/Math.PI+360)%360;
}
export function parseGpx(text){
  const pts=[];
  const re=/<(?:trkpt|rtept)\b[^>]*\blat=["']([^"']+)["'][^>]*\blon=["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:trkpt|rtept)>/gi;
  let m;
  while((m=re.exec(String(text||'')))){
    const lat=Number(m[1]), lon=Number(m[2]);
    const em=m[3].match(/<ele>([^<]+)<\/ele>/i);
    const ele=em?Number(em[1]):null;
    if(Number.isFinite(lat)&&Number.isFinite(lon)) pts.push({lat,lon,ele:Number.isFinite(ele)?ele:null});
  }
  if(pts.length<2) return null;
  let distanceKm=0, ascentM=0, bx=0, by=0;
  for(let i=1;i<pts.length;i++){
    distanceKm+=hav(pts[i-1],pts[i]);
    if(pts[i-1].ele!=null&&pts[i].ele!=null&&pts[i].ele>pts[i-1].ele) ascentM+=pts[i].ele-pts[i-1].ele;
    const b=bearing(pts[i-1],pts[i]), len=Math.max(.001,hav(pts[i-1],pts[i]));
    bx+=Math.cos(rad(b))*len; by+=Math.sin(rad(b))*len;
  }
  const mainBearing=(Math.atan2(by,bx)*180/Math.PI+360)%360;
  const step=Math.max(1,Math.floor(pts.length/40));
  const samples=pts.filter((_,i)=>i%step===0||i===pts.length-1);
  return {name:'GPX route',distanceKm:+distanceKm.toFixed(2),ascentM:Math.round(ascentM),mainBearing:Math.round(mainBearing),points:samples};
}
export function loadRoute(storage=localStorage){
  try{return JSON.parse(storage.getItem(KEY)||'null');}catch{return null;}
}
export function saveRoute(route,storage=localStorage){
  if(!route){storage.removeItem(KEY);return;} storage.setItem(KEY,JSON.stringify(route));
}
const angleDiff=(a,b)=>Math.abs((((a-b)+540)%360)-180);
export function routeWindContext(route, windDir){
  if(!route||!Number.isFinite(windDir)) return null;
  const d=angleDiff(route.mainBearing,windDir);
  return d<45?'headwind':d>135?'tailwind':'crosswind';
}
