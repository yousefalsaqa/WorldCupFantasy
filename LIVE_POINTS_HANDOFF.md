# Live Points Feature — Handoff

Last updated: 2026-05-12

This doc captures the state of the **live scoring + testing** work so the
next session can pick up without re-reading the whole transcript.

---

## Big picture

We're making the "live fantasy points" feature **testable end-to-end** before
the 2026 World Cup kicks off (Jun 11, 2026). That means:

1. A correct live-scoring engine driven by API-Football.
2. Backend wiring that polls fixtures, updates `PlayerPerformance`, and
   banks finalized points into `SquadPlayer.points` + `Team.totalPoints`.
3. A frontend that shows live points in real time on `/squad` — both the
   green pill on player cards AND a clickable per-match points breakdown
   inside the player detail modal.
4. Admin tooling to test all of the above without burning API-Football
   quota or waiting for real matches.

---

## Where we are right now

### Completed (✅ shipped, tested, in main)

- **Live scoring engine** (`src/lib/live-scoring.ts`) — FPL-style scoring,
  including the "unified on-pitch model":
  - Clean-sheet bonuses and conceded-goal penalties are gated on whether
    the player was actually on the pitch when the opponent scored.
  - Red card explicitly voids clean-sheet bonus even if their window was
    clean.
  - 60+ minutes still required for clean-sheet eligibility.
  - Defensive Contributions (DC): +2 if `tackles + interceptions + blocks +
    duels.won` ≥ 10 (GK/DEF) or ≥ 12 (MID/FWD). Not gated by minutes.
  - Knockout-stage goals get +1 bonus.
- **Scoring constants** in `src/lib/wc-constants.ts` (`SCORING` object).
- **API-Football client** (`src/lib/api-football.ts`) with daily +
  per-minute rate-limit tracking via `getRateLimits()`.
- **Cron-driven live updates** (`src/app/api/live/update/route.ts`):
  - Polls API-Football for live fixtures.
  - Upserts `PlayerPerformance` rows with `isLive=true` while in progress.
  - On FT: flips `isLive=false`, calls `updateSquadPoints()` to bank into
    `SquadPlayer.points` + `Team.totalPoints`.
  - **Secured**: requires either `Bearer ${CRON_SECRET}` header OR an
    admin session cookie. Was previously unauthenticated.
- **`updateSquadPoints` helper** extracted to `src/lib/squad-points.ts`
  so the simulator and live cron share one source of truth.
- **Squad page live polling** (`src/app/(dashboard)/squad/page.tsx` +
  `src/app/api/squad/get/route.ts`):
  - `livePoints = SquadPlayer.points + sum(isLive PlayerPerformance.totalPoints)`.
  - Green pill on player cards reflects live total.
  - 60-second poll loop, only active when at least one match is live
    (`anyMatchLive: true`).
  - Captain multipliers intentionally NOT applied to the per-card pill
    (would create visual inconsistency mid-match).
- **Player detail modal — Match History + breakdown**
  (`src/app/(dashboard)/squad/page.tsx` + new endpoint
  `src/app/api/players/[id]/performances/route.ts`):
  - Replaces the old static fixtures table that always showed dashes.
  - Real `PlayerPerformance` rows, sorted newest-first by kickoff.
  - Each row clickable → expands inline with the full points breakdown
    (per scoring category) computed server-side from stored stats.
  - Pulsing green LIVE badge on in-progress matches.
  - **Adjustments section** below the table showing recent
    `MANUAL_OVERRIDE_*` audit entries for that player.
- **`PlayerPerformance.defensiveActions`** field added via
  `prisma db push`. Persisted by the live update route, surfaced in
  the breakdown endpoint, and shown as a `DC` column in the modal's
  Match History table.
- **Emergency Override fix** (`src/app/api/admin/override/route.ts`):
  - "Total Points Adjustment" now works even when the player has no
    finished match in the DB (the original Haaland bug).
  - Always increments `SquadPlayer.points` across all teams that own
    the player.
  - Still attaches a `PlayerPerformance` bonus row when a finished
    match exists, so adjustments stay visible in match history.
- **Admin sandbox** (`/admin/live-test`) — runs the calculator against
  real API-Football fixtures (3 calls per run) without writing to the
  DB. Dual rate-limit gauges, optional polling (default OFF).
- **Admin Match Simulator** (`/admin/match-simulator` +
  `src/app/api/admin/match-simulator/route.ts`):
  - Pick any Match → Seed lineup (prefers admin squad players) → Go
    LIVE → Tick → Finish → Reset.
  - Tick randomly bumps stats every press; Finish runs the canonical
    `updateSquadPoints` flow.
  - **Tests the green pill on /squad AND the modal breakdown without
    any API-Football quota.**
- **Unit tests** — `npm test` runs **103 passing scenarios** across
  `scripts/test-scoring.ts` (27) and `scripts/test-live-scoring.ts` (76).
  Includes a real-world fixture: Mushuc Runa 1-3 LDU Quito.
- **`vercel.json`** has a `_crons_disabled` stub for `/api/live/update`
  with activation instructions + CRON_SECRET requirement.

### Architectural decisions worth knowing

- **Unified on-pitch model** for clean sheets / conceded goals. We do NOT
  trust API-Football's `stats.goals.conceded` (it's GK-only). Instead we
  derive each player's on-pitch window from `/fixtures/events` (sub-in,
  sub-out, second-yellow, red) and count opponent goals that fell inside
  that window. See `getOnPitchWindow` and `countOpponentGoalsInWindow`
  in `src/lib/live-scoring.ts`.
- **Captain multiplier** is applied at Team aggregation time, NOT on the
  per-player pill, to avoid mid-match flicker between 1x and 2x.
- **DC is a binary cliff** (FPL convention): you get +2 at-or-above
  threshold, 0 below. No partial credit.
- **Transfer logic is intentionally bypassed** via
  `UNLIMITED_TRANSFERS = true` in `src/app/api/transfers/route.ts`.
  Do not flip until we wire real stage-advance transfer-allocation logic
  (NOT in scope for this branch — see "Next Steps" below).

### Known gaps / not yet built

- **Stage advancement is fully manual.** Admin must PUT
  `/api/admin/stages` with `isComplete: true` on the current stage and
  `isActive: true` on the next. No automatic "match X is the last in
  stage Y → advance" logic exists.
- **Transfer-allocation reset on stage advance is not implemented.**
  When we eventually flip `UNLIMITED_TRANSFERS = false`, we need a hook
  that resets `Team.freeTransfers` (per the `TRANSFERS` allocation
  table) and `Team.transfersUsed = 0` on stage transition.
- **Chip re-grants for knockout-stage chips** (e.g. WC2 unlocking after
  R32) are not implemented.
- **Player modal "Stats" tile** (Goals/Assists/Pass%/Inter/Tackles/
  Dribbles) is hardcoded to 0 — the `/api/squad/get` endpoint doesn't
  yet aggregate these across the season. Low priority; the per-match
  breakdown in Match History already shows real per-match stats.
- **Free Hit revert** IS automatic (in `/api/squad/get` via
  `maybeRevertFreeHit`) — included here for completeness.

---

## How to test what's already built

The dev server is normally on `localhost:3000` (or `:3001` if 3000 is
held by a zombie). Start it with `npm run dev`.

### 1. Emergency Override (the Haaland +8 case)
1. `/admin` → "🚨 Emergency Override".
2. Search "Haaland" → select.
3. Leave match dropdown as "Total Points Adjustment" → enter `8` and a
   reason → Apply.
4. Go to `/squad`. Haaland's pill shows the bonus. Open his modal — the
   `+8` entry appears in the **Adjustments** section.

### 2. Match Simulator (no API quota, tests live → FT flow)
1. `/admin/match-simulator`.
2. Pick a match from the dropdown. Match must exist in the DB; if you
   need to seed a Norway match for Haaland, do it via `/admin/fixtures`
   or `/admin/results` first.
3. Click **Seed lineup** — fills 10 players (5 per nation), preferring
   ones in your own squad so the green pill lights up.
4. **Go LIVE** → open `/squad` in another tab → see pulsing pill.
5. Click a seeded player → Match History shows the live match with
   LIVE badge. Click the row to expand the breakdown.
6. Press **Tick** a few times. Refresh `/squad` and re-open the modal —
   the breakdown grows.
7. **Finish** → pill stops pulsing, points lock into `SquadPlayer.points`.
8. **Reset** → wipes perf rows for that match (does NOT roll back
   already-banked points).

### 3. Multiple simultaneous matches
1. Start match A via the simulator → Go LIVE.
2. In a new tab, pick match B → Go LIVE.
3. Open `/squad` — any seeded player from either nation shows a live
   pill that reflects contributions across BOTH matches.

### 4. Live Test Sandbox (validates engine against real API-Football)
1. `/admin/live-test`.
2. Either:
   - "Live now" mode — picks from globally live matches.
   - "Finished / by date" mode — picks a date in the API's allowed
     window. Free tier: rolling ±1 day around today; older fixtures
     limited to 2022-2024 seasons (when filtering by league).
3. Click **Run Once** → calculator runs on real data, no DB writes.
4. **Save snapshot to JSON** to share a calculation for debugging.

### 5. Run tests
```bash
npm test         # all 103 scenarios
npm run test:scoring        # 27 base scoring tests
npm run test:live-scoring   # 76 live + DC + on-pitch tests
npx tsc --noEmit            # strict typecheck (should be clean)
```

---

## Recommended next steps (priority order)

### Tier 1 — Pre-WC must-haves
1. **Wire real transfer-allocation logic.**
   - Flip `UNLIMITED_TRANSFERS = false` in `src/app/api/transfers/route.ts`.
   - On stage advance (probably hooked into a new
     `/api/admin/stages/advance` endpoint or a Vercel cron), set
     `Team.freeTransfers = TRANSFERS[nextStageKey]` and
     `Team.transfersUsed = 0` for every team.
   - Implement the "mercy rule" (`TRANSFERS.MERCY_RULE_ENABLED`): when a
     team has more eliminated players than free transfers, grant
     transfers = eliminated count.
   - Tests: extend `scripts/test-scoring.ts` with team-stage scenarios.
2. **Automate stage advancement.**
   - When ALL matches in `Stage.isActive=true` are `isFinished=true`,
     flip the stage to `isComplete=true` and the next to `isActive=true`.
   - Probably runs in `/api/live/update` after each FT, but worth its
     own helper in `src/lib/stage-advance.ts`.
3. **Wire chip re-grants** (WC2 after R32 etc.) — most of the
   plumbing is in `src/app/api/chips/route.ts`, just needs to react to
   stage transitions.

### Tier 2 — Polish during WC
4. **Replace the modal's hardcoded Stats tile** with real
   season-aggregate stats from `PlayerPerformance` sums. Endpoint
   exists (`/api/players/[id]/performances`) — just needs the
   front-end to add up `goals`, `assists`, etc. across the returned
   rows.
5. **Production rate-limit dashboard.** The Live Test page surfaces
   API-Football usage but nothing else does. Worth a small banner on
   `/admin` showing "X / 7,500 daily calls remaining" once we have a
   Pro plan.
6. **Activate the disabled Vercel cron.** `vercel.json` has an
   `_crons_disabled` block — copy it into the real `crons` array with
   the `path: "/api/live/update"` and 2-minute cadence. Set
   `CRON_SECRET` in Vercel env.

### Tier 3 — Nice-to-have
7. **Show captain multiplier in the modal breakdown** (a final
   "Captain bonus +X" line when applicable, so users understand the
   gap between per-card pill and team total).
8. **Match-by-match audit log surface.** The `/api/players/[id]/performances`
   endpoint already returns overrides, but it filters by `details
   LIKE %playerId%` which is a coarse text scan. Worth adding an
   indexed `AuditLog.playerId` column if this volume becomes painful.
9. **CSV/JSON squad import for testing** at scale — useful if we want
   to simulate 100 users' squads against a fake WC.

---

## Key files (quick reference)

### Scoring + live pipeline
- `src/lib/live-scoring.ts` — calculator + on-pitch helpers + DC
- `src/lib/wc-constants.ts` — scoring + transfer + chip constants
- `src/lib/api-football.ts` — API client, rate-limit tracking
- `src/lib/squad-points.ts` — shared FT finalization helper
- `src/app/api/live/update/route.ts` — cron-driven live updates

### Admin tooling
- `src/app/(dashboard)/admin/page.tsx` — main admin dashboard
- `src/app/(dashboard)/admin/live-test/page.tsx` — sandbox UI
- `src/app/(dashboard)/admin/match-simulator/page.tsx` — simulator UI
- `src/app/api/admin/test-live-fixture/route.ts` — sandbox endpoint
- `src/app/api/admin/live-fixtures-global/route.ts` — fixture picker
- `src/app/api/admin/match-simulator/route.ts` — simulator endpoint
- `src/app/api/admin/override/route.ts` — Emergency Override

### Squad page + per-player view
- `src/app/(dashboard)/squad/page.tsx` — squad page + modal
- `src/app/api/squad/get/route.ts` — squad fetch w/ livePoints
- `src/app/api/players/[id]/performances/route.ts` — per-match breakdown

### Tests
- `scripts/test-scoring.ts` — base scoring + captain + BPS + team totals
- `scripts/test-live-scoring.ts` — on-pitch + DC + real-world fixture

### Schema
- `prisma/schema.prisma` — added `PlayerPerformance.defensiveActions`
  in this branch

---

## Open questions for the user (resolve when picking back up)

1. **Stage-advance trigger** — automatic on last FT, or admin button
   only? (Affects whether we add a cron loop or just a one-off endpoint.)
2. **Transfer allocation on Free Hit revert** — does the user get back
   their pre-FH transfers? Current code reverts the squad but doesn't
   touch `freeTransfers`.
3. **Chip stacking rules** — can a user use both Wildcard 2 and Triple
   Captain in the same knockout round? Code doesn't currently prevent
   it.
