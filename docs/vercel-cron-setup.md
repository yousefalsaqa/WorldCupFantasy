# Activating the live-scoring cron on Vercel

Until WC2026 kickoff (Jun 11, 2026) the live-scoring cron is **disabled**
so we don't burn API-Football quota during pre-launch testing. To turn it
on:

## 1. Add the `crons` block to `vercel.json`

Open `vercel.json` and add a `crons` array. The full file should look
like this:

```json
{
  "buildCommand": "prisma generate && next build",
  "installCommand": "npm install",
  "framework": "nextjs",
  "regions": ["iad1"],
  "crons": [
    { "path": "/api/live/update", "schedule": "*/2 * * * *" }
  ]
}
```

Schedule = every 2 minutes. API-Football refreshes `/fixtures/players` on
~60s. `/api/live/update` no-ops when no `Match` is `isStarted && !isFinished`,
so the wakeup cost is one rate-limit check + zero billed-quota calls.
Safe on the Pro plan (7,500 req/day).

## 2. Set `CRON_SECRET` in Vercel

`/api/live/update` is locked down to two callers:

1. Vercel Cron (sends `Authorization: Bearer ${CRON_SECRET}` on every
   invocation per the Vercel docs).
2. An authenticated admin session (the manual "Update Live Scores"
   button on `/admin`).

In the Vercel dashboard → Project → Settings → Environment Variables,
add `CRON_SECRET` to all environments (Production, Preview, Development).
Use any high-entropy random string (e.g. `openssl rand -hex 32`).

If `CRON_SECRET` is **unset** the route falls back to admin-only access,
so cron will fail with 401 but the manual admin button keeps working.
Better to break cron than to leave the endpoint world-writable.

## 3. Redeploy

`vercel --prod` (or push to `main`). Within 2 minutes you'll start seeing
`/api/live/update` invocations in the Vercel logs.

## 4. Stage advancement is automatic once cron is on

`maybeAdvanceStage()` runs at the end of every `/api/live/update` call.
When all matches in the active stage are `isFinished=true`, it:

- Reverts active Free Hit snapshots (squad + bank + transfer counts).
- Flips current stage to `isComplete=true`, next stage to `isActive=true`.
- Resets `Team.freeTransfers` per the per-stage allocation table
  in `src/lib/wc-constants.ts → TRANSFERS`.
- Resets `Team.transfersUsed = 0` for every team.
- Applies the mercy rule (more eliminated players than free transfers
  → grant transfers = eliminated count).
- Refreshes per-stage chips (TC / BB / FH) when transitioning
  **GR3 → R32** so users get a fresh set for the knockout phase.
  WC1 stays consumed (group-stage wildcard); WC2 unlocks in R32+.
- Logs `STAGE_AUTO_ADVANCED` to `AuditLog`.

The function is idempotent — calling it when nothing has changed is a
cheap no-op. The cron also calls it on the "no live matches" branch so
backfilled FT flips still cascade through completed stages.

## 5. Turning it off again

Either delete the `crons` block from `vercel.json` and redeploy, OR
unset `CRON_SECRET` (the route will start returning 401 to cron
requests). The admin button on `/admin` keeps working in both cases.
