import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const handlers = new Map();
const stores = new Map();
const precacheRequests = [];
const cache = name => {
  if (!stores.has(name)) stores.set(name, new Map());
  const entries = stores.get(name);
  const key = req => typeof req === 'string' ? new URL(req, 'http://localhost:8765/').href : req.url;
  return {
    addAll: async paths => paths.forEach(path => {
      precacheRequests.push(path);
      entries.set(key(path), new Response('new shell'));
    }),
    keys: async () => [...entries.keys()].map(url => new Request(url)),
    match: async req => entries.get(key(req))?.clone(),
    put: async (req, res) => { entries.set(key(req), res.clone()); },
    delete: async req => entries.delete(key(req))
  };
};
const caches = {
  open: async name => cache(name),
  keys: async () => [...stores.keys()],
  delete: async name => stores.delete(name)
};
let now = 1000000;
let network = async () => new Response('live');
class FakeDate extends Date { static now() { return now; } }
const context = {
  self: { addEventListener: (name, fn) => handlers.set(name, fn), skipWaiting: async () => {}, clients: { claim: async () => {} } },
  caches, fetch: req => network(req), Headers, Response, URL, Date: FakeDate,
  Request: class extends Request {
    constructor(input, options) { super(new URL(input, 'http://localhost:8765/'), options); }
  },
  location: { origin: 'http://localhost:8765' }
};
vm.runInNewContext(readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), context);
const lifecycle = async name => {
  let pending;
  handlers.get(name)({ waitUntil: promise => { pending = promise; } });
  await pending;
};
const request = async (url, mode = 'cors') => {
  let pending;
  const req = { url, method: 'GET', mode };
  handlers.get('fetch')({ request: req, respondWith: promise => { pending = promise; } });
  if (!pending) return null;
  return pending;
};
const api = 'https://api.open-meteo.com/v1/forecast';
const shell = 'http://localhost:8765/';

stores.set('rw-v4', new Map([[shell + 'index.html', new Response('old shell')]]));
await lifecycle('install');
assert(precacheRequests.length > 0 && precacheRequests.every(req => req.cache === 'reload'));
assert.equal(await (await request(shell)).text(), 'new shell');
stores.set('unrelated-cache', new Map());
stores.set('rw-v5', new Map());
stores.set('weather-runner-shell-v4', new Map());
await lifecycle('activate');
assert(stores.has('unrelated-cache'));
assert(!stores.has('rw-v4'));
assert(!stores.has('rw-v5'));
assert(!stores.has('weather-runner-shell-v4'));
assert.equal(await (await request(shell)).text(), 'new shell');

network = async () => new Response('good');
assert.equal(await (await request(api)).text(), 'good');
network = async () => { throw Error('offline'); };
assert.equal(await (await request(api)).text(), 'good');
now += 300001;
await assert.rejects(request(api), /offline/);
assert.equal((await cache('weather-runner-api-v6').keys()).length, 0);

network = async () => new Response('error', { status: 503 });
assert.equal((await request(api)).status, 503);
assert.equal((await cache('weather-runner-api-v6').keys()).length, 0);
network = async () => { throw Error('offline'); };
await assert.rejects(request(shell + 'missing.js'), /offline/);
assert.equal(await (await request(shell + 'route', 'navigate')).text(), 'new shell');

network = async () => new Response('fresh');
for (let i = 0; i < 21; i++) await request(`${api}?n=${i}`);
const keys = (await cache('weather-runner-api-v6').keys()).map(key => key.url);
assert.equal(keys.length, 20);
assert(!keys.includes(`${api}?n=0`));
assert(keys.includes(`${api}?n=20`));
console.log('Phase 3 service-worker tests passed');
