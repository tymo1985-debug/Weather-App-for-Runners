# Background Weather Watch backend

This Worker serves the static PWA and the background Web Push API from the same origin.

## Architecture

- Static app: Workers Static Assets
- API: `/api/watch/*`
- State: one SQLite-backed Durable Object
- Schedule: every 15 minutes
- Delivery: Web Push + VAPID
- Existing in-app/local Weather Watch remains the fallback if the backend is unavailable.

The background checker imports the same scoring and run-window modules as the browser app. It does not introduce a second scoring formula.

## Required secrets

Create one stable VAPID keypair and keep it for future deployments. Rotating the keypair requires clients to subscribe again.

Required Worker secrets:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` — a `mailto:` address or an HTTPS URL identifying the application owner.

Generate a keypair locally:

```bash
cd worker
npm install
npx web-push generate-vapid-keys
```

Set secrets with Wrangler, then deploy:

```bash
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT
npm run deploy
```

Alternatively, add the three VAPID values plus `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub Actions secrets and run the manual **Deploy Cloudflare full-stack** workflow.

## Behaviour

The first scheduled check establishes a server baseline and does not notify. Later checks notify for:

- hazard state changes;
- score changes of at least 10 points;
- a start-time shift of at least 60 minutes;
- a complete run window disappearing/reappearing.

Non-urgent notifications have a one-hour cooldown. A newly appearing hazard bypasses the cooldown.

Push subscriptions returning HTTP 404/410 are removed automatically.
