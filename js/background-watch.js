const KEY='rw.backgroundWatch';

const b64url=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const sameKey=(a,b)=>{
  if(!a||!b) return false;
  const aa=new Uint8Array(a),bb=b instanceof Uint8Array?b:new Uint8Array(b);
  return aa.length===bb.length&&aa.every((v,i)=>v===bb[i]);
};

export function urlBase64ToUint8Array(value){
  const padding='='.repeat((4-value.length%4)%4);
  const raw=atob((value+padding).replace(/-/g,'+').replace(/_/g,'/'));
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}

export function loadBackgroundWatch(storage=localStorage){
  try{
    const v=JSON.parse(storage.getItem(KEY)||'null');
    return v&&typeof v==='object'&&v.active?v:null;
  }catch{return null;}
}

export function saveBackgroundWatch(value,storage=localStorage){
  if(!value){storage.removeItem(KEY);return;}
  storage.setItem(KEY,JSON.stringify(value));
}

export function makeWatchId(cryptoObj=crypto){
  const bytes=new Uint8Array(18);
  cryptoObj.getRandomValues(bytes);
  return b64url(bytes);
}

export function backgroundWatchSupported({
  navigatorObj=navigator,NotificationObj=Notification,PushManagerObj=globalThis.PushManager
}={}){
  return !!(navigatorObj?.serviceWorker&&PushManagerObj&&NotificationObj);
}

async function backendConfig(fetchFn){
  const r=await fetchFn('./api/watch/config',{headers:{Accept:'application/json'}});
  if(!r.ok) return {enabled:false};
  return r.json();
}

async function ensureSubscription(vapidPublicKey,{navigatorObj,PushManagerObj}){
  const reg=await navigatorObj.serviceWorker.ready;
  const key=urlBase64ToUint8Array(vapidPublicKey);
  let sub=await reg.pushManager.getSubscription();
  const currentKey=sub?.options?.applicationServerKey;
  if(sub&&currentKey&&!sameKey(currentKey,key)){
    try{await sub.unsubscribe();}catch{}
    sub=null;
  }
  if(!sub) sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
  return sub;
}

export async function enableBackgroundWatch({
  place,profile,plan,lang='en',
  storage=localStorage,fetchFn=fetch,navigatorObj=navigator,
  NotificationObj=Notification,PushManagerObj=globalThis.PushManager,cryptoObj=crypto
}={}){
  if(!backgroundWatchSupported({navigatorObj,NotificationObj,PushManagerObj}))
    return {ok:false,reason:'unsupported'};
  if(NotificationObj.permission!=='granted') return {ok:false,reason:'permission'};
  let config;
  try{config=await backendConfig(fetchFn);}catch{return {ok:false,reason:'backend'};}
  if(!config?.enabled||!config?.vapidPublicKey) return {ok:false,reason:'backend'};
  try{
    const subscription=await ensureSubscription(config.vapidPublicKey,{navigatorObj,PushManagerObj});
    const existing=loadBackgroundWatch(storage);
    const watchId=existing?.watchId||makeWatchId(cryptoObj);
    const r=await fetchFn('./api/watch',{
      method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({watchId,subscription:subscription.toJSON(),place,profile,plan,lang})
    });
    if(!r.ok) return {ok:false,reason:'backend'};
    const result=await r.json();
    const state={active:true,watchId,syncedAt:Date.now(),serverState:result?.state||null};
    saveBackgroundWatch(state,storage);
    return {ok:true,state};
  }catch{return {ok:false,reason:'backend'};}
}

export async function disableBackgroundWatch({
  storage=localStorage,fetchFn=fetch,navigatorObj=navigator
}={}){
  const state=loadBackgroundWatch(storage);
  if(state?.watchId){
    try{await fetchFn(`./api/watch/${encodeURIComponent(state.watchId)}`,{method:'DELETE'});}catch{}
  }
  try{
    const reg=await navigatorObj?.serviceWorker?.ready;
    const sub=await reg?.pushManager?.getSubscription();
    if(sub) await sub.unsubscribe();
  }catch{}
  saveBackgroundWatch(null,storage);
}

export async function refreshBackgroundWatch(options={}){
  const state=loadBackgroundWatch(options.storage||localStorage);
  if(!state?.active) return {ok:false,reason:'inactive'};
  return enableBackgroundWatch(options);
}
