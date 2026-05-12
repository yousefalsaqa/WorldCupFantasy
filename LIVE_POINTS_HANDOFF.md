# Live Points Feature — Handoff

Last updated: 2026-05-12 (evening — match-simulator polish + leagues
polling + override Team.totalPoints fix + clean undo)

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
- **Emergency Override — three-layer sync + clean undo**
  (`src/app/api/admin/override/route.ts`):
  - **POST** now bumps **all three** storage layers in lock-step via
    `applyPointsDeltaToTeams()`:
    1. `PlayerPerformance.bonusPoints` + `totalPoints` (when attached
       to a match)
    2. `SquadPlayer.points` (drives the `/squad` pill)
    3. `Team.totalPoints` with captain ×2 for starters (drives the
       admin Users tab, league standings, dashboard)
    The previous code only did (1) + (2), so overrides invisibly
    diverged from `Team.totalPoints` — Haaland's +8 showed on /squad
    but read as "0 points" in /admin/users. Fixed.
  - "Total Points Adjustment" still works even when the player has no
    finished match in the DB (the original Haaland-pre-WC fix).
  - **DELETE /api/admin/override?auditId=...** — admin-only clean undo:
    - Reverses the perf row, `SquadPlayer.points`, AND `Team.totalPoints`
      via the same helper so the inverse is mathematically exact.
    - Stamps `AuditLog.revertedAt = now` + `revertedByAuditId` on the
      original entry and writes a paired `MANUAL_OVERRIDE_REVERTED`
      bookkeeping row.
    - **Legacy entries** (pre-Team.totalPoints fix, missing
      `teamRowsTouched` in details) skip the `Team.totalPoints`
      decrement so we don't push totals negative on adjustments that
      never propagated there in the first place.
    - `/api/players/[id]/performances` filters out reverted rows so
      the player modal's Adjustments list stays clean — no +X/-X
      ladder, just the entries currently in effect.
  - **Squad-page player modal**: admin-only red "Undo" button on each
    Adjustment row (gated by `/api/auth/me` → `isAdmin`). One click →
    confirmation → DELETE call → squad pill + modal feed refresh in
    place. Non-admins never see the button; even if they crafted a
    DELETE request, `requireAdmin()` rejects it server-side with 403.
- **Admin sandbox** (`/admin/live-test`) — runs the calculator against
  real API-Football fixtures (3 calls per run) without writing to the
  DB. Dual rate-limit gauges, optional polling (default OFF).
- **Admin Match Simulator** (`/admin/match-simulator` +
  `src/app/api/admin/match-simulator/route.ts`):
  - Pick any Match → Seed lineup (prefers admin squad players) → Go
    LIVE → Tick → Finish → Reset.
  - Tick randomly bumps stats every press; Finish runs the canonical
    `updateSquadPoints` flow.
  - **Reset is now a true rollback** — calls `rollbackSquadPoints()`
    (the exact inverse of `updateSquadPoints` extracted from the
    shared `computeTeamContribution` helper) when the match was
    Finished, so banked points are decremented across
    `SquadPlayer.points` + `Team.totalPoints` before perf rows are
    deleted. Reset confirmation explicitly warns when points will be
    rolled back.
  - **Inline create-match form** — if the matches dropdown is empty
    (fresh DB or all simulated matches reset), the UI auto-reveals a
    form to seed a new fixture from (stage, home nation, away nation,
    kickoff). Backed by a new `create-match` action on the simulator
    endpoint and a context call that returns `stages` + `nations` for
    the dropdowns. Simulator now works on a truly empty DB.
  - **Tests the green pill on /squad AND the modal breakdown without
    any API-Football quota.**
- **Leagues page polls live, idles otherwise**
  (`src/app/(dashboard)/leagues/page.tsx` +
  `src/app/api/leagues/standings/route.ts`):
  - Standings endpoint now returns `anyMatchLive: boolean` so the
    frontend doesn't have to guess.
  - Frontend polls every 60s **only while at least one match is
    live**, plus one final refresh when `anyMatchLive` flips from
    true → false (end-of-gameday catch-up). Matches the user's
    explicit ask: "no the league should poll at the end of the
    gameday".
  - Header shows a Live / Idle indicator + last-updated time +
    manual refresh button.
- **Unit tests** — `npm test` runs **190 passing scenarios** across
  `scripts/test-scoring.ts` (27), `scripts/test-live-scoring.ts` (76),
  and `scripts/test-stage-advance.ts` (87 — chip stacking, mercy rule,
  knockout chip refresh, TC/BB mechanics, **rollback arithmetic** via
  the shared `computeTeamContribution` function, round-trip invariants
  including red-card-captain edge cases).
  Includes a real-world fixture: Mushuc Runa 1-3 LDU Quito.
- **Auto stage advancement** (`src/lib/stage-advance.ts`):
  - `maybeAdvanceStage()` runs after every FT in `/api/live/update`
    AND after `Finish` in the match simulator.
  - When all matches in the active stage are `isFinished`, flips
    `isComplete=true/isActive=false` on the current stage and
    `isActive=true` on the next (by `order`).
  - Reverts any active Free Hit snapshots first (restores pre-FH squad,
    bank, freeTransfers, transfersUsed) — so the auto-advance is the
    canonical FH-end trigger, not just `/api/squad/get`.
  - Resets `Team.freeTransfers` per `TRANSFERS[nextStageKey]` and
    `Team.transfersUsed = 0` for every team.
  - Applies the mercy rule (`eliminated > freeTransfers` → bump to
    eliminated count). Stamps `eliminatedCount` + `mercyTransfers` on
    each team's TeamStage row for the stage just closed.
  - Re-grants `TRIPLE_CAPTAIN` / `BENCH_BOOST` / `FREE_HIT` when
    transitioning **GR3 → R32** (knockout phase). `WILDCARD_1` stays
    consumed (group-stage wildcard); `WILDCARD_2` was already gated
    behind knockout stages in `/api/chips`.
  - Writes a `STAGE_AUTO_ADVANCED` `AuditLog` entry with full metadata.
  - Idempotent + loops up to 9 times (so backfill of all-finished
    matches cascades through every completed stage in one call).
- **Chip stacking** (`src/lib/chips-active.ts`,
  `prisma.TeamStage.chipsUsed`):
  - New JSON-encoded array column `TeamStage.chipsUsed` stores the
    activated chip set. Legacy `TeamStage.chipUsed` is mirrored to the
    first entry so older read paths keep rendering.
  - `/api/chips` POST now appends to the array instead of rejecting
    when another chip is already active. DELETE accepts `?chipId=...`
    (or body) to cancel a specific chip; cancels the only active chip
    by default if none specified.
  - `/api/transfers` + `/api/squad/get` both use
    `hasUnlimitedTransferChip(chips)` so any of WC1 / WC2 / FH in the
    set grants unlimited transfers (Free Hit can be stacked with WC1
    in groups, etc.).
  - `updateSquadPoints` (`src/lib/squad-points.ts`) now reads the
    active chips per (team, stage) and:
    - Applies a **3x** captain multiplier when `TRIPLE_CAPTAIN` is in
      the set (otherwise 2x).
    - Includes bench players in the team total when `BENCH_BOOST` is
      in the set.
  - `/history` page renders one pill per active chip.
  - **Wildcard 2 is hidden from the chips card until knockouts.**
    `/api/chips` GET filters WC2 out of the response whenever the
    active stage is `GR1`/`GR2`/`GR3`, so users only see four chip
    cards in the group phase and five once R32 unlocks. The POST
    handler also still rejects WC2 activation outside knockout
    stages as a server-side safety net.
- **Chips load in parallel with the squad fetch.** The `/squad`
  page's `fetchChips` effect was previously gated on `mode === 'view'`,
  which only flips after `/api/squad/get` resolves — so chips
  serialized AFTER squad and the chips card was visibly empty for
  ~200ms. The gate is gone; chips fetch fires on mount alongside
  squad-get. The chips card itself is still conditionally rendered
  only when the user is in view mode (15-player squad), so builder
  users see no change.
- **Vercel cron activation guide** lives in `docs/vercel-cron-setup.md`
  (moved out of `vercel.json` after Vercel's schema validator rejected
  the stub `_crons_disabled` / `_live_scoring_cron_README` keys). To
  enable: add a `crons` array to `vercel.json` with
  `{ path: "/api/live/update", schedule: "*/2 * * * *" }` and set
  `CRON_SECRET` in Vercel env.

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

- **`UNLIMITED_TRANSFERS = true` is still ON** in both
  `src/app/api/transfers/route.ts` and `src/app/api/squad/get/route.ts`.
  The transfer-allocation machinery (per-stage reset + mercy rule + chip
  refresh on knockouts) is fully wired but won't actually gate the user
  until we flip this flag. Plan: flip it the day before WC kickoff and
  rely on the now-automatic stage-advance to reset budgets.
- **Stage advancement is now auto** (`src/lib/stage-advance.ts`) but the
  admin PUT route at `/api/admin/stages` still works for manual flips
  if we ever need to fix a misclassified match without waiting for
  the cron.
- **Per-stage `TeamStage` points snapshot** (`rawPoints`, `captainPoints`,
  `transferHits`, `totalPoints`) is **not populated yet** — the schema
  fields exist but `updateSquadPoints` only writes to `SquadPlayer.points`
  and `Team.totalPoints` cumulatively. The `/history` page therefore
  shows zeros for `rawPoints`/`captainPoints`/`transferHits`. Worth
  filling in next.
- **Player modal "Stats" tile** (Goals/Assists/Pass%/Inter/Tackles/
  Dribbles) is hardcoded to 0 — the `/api/squad/get` endpoint doesn't
  yet aggregate these across the season. Low priority; the per-match
  breakdown in Match History already shows real per-match stats.
- **Free Hit revert** is now triggered from TWO places:
  1. `/api/squad/get` (`maybeRevertFreeHit`) — fires when the user
     loads the squad page after the FH stage ends.
  2. `src/lib/stage-advance.ts` (`maybeAdvanceStage`) — fires when the
     cron advances the stage. This is the canonical trigger now; the
     squad-get path is a defensive safety net for users who somehow
     never load `/squad` between stage transitions.
  The revert restores squad + bank + `freeTransfers` + `transfersUsed`
  from the snapshot, then stage-advance overwrites `freeTransfers` with
  the next stage's allocation. Pre-FH transfers are honored for the
  cancel-within-stage case (chips DELETE endpoint).
- **Legacy MANUAL_OVERRIDE_* entries** written before the
  `Team.totalPoints` fix (anything created prior to commit `9a1e622`)
  did not propagate to `Team.totalPoints`. The DELETE/undo endpoint
  detects these by the absence of `teamRowsTouched` in their details
  JSON and skips the team-total decrement so we don't push teams
  negative. New entries record `teamRowsTouched` so future undos are
  exact. **If you want every legacy override to retroactively show
  up in `Team.totalPoints`, a small backfill script is needed**
  (iterate unreverted MANUAL_OVERRIDE_* rows, re-apply with
  `applyPointsDeltaToTeams` but only the team-total portion). Low
  priority unless we discover other historical entries that need it.

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
5. Hop over to `/admin/users` — the team that owns Haaland now shows
   the +8 (or +16 if captained) in **Total Points**. The
   pre-fix bug was that this was 0; now Override propagates to
   `Team.totalPoints` in the same call.
6. **Clean undo**: back on `/squad`, open Haaland's modal, click the
   red **Undo** button next to the `+8` row in Adjustments. Confirm.
   The row disappears, the pill drops back to 0, and `/admin/users`
   returns to 0 — all without leaving a +8 / -8 ladder in the audit
   list. The original `AuditLog` row is marked `revertedAt = now` and
   paired with a `MANUAL_OVERRIDE_REVERTED` bookkeeping entry (both
   hidden from the modal feed).
7. Non-admins never see the Undo button; the `DELETE /api/admin/override`
   endpoint also enforces `requireAdmin()` server-side.

### 2. Match Simulator (no API quota, tests live → FT flow)
1. `/admin/match-simulator`.
2. Pick a match from the dropdown. **If the dropdown is empty**, the
   inline "Create test match" form auto-reveals: pick stage + home
   nation + away nation (+ optional kickoff) → click Create. The
   simulator no longer requires you to seed fixtures elsewhere first.
3. Click **Seed lineup** — fills 10 players (5 per nation), preferring
   ones in your own squad so the green pill lights up.
4. **Go LIVE** → open `/squad` in another tab → see pulsing pill.
5. Click a seeded player → Match History shows the live match with
   LIVE badge. Click the row to expand the breakdown.
6. Press **Tick** a few times. Refresh `/squad` and re-open the modal —
   the breakdown grows.
7. **Finish** → pill stops pulsing, points lock into `SquadPlayer.points`
   AND `Team.totalPoints`. Stage advance auto-fires here too.
8. **Reset** → if the match was Finished, calls `rollbackSquadPoints()`
   first to decrement points across both `SquadPlayer.points` and
   `Team.totalPoints` (exact inverse of the Finish path). Then wipes
   the perf rows and flips the match back to pre-LIVE. The reset
   confirmation explicitly mentions the rollback.

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
npm test                    # all 190 scenarios
npm run test:scoring        # 27 base scoring tests
npm run test:live-scoring   # 76 live + DC + on-pitch tests
npm run test:stage-advance  # 87 chip-stacking + rollback tests
npx tsc --noEmit            # strict typecheck (should be clean)
```

---

## Recommended next steps (priority order)

### Tier 1 — Pre-WC must-haves
1. **Flip `UNLIMITED_TRANSFERS = false`** in both
   `src/app/api/transfers/route.ts` and `src/app/api/squad/get/route.ts`
   the day before WC kickoff. All the supporting machinery (allocation
   reset, mercy rule, chip refresh, FH revert) is already wired.
2. **Populate per-stage `TeamStage` points snapshots** in
   `updateSquadPoints` so `/history` actually renders meaningful
   `rawPoints`/`captainPoints`/`transferHits`/`totalPoints`. Right now
   the team-wide totals accumulate into `Team.totalPoints` but the
   per-stage tile breakdown is empty.

### Tier 2 — Polish during WC
3. **Replace the modal's hardcoded Stats tile** with real
   season-aggregate stats from `PlayerPerformance` sums. Endpoint
   exists (`/api/players/[id]/performances`) — just needs the
   front-end to add up `goals`, `assists`, etc. across the returned
   rows.
4. **Production rate-limit dashboard.** The Live Test page surfaces
   API-Football usage but nothing else does. Worth a small banner on
   `/admin` showing "X / 7,500 daily calls remaining" once we have a
   Pro plan.
5. **Activate the Vercel cron.** Add a `crons` array to `vercel.json`
   with `{ path: "/api/live/update", schedule: "*/2 * * * *" }`
   (instructions in `docs/vercel-cron-setup.md`). Set `CRON_SECRET`
   in Vercel env. Once this runs, stage advancement becomes fully
   hands-off.

### Tier 3 — Nice-to-have
6. **Show captain multiplier in the modal breakdown** (a final
   "Captain bonus +X" line when applicable, so users understand the
   gap between per-card pill and team total). Especially valuable now
   that Triple Captain (3x) is a real lever.
7. **Match-by-match audit log surface.** The `/api/players/[id]/performances`
   endpoint already returns overrides, but it filters by `details
   LIKE %playerId%` which is a coarse text scan. Worth adding an
   indexed `AuditLog.playerId` column if this volume becomes painful.
8. **CSV/JSON squad import for testing** at scale — useful if we want
   to simulate 100 users' squads against a fake WC.
9. **Admin "force stage advance" button** on `/admin` that calls
   `maybeAdvanceStage` on demand — handy for previewing the next
   stage's chip refresh / transfer reset without finishing every
   match.

---

## Key files (quick reference)

### Scoring + live pipeline
- `src/lib/live-scoring.ts` — calculator + on-pitch helpers + DC
- `src/lib/wc-constants.ts` — scoring + transfer + chip constants
- `src/lib/api-football.ts` — API client, rate-limit tracking
- `src/lib/squad-points.ts` — shared FT finalization (TC + BB aware)
- `src/lib/stage-advance.ts` — auto stage advance + transfer reset
- `src/lib/chips-active.ts` — chip-stacking parse/serialize/predicates
- `src/app/api/live/update/route.ts` — cron-driven live updates + advance
- `src/app/api/chips/route.ts` — multi-chip activation / cancellation

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
- `scripts/test-stage-advance.ts` — chip stacking + mercy rule + TC/BB

### Schema
- `prisma/schema.prisma` — added `PlayerPerformance.defensiveActions`,
  `TeamStage.chipsUsed` (JSON array for chip stacking), and
  `AuditLog.revertedAt` + `AuditLog.revertedByAuditId` (both optional,
  for clean undo of manual point adjustments)

---

## Open questions for the user (resolve when picking back up)

All previously-open questions are now resolved:

1. **Stage-advance trigger** — automatic on last FT (via the cron).
   Lives in `src/lib/stage-advance.ts`; called from `/api/live/update`
   and the match simulator.
2. **Free Hit revert restores transfers** — yes. The snapshot now
   captures `freeTransfers` + `transfersUsed` at activation time and
   restores them in both revert paths (chips DELETE + auto-revert).
3. **Chip stacking** — allowed in both group stages and knockouts.
   Chips also refresh (TC / BB / FH) when entering R32 so users get a
   fresh set for the knockout phase. WC1 stays consumed (group-stage
   wildcard); WC2 unlocks naturally in R32+ via the existing gate.
4. **League polling cadence** — every 60s while at least one match is
   live, plus one final refresh on the live → idle transition. No
   polling between gamedays.
5. **Match simulator usability on empty DB** — inline create-match
   form fills the gap; no need to seed fixtures via /admin/fixtures
   first.
6. **Override audit-trail clarity** — undo writes a paired
   REVERTED row but the player modal's Adjustments list hides both
   entries via `revertedAt != null`, so admins see a clean
   "currently-in-effect" view.

Remaining open work (carryover):

- **Per-stage `TeamStage` points snapshots** —
  `updateSquadPoints` accumulates into `Team.totalPoints` but never
  populates `TeamStage.rawPoints` / `captainPoints` / `transferHits` /
  `totalPoints`. The `/history` page shows zeros for these. Worth
  adding in the next pass.
- **Flip `UNLIMITED_TRANSFERS = false`** the day before WC kickoff
  (see Tier-1 step 1 above).
- **Optional**: backfill legacy MANUAL_OVERRIDE_* rows into
  `Team.totalPoints` so even pre-fix overrides show up in
  /admin/users + league standings. Only relevant if there are
  historical overrides we want to preserve rather than undo.
