import { DurableObject } from 'cloudflare:workers';
import webpush from 'web-push';
import {
  normalizeWatchRequest, fetchWatchBundle, computeWatchOption,
  meaningfulWatchChange, notificationPayload
} from './watch-core.js';

const json=(value,status=200)=>new Response(JSON.stringify(value),{
  status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}
});

const configured=env=>!!(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY&&env.VAPID_SUBJECT);

function store(env){
  const id=env.WATCH_STORE.idFromName('global');
  return env.WATCH_STORE.get(id);
}

function validId(id){
  return /^[A-Za-z0-9_-]{22,64}$/.test(String(id||''));
}

function sameOriginRequest(request){
  const own=new URL(request.url).origin;
  const origin=request.headers.get('Origin');
  if(origin&&origin!==own) return false;
  const site=request.headers.get('Sec-Fetch-Site');
  if(site&&!['same-origin','none'].includes(site)) return false;
  return true;
}

async function bodyJson(request){
  const text=await request.text();
  if(text.length>64*1024) throw new Error('body-too-large');
  return JSON.parse(text||'null');
}

async function sendPush(env,subscription,payload){
  if(!configured(env)) throw new Error('push-not-configured');
  webpush.setVapidDetails(env.VAPID_SUBJECT,env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY);
  return webpush.sendNotification(subscription,JSON.stringify(payload),{
    TTL:10*60,
    urgency:'normal',
    topic:'run-weather-watch'
  });
}

export class WatchStore extends DurableObject {
  constructor(ctx,env){
    super(ctx,env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS watches (
        id TEXT PRIMARY KEY,
        subscription_json TEXT NOT NULL,
        config_json TEXT NOT NULL,
        lang TEXT NOT NULL,
        state_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_notified_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_watches_updated ON watches(updated_at);
    `);
  }

  async upsert(record){
    const now=Date.now();
    this.ctx.storage.sql.exec(
      `INSERT INTO watches
        (id,subscription_json,config_json,lang,state_json,created_at,updated_at,last_notified_at)
       VALUES (?,?,?,?,NULL,?,?,NULL)
       ON CONFLICT(id) DO UPDATE SET
        subscription_json=excluded.subscription_json,
        config_json=excluded.config_json,
        lang=excluded.lang,
        state_json=NULL,
        updated_at=excluded.updated_at,
        last_notified_at=NULL`,
      record.watchId,
      JSON.stringify(record.subscription),
      JSON.stringify({place:record.place,profile:record.profile,plan:record.plan}),
      record.lang,
      now,now
    );
    return {active:true,watchId:record.watchId,updatedAt:now};
  }

  async remove(id){
    this.ctx.storage.sql.exec('DELETE FROM watches WHERE id=?',id);
    return {active:false,watchId:id};
  }

  async status(id){
    const rows=this.ctx.storage.sql.exec(
      'SELECT id,state_json,updated_at,last_notified_at FROM watches WHERE id=? LIMIT 1',id
    ).toArray();
    const row=rows[0];
    if(!row) return {active:false,watchId:id};
    return {
      active:true,watchId:id,
      state:row.state_json?JSON.parse(row.state_json):null,
      updatedAt:row.updated_at,
      lastNotifiedAt:row.last_notified_at||null
    };
  }

  async checkAll(now=Date.now()){
    if(!configured(this.env)) return {checked:0,notified:0,removed:0,configured:false};
    const rows=this.ctx.storage.sql.exec(
      'SELECT id,subscription_json,config_json,lang,state_json,last_notified_at FROM watches ORDER BY updated_at ASC LIMIT 250'
    ).toArray();
    let checked=0,notified=0,removed=0,failed=0;
    for(const row of rows){
      checked++;
      try{
        const config=JSON.parse(row.config_json);
        const subscription=JSON.parse(row.subscription_json);
        const previous=row.state_json?JSON.parse(row.state_json):null;
        const bundle=await fetchWatchBundle(config);
        const next=computeWatchOption(bundle,config,now);
        const change=meaningfulWatchChange(previous,next,{
          now,lastNotifiedAt:Number(row.last_notified_at)||0
        });
        let lastNotified=Number(row.last_notified_at)||null;
        if(change){
          try{
            await sendPush(this.env,subscription,notificationPayload(change,next,row.lang));
            notified++;
            lastNotified=now;
          }catch(error){
            const status=Number(error?.statusCode||error?.status);
            if(status===404||status===410){
              await this.remove(row.id);
              removed++;
              continue;
            }
            throw error;
          }
        }
        this.ctx.storage.sql.exec(
          'UPDATE watches SET state_json=?,updated_at=?,last_notified_at=? WHERE id=?',
          JSON.stringify(next),now,lastNotified,row.id
        );
      }catch(error){
        failed++;
        console.warn('background watch check failed',row.id,error?.message||error);
      }
    }
    return {checked,notified,removed,failed,configured:true};
  }
}

async function api(request,env){
  const url=new URL(request.url);
  if(!sameOriginRequest(request)) return json({error:'forbidden'},403);

  if(url.pathname==='/api/watch/config'&&request.method==='GET'){
    return json({
      enabled:configured(env),
      vapidPublicKey:configured(env)?env.VAPID_PUBLIC_KEY:null,
      pollMinutes:15
    });
  }

  if(url.pathname==='/api/watch'&&request.method==='POST'){
    if(!configured(env)) return json({error:'background-watch-not-configured'},503);
    let body;
    try{body=await bodyJson(request);}catch{return json({error:'invalid-json'},400);}
    const record=normalizeWatchRequest(body);
    if(!record) return json({error:'invalid-watch'},400);
    return json(await store(env).upsert(record),201);
  }

  const match=url.pathname.match(/^\/api\/watch\/([A-Za-z0-9_-]{22,64})$/);
  if(match&&validId(match[1])){
    if(request.method==='GET') return json(await store(env).status(match[1]));
    if(request.method==='DELETE') return json(await store(env).remove(match[1]));
  }

  return json({error:'not-found'},404);
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname.startsWith('/api/')) return api(request,env);
    return env.ASSETS.fetch(request);
  },
  async scheduled(_controller,env,ctx){
    ctx.waitUntil(store(env).checkAll(Date.now()));
  }
};
