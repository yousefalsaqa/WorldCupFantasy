# Live Points Feature — Handoff

Last updated: 2026-06-23 (**LIVE** — GR2 in progress, GR3 next. This session
fixed a real transfer-budget bug + a batch of transfer/modal/points-pill UX.
See **Session 2026-06-23** immediately below.)

---

## Session 2026-06-23 — TRANSFER BUDGET BUG + TRANSFER/MODAL/POINTS UX (committed, push pending verify)

All changes committed this session. Found while the user was reshuffling a
locked (queued) round: the picker let them build transfers the server then
rejected with "Insufficient funds. Need £0.2m but only have £0.0m".

### Shipped (all typecheck-clean; tested in dev against prod DB)
- **Transfer "Insufficient funds" bug FIXED (the real one).** In QUEUE mode the
  server NEVER debits `Team.bankBalance` — it only RESERVES already-queued spend
  via `pendingNetCost` (`/api/transfers` route) and applies it at the round
  boundary. The squad page's `projectedBank` was `bankBalance + impact` and
  ignored that reservation, so it showed the full bank, let the user build
  transfers, then the server 400'd. Now
  `projectedBank = bankBalance − queuedNetCost + transferBudgetImpact`
  (`queuedNetCost` = net £m of already-queued transfers, the same figure
  `plannedMoneyDelta` used in Planned view — now shared). Client and server
  budgets agree; picker greys out unaffordable players instead of failing at
  submit.
- **Picker also hides already-QUEUED incoming players** (server rejects
  re-picking them with "already queued to join"). Nation-count divergence for
  queued transfers is still NOT modelled client-side (queuedTransfers payload
  carries `nationCode` not `nation.id`) — secondary, left as-is.
- **Per-pick budget is now ONE source of truth** (`transferPickMax`, hoisted
  out of the `availablePlayers` memo) used by BOTH the picker filter and the
  picker header, including the empty-slot case (refund already banked → not
  added twice). They can no longer disagree.
- **Picker header rewritten** (was the "weird unfinished" `Bank £6.1m + refund
  £5.2m · max £11.3m per pick`): now one bold number **"Spend up to £11.3m"** +
  a plain sub-line "£6.1m in the bank + £5.2m from selling Kimmich" (sub-line
  drops on empty-slot fills).
- **Locked-round banner reworded** + the **"Free 0" vs "you have 3 free"
  contradiction killed**: one source `freeTransfersLeft = max(0, freeTransfers −
  pendingTransfers.length)` drives BOTH the pill and the banner ("**X of Y free
  transfers left**"); the **−4 hit copy only appears once you go under**.
- **Dashboard "Total" pill now LIVE** (user's call). `/api/team` GET returns
  `liveTotalPoints = team.totalPoints + liveTeamDeltas([id])` (between rounds =
  banked; mid-match ticks up). Dashboard reads it (falls back to
  `team.totalPoints`). Squad page already showed live; now dashboard + squad +
  league all match mid-match.
- **Per-WEEK points in the breakdown popup now LIVE.** `stages-summary` was
  showing the in-progress round's un-settled `TeamStage` total (0). It now
  surfaces the live round total (`currentRoundPoints`, captain/bench/hits) for
  the active stage, tagged `points.live=true`. Modal shows a **pulsing green
  dot** beside the live number and **polls the summary every 30s** while open.
  (Expanded mini-pitch still snapshots at expand time, not on the 30s tick —
  refreshes on reopen. Left as scope.)
- **Two modal top-clip fixes.** Both the **PlayerDetailModal** and the
  **PointsBreakdownModal** clipped their header under the sticky nav when the
  content grew (expanding a match-history row / a week's pitch, or iOS address-
  bar collapse). Player modal: was vertically centered → now `items-start
  sm:items-center` anchored below the nav (`paddingTop: safe-area + 4.5rem`),
  `max-h-[82dvh]`. Breakdown modal (bottom sheet): capped to
  `calc(100dvh − safe-area − 4.25rem)` so the header always clears the nav +
  safe-area bottom pad. (Same class of fix the squad pickers already had.)

### Verified
- Typecheck clean throughout. Dev compiled all touched pages/routes (200s on
  `/api/team`, `/api/team/stages-summary`).
- **Squad snapshot save confirmed working for GR2-onward.** `scripts/check-
  snapshots.ts` (new, read-only) reports snapshot coverage per stage:
  currently **GR1 0/27 (settled pre-feature → "estimated" forever), GR2 0 yet
  (settles exact at GR2→GR3 boundary), 28 teams**. `settleStage` writes
  `TeamStage.squadSnapshot` (player ids + lineup flags, BEFORE
  applyPendingTransfers) and the gameweek endpoint PREFERS it (`usedSnapshot`,
  `lineupInferred=false`). GR1 can't be made exact retroactively (never
  recorded) — its "estimated" label is honest; did NOT backfill a fake snapshot.
  - **TODO after GR2→GR3 rollover:** re-run `npx tsx scripts/check-snapshots.ts`
    to confirm 28/28 GR2 snapshots landed (proves the deployed cron settled
    with the snapshot code).

### Files touched
- `src/app/(dashboard)/squad/page.tsx` — budget fix, transferPickMax, picker
  header, free-left copy, banner.
- `src/app/api/team/route.ts` — `liveTotalPoints`.
- `src/app/(dashboard)/dashboard/page.tsx` — live Total pill.
- `src/app/api/team/stages-summary/route.ts` — live active-stage per-week total.
- `src/components/points-breakdown-modal.tsx` — live number + pulse + 30s poll +
  top-clip cap.
- `src/components/player-detail-modal.tsx` — anchor below nav.
- `scripts/check-snapshots.ts` — new read-only snapshot-coverage checker.

---

## Session 2026-06-18 PM — POINTS / TRANSFERS / HISTORY / LEAGUE FIXES + FORCE RE-LOGIN (DEPLOYED)

All of the below is on **main/prod**. Commits: `f60f5eb` (empty-slot + fixtures
strip), `af0b895` (points/transfers/planned/history), `67463ef` (snapshot),
`89e8f72` (JWT redeploy), `a993c1b` (breakdown/league/inference), `85a7327`
(league tie-break). Read-only audit scripts left in `scripts/` as a record.

### Shipped
- **Empty-slot transfer module** (squad page transfer mode): ✕ frees a slot to
  empty (banks the money), fill later by tapping the slot; ↺ restores. Body tap
  still does a direct one-tap replace. `pendingTransfers` now allows
  `playerIn: null`; submit blocked while any slot empty; filling uses
  `projectedBank` (no double-refund).
- **Per-round player pills**: `/api/squad/get` AND league
  `/api/team/[teamId]/squad` now compute each pill from the **active stage's
  PlayerPerformance** (live + banked), NOT cumulative `SquadPlayer.points`
  (which accumulated from when a player joined the team → held vs
  transferred-in were on different bases). Resets each round; banked
  `Team.totalPoints` untouched. Pills read 0 until the round's games play.
- **Top "Round Pts"** (dashboard + squad): `stages-summary.currentRoundPoints`
  now = active-stage perfs − hits (was `totalPoints − completedSum`, which
  leaked the leaderboard-vs-snapshot divergence — teams with no games showed
  +2/+4).
- **Transfer hit-flag bug FIXED**: immediate mode flagged the WHOLE batch
  `isFreeTransfer` identically, over-counting hits at settlement on mixed
  requests. Now per-transfer (mirrors the queue path). Charbel's 3 mislabeled
  rows repaired (`scripts/repair-transfer-flags.ts --apply`); all teams now
  consistent (`scripts/scan-transfer-flag-bug.ts`).
- **Planned-lineup rollover bug FIXED**: `applyPendingTransfers` was
  double-gated behind `pendingTransfers` (stage-advance only called it for
  teams WITH queued transfers, AND it early-returned on 0 pending), so a
  lineup-only planned arrangement was silently dropped. Now runs when
  `pendingTransfers` OR `plannedLineup` is set. Applies at GR2→GR3.
- **Squad SNAPSHOT at settlement**: `settleStage` writes
  `TeamStage.squadSnapshot` (player ids + lineup flags of the squad that played
  the stage, captured BEFORE `applyPendingTransfers`). The gameweek endpoint
  prefers it → past-round breakdowns are **EXACT from the GR2→GR3 settlement
  onward**. (Column already existed in schema — no migration.)
- **Past-round breakdown for pre-snapshot rounds (GR1/GR2)**: gameweek endpoint
  reconstructs the squad by **rewinding later-stage transfers** (players +
  positions exact; same-position transfers keep the formation valid). Then a
  **best-guess lineup**: corrects the captain from the settled `captainPoints`,
  infers the XI that sums to `rawPoints` (valid formation, captain forced in),
  and assigns a valid vice (non-captain starter). Falls back to the raw rewind
  if no exact subset exists or Bench Boost was active. Modal shows an amber
  "estimated lineup" note (`lineupInferred` flag).
- **/history** rows open the shared `PlayerDetailModal` (full match history +
  upcoming fixtures). Detail modal also shows an "Upcoming" fixture strip.
- **Breakdown popup**: chip badges per round (WC / BB / 3×C / FH); bench ordered
  by `benchOrder` (gameweek endpoint now returns it).
- **Fixtures**: player cards show the NEXT game's FDR only
  (`getNextWcFixtures(code, 1)`); the detail modal "Upcoming" shows the
  multi-game run. Shared `getNextWcFixtures` in `lib/world-cup-fixtures`.
- **League standings tie-break**: still ranks by overall total, but ties break
  by **this-gameweek points** (desc), then **earliest `Team.updatedAt`** ("who
  got the score first").

### Ops — FORCE RE-LOGIN (done)
`JWT_SECRET` rotated in the Vercel dashboard + redeploy → all 7-day tokens
invalid → everyone re-logs into the fresh build. New secret lives in Vercel
only (write-only). The 1-min cron (`/api/live/update`) uses no user JWT, so the
rollover is unaffected.

### Verified (read-only — scripts in `scripts/`)
- **GR1 banking intact**: all 23 teams settled, 24/24 matches, no lost points.
  3 teams had small leaderboard-vs-snapshot deltas (mid-stage lineup changes +
  Charbel's hit-flag) — benign, leaderboard ≥ snapshot.
- **Inference** across all teams: 20/23 match `rawPoints`, 2 fall back, 1 Bench
  Boost; captain consistent 21/22 (1 = blanked captain, unrecoverable); **0
  vice/captain-on-bench**.

### OPEN (user's call, NOT blocking)
- **Wildcard free-transfer RESET**: a Wildcard/Free-Hit week still **banks**
  unused free transfers into the next round (chimbohimbo wildcarded GR2, kept
  4 → will start GR3 with 5). FPL resets to the base (2). Fix would zero the
  `leftover` fed to `computeNextFreeTransfers` in `stage-advance` for teams
  whose CLOSING stage's `TeamStage` carried a WILDCARD/FREE_HIT chip — mind
  transfers queued during the locked wildcard round.
- **chimbohimbo's saved `plannedLineup` is STALE** (references a dropped
  player) → would be ignored at GR2→GR3. User to re-save in Planned view.

### Key facts for whoever resumes
- Active stage = **GR2 (locked since 2026-06-18 16:00Z)**; next = GR3.
- Rollover trigger: `/api/live/update` (1-min cron) → `maybeAdvanceStage` →
  `settleStage` + `applyPendingTransfers` (queued transfers + planned lineup).

---

## Session 2026-06-18 (earlier) — PLANNED VIEW + TRANSFER HITS + FIXTURES + POINTS UI

> **STATUS UPDATE:** this branch is now **MERGED + DEPLOYED** (see Session
> 2026-06-18 PM above). The planned-lineup apply is live (and a rollover bug in
> it was fixed in the PM session). Kept below for history/context.

All of the below lives on branch **`feature/transfers-planned-view`**
(typechecks clean, tested in dev against the prod DB). **Only the pricing
fix was pushed to `main`/prod.** Decide deploy timing deliberately — a
GR1→GR2 rollover already happened on prod's existing code while this branch
sat undeployed (queued transfers applied fine; the new planned-lineup
apply did NOT run — it needs a deploy to take effect at the next rollover).

### Shipped to main/prod
- **Transfer picker affordability fix** — picker "max per pick" + filter now
  use `projectedBank` (not raw bank), so players you can afford aren't hidden.

### Built on the branch (NOT deployed)
- **Live | Planned squad view** (squad page). Planned view previews the team
  AFTER queued transfers apply, with its OWN independent lineup state
  (`plannedStartingXI/Bench/captain`) so arranging next round never touches
  the locked current lineup. Saved via `PUT /api/squad/update {forNextRound:true}`
  → `Team.plannedLineup` (new nullable column, added via `prisma db push`),
  applied at EVERY stage boundary in `applyPendingTransfers` (groups + KOs).
- **Transfers beyond the free allotment** now allowed while a round is locked,
  each extra = **−4 hit** applied to the round they take effect in. Queue
  entries tagged `isFree` (in `pendingTransfers` JSON); `applyPendingTransfers`
  writes paid ones as non-free `Transfer` rows (settleStage counts them) and
  decrements the running total. **Cancel recomputes the free/paid split** from
  the invariant allotment (`freeTransfers + free entries queued`) so a cancel
  clears a now-unneeded hit. Pending hit surfaced via `queuedHit` from
  `/api/squad/get` (Total Pts hint + red badge on the queued card).
  - Repair script if isFree ever drifts: `scripts/repair-queue-isfree.ts`.
- **Fixtures** grouped into collapsible round folders (matchday derived per
  group); current round opens by default. Flag `onError` fallback + lazy load.
- **Points breakdown popup** (`src/components/points-breakdown-modal.tsx`):
  tappable Total → per-week list → expand a week to a read-only mini pitch
  (kit faces + photos). New `GET /api/team/stages-summary` returns per-stage
  points + `currentRoundPoints` (= total − completed). Top pill = TOTAL, stat
  card = current ROUND. Wired on dashboard + squad header.
- Smooth inline "Saved ✓" replaced the `alert()` on squad save.

### ✅ DONE (Session PM): EMPTY-SLOT TRANSFER MODULE — built + shipped (commit f60f5eb). Original spec kept below.
### ⚠⚠ (original) NEXT: build the EMPTY-SLOT TRANSFER MODULE (requested, NOT started)
Frontend-only change in `src/app/(dashboard)/squad/page.tsx` transfer mode.
No backend change needed — the server already takes `{playerOutId, playerInId}`
pairs; empty slots are transient CLIENT state, never submitted.

Goal: in transfer mode each player card gets an **✕ (transfer out)** that
frees the slot and banks his money immediately, leaving an **empty slot** you
fill later (instead of the current force-pick-a-replacement-in-one-tap flow).

Implementation reminders:
- `pendingTransfers` type → allow `playerIn: Player | null` (currently
  `{playerOut, playerIn}`). An "out, not yet filled" entry has `playerIn:null`.
- `transferOut(p)`: push `{playerOut:p, playerIn:null}`.
- `transferDisplaySquad`: when an entry has `playerIn===null`, render the slot
  as **empty** — reuse `EmptySlot` from `@/components/kit`, keep the position so
  it lands in the right row.
- Fill: tap the empty slot → `startReplace(outPlayer)` → picker → `commitTransfer`
  sets `playerIn` on the matching entry (match by `playerOut.id`).
- Budget when filling an empty slot = **`projectedBank`** (the out's money is
  ALREADY banked into projectedBank — do NOT also add the refund or you
  double-count). `transferBudgetImpact`: `change += playerOut.currentPrice -
  (playerIn?.currentPrice ?? 0)`.
- GUARD every `t.playerIn` read for null: `isPendingIncoming`, `findOutgoingFor`,
  `projectedNationCounts`, `submitTransfers` (filter out unfilled before mapping).
- **Block submit while any slot is empty** (user explicitly confirmed: "they
  shouldn't be able to save with an empty slot"). Disable the Queue/Confirm
  button + show a hint when `pendingTransfers.some(t => !t.playerIn)`.
- Undo: support undo by `playerOut.id` (empty slot) as well as `playerIn.id`.
- Keep the **phone layout, `size="xs"` cards, and existing color palette**
  (violet=planned/queued, amber=pending, emerald) — user cares about this.
- Interacts cleanly with the −4 hits already built (each out=in pair still
  counts as one transfer for the free/hit accounting).

### Branch / DB facts for whoever resumes
- DB already has `Team.plannedLineup` (nullable) via `db push`; `pendingTransfers`
  JSON entries may carry `isFree`. These are backward-compatible (old code
  ignores them; missing `isFree` = treated as free).
- Read-only check scripts added in `scripts/`: `check-rollover.ts`,
  `check-gr1-saved.ts`, `repair-queue-isfree.ts`, `inspect-queued-overlay.ts`.
- Deploy decision still open: deploying makes planned-lineup apply + queued
  hits live from the next rollover onward.

---

## Session 2026-06-16 — FIXTURE-DETAIL SELF-HEALING + null-id crash fix

User reported KSA-URU and IRN-NZL had "no data" in the fixtures modal hours
after FT. The scoring/perf rows were fine and banked — this was the
**fixture detail modal** (Stats/Lineups/Timeline), which reads a SEPARATE
`Match.detailCache`, not perf rows. Two distinct causes:

- **IRN-NZL — a hard crash (the real culprit).** API-Football's lineup feed
  for fixture 1489378 contained a lineup slot with a **null player id**. The
  detail route fed every lineup id into one `prisma.player.findMany({ where:
  { apiFootballId: { in: [...] } } })` photo lookup; a `null` in that `in`
  array makes Prisma throw, so the **entire detail fetch 500'd every time** —
  nothing to do with lag, and it would never have populated. (A missing
  photo alone is harmless — `PlayerFace` falls back to the kit SVG.)
- **KSA-URU — the post-FT publishing lag.** API-Football flips FT on the
  scoreline feed before publishing the stats/lineups/events bundle; the one
  fetch attempt landed in that window and wrote nothing. (It self-healed
  on its own once a real user re-opened the modal — `already-cached` by the
  time we swept.)

### What shipped (chose "both" — guard + cron heal sweep)

- **`src/lib/fixture-detail.ts`** (new) — extracted the route's
  `transform` + fetch/cache-write into ONE shared path so the on-demand
  route AND the cron use identical logic (mirrors `rescore-pending.ts`).
  - **null-id filter** on lineup ids (`.filter((id): id is number => ...)`)
    — fixes the IRN-NZL crash class for good.
  - **Freeze-empty guard**: `final` (= cache served forever, no TTL) is set
    only when `payloadHasContent()` is true. An empty post-FT snapshot now
    caches `final:false` and re-fetches on the live TTL instead of freezing
    empty permanently. This was a latent bug in the old route (it served any
    `final` cache forever, even an empty one).
  - **`healFixtureDetailCache()`** — re-warms missing/content-empty caches
    for matches finished within `RECENT_WINDOW_HOURS = 18`. Idempotent
    (`cacheNeedsHeal` skips content-bearing caches at zero API cost), ~1
    API call per unhealed match per run, collapses to zero once the bundle
    publishes.
- **`src/app/api/fixtures/[id]/detail/route.ts`** — refactored onto the lib;
  behavior identical minus the freeze bug. Predicted-XI still read fresh
  per request, outside the cache.
- **`src/app/api/live/update/route.ts`** — `runDetailHealSweep()` wired into
  BOTH return paths next to `runRescoreSweep`, try/catch-wrapped (can never
  break live scoring), surfaced as `detailHealed` in the response.
  Piggybacks the existing 1-min cron — NO new schedule.
- **`scripts/run-detail-heal.ts`** — manual trigger / checker (parallels
  `run-rescore-sweep.ts`). `scripts/check-detail-cache.ts` inspects the
  stored envelope for given fixtures.

### Verified

- Typecheck clean. Ran the sweep against live prod data: IRN-NZL → `healed`
  (10 stats / 2 lineups / 14 events, `final:true`), KSA-URU →
  `already-cached`. Confirmed both caches now carry full content.

### Carryover note

- CIV-ECU's cache is stale at `2H/live` (went stale pre-FT, now >18h old so
  the sweep skips it). Harmless: `final:false` → it re-fetches and
  self-corrects the moment anyone opens that modal.

---

## Session 2026-06-14 №2 — SELF-HEALING DELAYED RE-SCORE (shipped to prod)

Shipped + deployed: commit `ee10dcd` (Vercel Production ● Ready, verified).

### The bug it fixes

API-Football marks a fixture **FT on the scoreline/events feed before its
per-player `games.minutes` snapshot is finalized** — their own docs say
player stats settle "in the minutes/hours following the match, up to 48h"
depending on competition. Our live cron banks the instant a match flips FT,
so a match can **bank against a half-finished snapshot**.

- **Live case — CIV-ECU (GR1, fixture 1489375)**: at FT every starter was
  frozen at `games.minutes = 50` (both teams), every sub `minutes = null`.
  Proven NOT our bug: a raw `curl` to `/fixtures/players?fixture=1489375`
  (bypassing our client entirely) returned the identical frozen-50 data,
  `errors:[]`. Goals/assists were CORRECT (those come from the events feed,
  which is reliable — same feed the penalty-goal fix uses); only the
  **minutes field** stalled. Impact of banking it: **CIV's clean sheet
  denied** (1-0 win, but defenders read 50' < the 60' CS gate) and any
  **subs scored 0** (null minutes).

### What shipped

- **`src/lib/rescore-pending.ts # rescorePendingFinishedMatches()`** — sweeps
  matches `isFinished` within the last **18h** whose stored max
  `minutesPlayed` looks **non-final (< 85')**, re-pulls fixture+players+events,
  and **rebanks ONLY when the fresh snapshot looks final (max ≥ 85')** and
  differs from what's banked (rollback → re-upsert perfs → `updateSquadPoints`).
  Writes a `MATCH_RESCORED` `AuditLog` row. Idempotent.
- **Finality guard is the safety property**: a normally-completed 90' match
  always has several players at ~90', so stored max ≥ 85 → marked
  `already-final` → **skipped with ZERO re-pull / ZERO writes**. It therefore
  **never disturbs a correctly-banked finished game**, and never touches
  anything older than 18h. A frozen partial (max 50) is the only thing it
  re-checks, and it won't rebank that partial either — only the real final.
- **Wired into `/api/live/update`** (both return paths) via a `try/catch`-
  wrapped `runRescoreSweep()` helper, so the sweep **can never break live
  scoring**; per-match outcomes surface in the response under `rescored`.
  **Piggybacks the existing 1-min cron — NO new schedule** (this is the whole
  "no timer needed" point).
- **`scripts/run-rescore-sweep.ts`** — manual trigger / safe checker (untracked
  scratch). `scripts/backfill-rescore.ts` (pre-existing) rescore ALL finished
  matches if ever needed.

### Verified

- Local + **prod** (hit prod `/api/live/update` with `CRON_SECRET` → response
  carries `rescored`): GER-CUW (90') + NED-JPN (94') → `already-final`, 0 calls;
  **CIV-ECU → `still-pending`, no write** (guard holding). Typecheck clean.

### ⚠ LIVE STATE / carryover

- **CIV-ECU is currently banked WRONG** (CIV clean sheet denied, subs 0),
  pending API-Football finalizing fixture 1489375's minutes. **It auto-rebanks
  within ~1 min of their feed settling** — no action needed. ONLY if their feed
  stays broken past the 18h window does the sweep stop trying; then run
  `scripts/run-rescore-sweep.ts` (or `backfill-rescore.ts`) manually.
- Tunables in `rescore-pending.ts`: `FINALITY_MIN_MINUTES = 85`,
  `RECENT_WINDOW_HOURS = 18`.

---

## Session 2026-06-14 — SCORING FIXES + STANDINGS REVAMP + PRICING PLAN

All shipped to prod EXCEPT the player reprice (designed + simulated, to
APPLY before the GR2 deadline). Pushed commits this session:
`0ef871d` `c447f7e` (sub-off warning), `328f682` (fixture dates),
`55c6270` `f935eae` (late-joiner provisional + deadline clarity),
`261e175` `a833700` (penalty/assist scoring), `a5c7c3c` `9c5915c`
(standings 3-col + Manager of the Week + captain/bench-boost display).

### ⚠⚠ NEXT TIME: PLAYER REPRICE — APPLY BEFORE GR2 (deadline ~Jun 18)

**Decision locked: reprice the whole pool cheaper + finer, keep premiums,
keep £100m budget.** Everything below is SIMULATED only — nothing written
to the DB yet. The reprice must be applied (with bank rebase) in ONE shot
right before the GR2 transfer window opens.

- **Why**: prices were crushed onto 17 round 0.5-steps (246 players at
  exactly 6.0); FIFA's own fantasy uses 54 points / 0.1 steps and is ~0.6
  cheaper. Our June-10 sync stretched FIFA's 3.5–10.5 onto 3.5–14 AND
  rounded to 0.5, inflating + clustering the mid.
- **Chosen curve = avg £4.70** (median 4.1, max kept 13.5, 53 distinct
  points). Maps FIFA price → new price via piecewise-linear ANCHORS in
  `scripts/price-sim.ts` (keep premium top, lower+spread the mid, round
  0.1, floor 3.0). The FIFA price (fine 0.1 signal) de-clusters the 246.
- **Hard constraint — every existing squad must stay ≤ £100m** (rebasing
  can't save a squad >100; its bank would go negative). At avg 4.7 ALL 22
  squads fit (priciest Charbel £98.8). At avg ~4.9, 2 premium-heavy squads
  break — so 4.7 is about the ceiling. (avg 4.4 was even safer if wanted.)
- **On APPLY: rebase banks** — set each owned player's purchasePrice = new
  price and bank = 100 − new squad cost (everyone gets the cheaper market,
  no sell-at-old-price arbitrage). Keep budget £100m. Standings/scoring
  unaffected (display reprice only changes Player.currentPrice + rebased
  squad rows).
- **Scripts (read-only sims, no DB writes; in `scripts/`, untracked):**
  - `price-sim.ts` — THE tuner. Edit `ANCHORS`, run, prints distribution +
    cheapest XV + per-team budget check. Reads `fifa-match-map.json`.
  - `fifa-match-map.json` — our-player→FIFA-price map (1238/1245 matched),
    produced by temporarily pointing `cross-check-fifa-prices.ts` at the
    fresh files + dumping `diffs`. Regenerate if rosters change.
  - `fifa-players-fresh.json` / `fifa-squads-fresh.json` — refetched
    Jun-14 from play.fifa.com (FIFA moves prices between rounds — refetch).
  - `fifa-price-compare.ts` — FIFA vs our distribution (read-only).
  - No apply script written yet — needs: set currentPrice from the curve,
    then rebase every team's purchasePrice + bankBalance, in one txn.

### Scoring fixes (live, prod)

- **Penalty goals were dropped.** API-Football's per-player stats feed
  sometimes returns `goals.total: null` for PENALTY scorers (seen: Havertz
  GER-CUW) while normal-goal scorers are fine. We read goals only from that
  feed → missed. Fix (`live-scoring.ts`): goals = `max(stats.goals.total,
  countGoalsFromEvents)`; assists likewise. Events reliably carry penalties
  (`detail:"Penalty"`). Cards/pen-misses deliberately NOT max'd (negative —
  would over-penalise). 77+27 tests pass. Live cron re-upserts in-progress
  rows so players self-correct; already-banked FINISHED matches won't
  retro-fix (auditor `scripts/backfill-check-penalty-goals.ts` found only
  Khoukhi QAT-SUI, owned by 0 teams → no action).

### Captain/points display consistency

- **Squad page showed RAW points (captain not doubled)** → header read 22
  vs the captain-doubled Team.totalPoints (32) on dashboard/admin. Now the
  captain pill shows ×2 (×3 Triple Captain) and the header uses the server
  `teamLivePoints` (Team.totalPoints + late-gated live delta) from
  `/api/squad/get` — captain, bench boost AND transfer hits all included,
  so squad == dashboard == league == admin. Display-only (scoring was
  always right). The dashboard `/api/team` reads flat Team.totalPoints and
  was correct; do NOT "fix" it.

### Late-joiner "provisional points" (live)

- A team whose FIRST squad save is after a stage deadline (new joiners
  only — established managers are NEVER re-flagged) is locked OUT of that
  stage: players SHOW points but they don't count; total/rank frozen until
  next stage. Keys off `(firstSquadSavedAt ?? createdAt) >= stage.deadline`
  per stage, so it scales to any GRx/knockout. Provisional points computed
  at read time from the active stage's perf rows (NOT banked) in
  `/api/squad/get` + `/api/team/[teamId]/squad`; amber banner on /squad and
  league team-view names the round. Standings stay 0 (liveTeamDeltas is
  late-gated). Omars (Safarjlani to glory) is the live test case.

### League standings revamp (live)

- Three columns now: **<round> / Total / Value** (was points + value).
  "This round" = active-stage points via new `live-team-totals.ts
  #stageTeamTotals` (banked+live, captain/bench-boost/late-gated); banks
  into Total at round end, recomputes next round (scales GR1→GR2→…).
- **Manager of the Week**: trophy on the top round-scorer; tap it for an
  explainer (adapts live vs settled, names the MANAGER not the team).
  Works global + private. Row is a `div` (router.push) not `<Link>` so the
  trophy button is tappable on touch.

### Other UX (live)

- **Sub-off warning**: benching a player whose match kicked off is one-way
  (forfeits round pts, can't re-add) → amber confirm modal w/ his face,
  "Match live now" vs "Already played" wording. Funnels through the single
  `performSwap` chokepoint.
- **Transfer vs lineup deadlines** split on /squad: "Lineup locks" card
  (per-match, rolling) + a Transfers banner (stage deadline before the
  round's first match; "queued for next round" once locked).
- **5 fixture kickoffs corrected** vs API-Football DB (AUS-TUR, TUN-JPN,
  AUT-JOR a day early; TUR-PAR 23:00; BRA-HAI 20:30). Auditor:
  `scripts/audit-fixture-dates.ts` — re-run after knockout fixtures sync.
- **Bench Boost** now visually highlights the bench (violet border + badge)
  on /squad and league team-view. Use `border`, NOT `ring` (the page's
  scroll container clips ring box-shadows at the top).

---

## Session 2026-06-12 — FIXTURES TAB OVERHAUL + PREDICTED LINEUPS (all in prod)

Marathon session spanning KOR-CZE (finished 2-1) into the Jun-12
matchday (CAN-BIH, USA-PAR). Everything below is pushed + deployed.

### ⚠ Facts that prevent future confusion

- **Dev and prod share ONE database** (local `.env` = prod Neon). Data
  changes made "in dev" (predictions, admin actions) are instantly live
  for real users; only CODE needs a push. Treat every local run as prod.
- **League standings + team-view header are now LIVE** (banked +
  in-progress overlay). The user explicitly reversed the old
  "league updates at end of gameday" decision.
- Per-player pills were never broken on day 1 — banked totals only move
  at FT by design; that's what the overlay now papers over.

### Fixtures tab (now the app's live hub)

- **`/api/fixtures/scores`** (public): every DB match keyed by nation
  codes; the static-schedule page overlays score/status. Live cards:
  emerald glow + pulsing LIVE badge w/ minute; FT cards show score
  (+pens). Polls 60s only while live.
- **Kickoff countdown** inside final 24h (amber pill, seconds under 1h),
  then pulsing **KICKING OFF** bridge (≤15 min past scheduled) until the
  cron flips it live. Page also polls during a window 1 min before →
  15 min after each kickoff so an open tab discovers the flip without
  reload.
- **Fixture detail modal** (`src/components/fixture-detail-modal.tsx`,
  tap any fixture card): Stats / Lineups / Timeline tabs, tappable +
  swipeable. Venue + referee in ONE muted header line (user wanted it
  subtle). VAR events get a violet chip. Backed by
  `/api/fixtures/[id]/detail` + `Match.detailCache` (JSON envelope
  `{fetchedAt, final, payload}`): by-id API-Football requests bundle
  events+lineups+stats = **1 call per refresh**, TTL 60s live / 5 min
  inside 90-min-pre-kickoff / 60 min before that / **frozen forever at
  FT** (old games cost zero after first open). Momentum graph
  deliberately skipped (API has no equivalent; don't fake it).

### Predicted lineups (admin-entered, FotMob-transcribed)

- `Match.predictedLineups` JSON (additive push applied). Shapes +
  name-matching in **`src/lib/predicted-lineups.ts`**.
- **Modal precedence — VERIFIED by test**: Lineups tab shows the
  predicted XI (amber "PREDICTED XI" banner) ONLY while
  `lineups.length === 0`; official team sheets (~40 min pre-kickoff,
  ≤5 min cache lag) replace it automatically. Test proof:
  `scripts/test-lineup-precedence.ts` (plants a prediction on a
  finished match → payload still leads with officials; restores state).
- **Admin UI is a visual builder** (`/admin/predicted-lineups`, 🔮 card
  on /admin): formation dropdown FIRST (rows redraw), tap slot → search
  picker with PlayerFace headshots (identity-confirm), ANY player in
  ANY slot (out-of-position is real), duplicates impossible, tap filled
  slot to remove, prefills saved predictions for editing, saves exact
  playerIds in pitch order. v1 was typed names — scrapped because away
  FotMob screenshots read bottom-up and entry order silently flipped
  rows (CAN 4-4-2 rendered 4-2-4).
- **Rendering uses formation string + entry order** (rows = [1,
  ...formation parts]), NOT fantasy positions (a DEF-classified
  wing-back used to turn back-threes into back-fives).
- Script path for screenshot transcription:
  `scripts/set-predicted-lineup.ts` (edit INPUT block, dry-run default,
  `--apply`). Fuzzy matcher refuses ambiguity (5 KOR Lees, 2 USA
  Robinsons, 2 PAR Gómezes) — give initials like FotMob prints them.
- State: USA-PAR set (script, verified). CAN-BIH was set via the old
  typed flow with scrambled rows — **user to redo in the builder**.

### Selection-history chips ("did he actually start?")

- `PlayerPerformance.startedMatch Boolean?` (additive). Live cron now
  persists `!games.substitute`; `scripts/backfill-started-match.ts`
  backfilled MEX-RSA + KOR-CZE (idempotent, 1 API call per match).
- `/api/players` returns `lastMatch: {played, started, minutes} | null`
  (latest FINISHED match of the player's nation; null pre-first-game).
- Picker rows (builder + transfer) show: green **"Started 61′"** /
  amber **"Sub 12′"** / gray **"Unused"**. Wording matters: bare
  "✓ 61′" read as "came on at 61" during user testing.
- This is the agreed stand-in for predicted-lineup data dependence:
  facts over guesses from GR2 onward. (Sportmonks sells model-predicted
  XIs if ever wanted — separate paid sub, declined for now.)

### Transfer-mode + sub-flow UX hardening (from live user testing)

- **Queued-out players get violet ring + QUEUED pill** on the transfer
  pitch; tapping explains instead of opening the picker (server always
  rejected double-sells; now the UI prevents the attempt).
- **Played players grey out in sub selection**: `/api/squad/get` returns
  `startedNationCodes` (active stage, kicked-off nations — same gate as
  squad/update); `isSwapValid`/`performSwap` block bench→XI and
  bench-order moves for played players with a SPECIFIC message (was a
  misleading "Invalid formation!" alert).
- **ⓘ info button on picker rows** opens the shared PlayerDetailModal
  readOnly WITHOUT committing the swap. Gotchas hit: needs
  `cursor-pointer` (iOS won't click otherwise) AND must be mounted in
  the transfer-mode render branch — the squad page has THREE separate
  returns (builder / transfer / view); a modal mounted in only one stays
  invisible in the others. New `hideRole` prop hides Role/Capt badges
  (they describe fantasy-squad role; nonsense for un-owned players —
  source of a user confusion incident with Son's "STARTING ROLE").
- **Dashboard staleness fixed**: `/api/team` fetched with
  `cache:'no-store'` + refetch on focus/visibilitychange (free-transfer
  count lagged the queue spend by up to ~40s of SWR cache).
- **Queue rules confirmed live**: queue spends FTs immediately
  (3rd queue attempt correctly blocked at 0 left), cancel refunds, and
  post-round hits ARE charged (`totalPoints: {decrement}` in the same
  transaction — verified in code).

### Live league standings + team-view header

- **`src/lib/live-team-totals.ts # liveTeamDeltas`** — in-progress delta
  per team from isLive perf rows, mirroring banking exactly (starters
  only, captain ×2/×3, bench only on Bench Boost, late-gate excluded).
  `totalPoints + delta` converges to the banked number at FT (no jump).
- Standings rows earning live get pulsing dot + green points; team-view
  header pill shows `liveTotalPoints` w/ green tint. Private leagues use
  the same code path (verified vs prod data;
  `scripts/check-private-league-live.ts`).

### Visual / mobile fixes

- Dream team uses PlayerFace headshots (photoUrl added to API).
- **Native iOS splash screens**: `scripts/generate-splash.ts` → 10
  device-exact PNGs in `public/splash/`, declared via
  `appleWebApp.startupImage`. iOS caches at install — existing
  home-screen users must delete + re-add to see it.
- League table long team names: `min-w-0` + truncate (flex children
  refuse to shrink without min-w-0 — recurring theme, also fixed in
  team-name header + lineup slots).
- Modal heights use **dvh** not vh (iOS vh = largest viewport → bottom
  sheets poked above the visible screen).
- Formation picker dropdown flips left-anchored near the screen edge.
- Lineup slots are flex (shrink, max 56px) so back-fives never clip.
- **16px form fields at phone widths** (globals.css) — kills iOS
  focus-zoom app-wide.
- Fixtures page countdown starts only after mount (no SSR hydration
  mismatch from Date.now()).

### Ops notes

- New Wi-Fi = new IP for phone testing (university net was
  10.216.114.115; home is 192.168.2.25). Firewall rule "Next.js dev
  server (TCP 3000, local subnet only)" added (elevated). Uni networks
  may block phone↔laptop entirely (client isolation).
- `prisma generate` EPERM on the query-engine DLL while `npm run dev`
  is up — stop dev, generate, restart.
- `$HOME` is a read-only PowerShell automatic variable — don't use it
  in test snippets.
- Late-swap forfeit, auto-sub, UEFA-style mid-round sub optionality all
  re-confirmed with user; he's fine with the "free look" meta (matches
  UCL fantasy his friends know).

### Late additions (same session, after the entry above)

- **Predicted→official switch VERIFIED**: `scripts/test-lineup-precedence.ts`
  planted a prediction on finished KOR-CZE → payload still leads with the
  2 official lineups (modal rule `lineups.length===0 && predicted`);
  USA-PAR (no officials) correctly serves predicted. State restored.
- **dvh sweep**: ALL modal max-heights converted vh→dvh (squad pickers,
  PlayerDetailModal, timezone picker, legacy squad-builder). iOS `vh` =
  largest viewport; bottom/center-anchored sheets clipped at the top.
- **Search-popup geometry saga** (three iterations — record so nobody
  repeats it): (1) bottom sheets jumped when TYPING because the sheet
  height was content-driven — each filtered keystroke resized it and iOS
  re-panned. Fix: FIXED height cards (h-[55dvh] / stable inner list).
  (2) top-anchored cards slid UNDER the sticky nav (nav is h-16 + z-50
  and paints above the overlays). (3) Final: cards anchor just below the
  nav — `paddingTop: calc(env(safe-area-inset-top) + 4.5rem)`,
  `items-start sm:items-center`. Applies to the builder picker AND both
  squad-page pickers. No autoFocus (mount-time keyboard pop = pan).
- USA-PAR prediction set + verified via script. CAN-BIH still needs the
  user's redo in the visual builder (old typed entry has scrambled rows).

### Carryover (unchanged)

- Knockout fixtures + REAL knockout deadlines after GR3 (~Jun 27) —
  placeholder deadlines are WRONG (R32 before GR3!).
- FIFA price re-check before GR2 unlock (Jun 18).
- Youssef1820 still has no squad (scores from GR2 onward if he builds).
- Per-matchday routine now: transcribe FotMob predicted XIs into the
  builder (or send screenshots to the assistant), and watch the first
  lineup-drop swap happen on USA-PAR tonight.

---

## Session 2026-06-11 №4 — FIRST LIVE MATCH VERIFIED + strict deadline lockout

**The pipeline works for real.** During MEX-RSA (19:00 UTC kickoff) we
watched the full chain in prod: cron flipped the match LIVE at kickoff,
scores/minutes update every tick, 22 PlayerPerformance rows appeared
~10 min in (API-Football publishes player stats with that much lag —
0 rows in the first minutes is NORMAL, don't panic), and the green pill
showed live on a real user's bench card. 22 users / 22 teams, all
consistent with the global league counter.

### Shipped to prod this session

- **Bench-order fix** (`afe0ee9`): saved sub-priority looked reverted
  after navigating away and back. `/api/squad/get` returns rows in DB
  order and the squad page never sorted by `benchOrder` (the league
  team-view endpoint sorts server-side, which is why IT looked right).
  Now sorted on fetch in `src/app/(dashboard)/squad/page.tsx`.
- **STRICT DEADLINE LOCKOUT** (`09ab8c6`): miss the stage deadline →
  zero points that stage. New nullable `Team.firstSquadSavedAt`
  (additive `prisma db push` already applied to prod), stamped exactly
  once in `/api/squad/save` when the first complete 15 is saved. Both
  gates — banking (`lib/squad-points`: `getLateTeamIds` +
  `loadTeamsForMatch`) and settlement (`lib/stage-settlement`:
  `isLate`) — compare `(firstSquadSavedAt ?? createdAt) >=
  stage.deadlineTime`. The `createdAt` fallback makes every team that
  existed before the column correct with NO backfill. First-time saves
  still bypass the round lock (late joiners can build mid-round, they
  just score nothing until next stage). Live case: `Youssef1820`
  ("Dream FC") never built — 0 squad players, and if he saves now he
  gets stamped late for GR1 automatically.
- **Player modal kickoff time**: NEXT badge now shows the next
  fixture's kickoff (e.g. "Jun 14, 3:00 PM") in the VIEWER's local
  timezone (`toLocaleString`, deliberately not hardcoded EST). New
  `getNextWcFixture()` in `lib/world-cup-fixtures` (returns
  `{opponent, kickoff} | null`); date hidden when a nation has no
  upcoming game (the old `getNextWcOpponent` falls back to the LAST
  opponent there — a date would lie). Chip row has `flex-wrap` +
  `whitespace-nowrap` so it wraps as a unit on phones.
- **User deletion**: `Zaabi` (team "France") removed on request —
  verified sole match, owned no leagues, empty squad. 23 → 22 users; global league membership cascade-deleted
  cleanly. Pattern: copy `scripts/delete-smoke-user.ts`, add safety
  stops (exact id + email match, refuse admins/league owners).
  NOTE: `League.owner` has NO cascade — a user owning a league blocks
  deletion; handle ownership first.

### Rules confirmed (user asked, code verified)

- **Auto-sub is NOT injury-specific**: fires at stage settlement for
  any starter whose nation played but who got 0 minutes (injury,
  benched, whatever). Highest-priority bench player who played, GK for
  GK, formation kept legal, scoring-only, skipped on Bench Boost.
- **Late-swap forfeit** works as designed: subbing out a played player
  mid-round forfeits his banked round points (x2/x3 if armband);
  incoming player scores only his own remaining games.
- **Bench points show on the card but don't count** toward team total
  unless Bench Boost or end-of-round auto-sub promotes them.

### Ops gotchas discovered

- **Vercel webhook silently skipped a deploy.** The lockout push
  produced NO deployment (verified via `npx vercel ls` — no queued/
  building/error entry at all, just nothing). An empty commit
  (`git commit --allow-empty`) re-fired it. After ANY important push,
  confirm a new deployment appears and `npx vercel inspect
  https://world-cup-fantasy-coral.vercel.app` serves it.
- **PowerShell 5.1 + git commit messages**: embedded double quotes
  inside a here-string broke argument passing (`fatal: '3:00' is
  outside repository`). Avoid `"` inside commit messages, or use
  `git commit -F <file>`.
- **No Co-Authored-By trailers in commits** — user preference, applies
  to every commit in this repo.

- **⚠ KNOCKOUT STAGE DEADLINES ARE WRONG PLACEHOLDERS** (R32 =
  Jun 20, BEFORE GR3's Jun 24!). Harmless during groups, but the
  lockout gate compares against `stage.deadlineTime`, so they MUST be
  re-stamped when knockout fixtures are synced after GR3 (~Jun 27) or
  late-joining teams get mis-gated in knockouts.

### Read-only ops scripts (in `scripts/`)

- `live-health-check.ts` — match flags, perf-row flow, late-gate state
  per team. Run during any gameday wobble.
- `audit-users.ts` — every user/team: squad completeness, captain/vice
  counts, benchOrder integrity, unavailable picks, league counters.
- (untracked scratch: `check-late-saves.ts`, `check-mex-rsa-owners.ts`)

### Carryover

- Youssef1820 needs a nudge to build (scores from GR2 onward).
- FIFA price re-check before GR2 unlock (Jun 18) — see scripts section
  in Session №1 below.
- Knockout fixtures + REAL knockout deadlines after GR3.

---

## Session 2026-06-11 №3 — LIVE IN PRODUCTION + flag fix

**The app is live.** Tournament underway, real player base onboarded
in prod (https://world-cup-fantasy-coral.vercel.app), cron firing
every minute. From here on: NO destructive DB operations (no reseeds,
no resets) — every change must be safe against live user data.

- **Flag fix** in `/api/team/[teamId]/squad`: when `nation.flagUrl` is
  null (it always is — nothing ever populates that column), the
  fallback built flagcdn URLs from the raw 3-letter nation code
  (`flagcdn.com/24x18/rsa.png`), which flagcdn doesn't serve (it wants
  ISO-2: `za`, `cv`, `jo`…). Now routed through `getFlagCode()` from
  `src/lib/flags.ts` — the same complete 48-nation mapping every other
  page already uses via `getFlagUrl()`. Affected the leagues
  team-view page only. Code-only change, no DB touched.
- User also reported RSA/CPV/JOR flags transiently missing elsewhere
  in the UI; mapping verified correct, self-healed on reload — almost
  certainly a flagcdn CDN blip, no action taken.

---

## Session 2026-06-11 №2 — TRANSFER SYSTEM PASS (shipped to prod)

User-visible rules now live:
- **Unlimited transfers until first kickoff** (GR1 deadline 19:00 UTC
  Jun 11), shown as **∞** on dashboard + squad page. Root cause of the
  old "still says 2" bug: `/api/transfers` knew the GR1 grace period
  but `/api/squad/get` and `/api/team` had drifted copies that didn't.
  All three now call ONE helper: `src/lib/unlimited-transfers.ts`.
- **Queued mid-round transfers** (NEW). While a round is locked, POST
  /api/transfers no longer 403s — it QUEUES (JSON column
  `Team.pendingTransfers`, additive `prisma db push` already applied).
  Queue spends free transfers immediately, is capped at the remaining
  free-transfer count (no hits mid-round), DELETE /api/transfers
  cancels (body `{playerInId}` or `{all:true}`) with refund.
  Applied automatically inside `lib/stage-advance` at the boundary via
  `lib/pending-transfers.applyPendingTransfers` — re-validates each
  entry, skips+refunds invalid ones, stamps Transfer rows with the NEW
  stage id. Squad page shows a violet "Queued for next round" card
  with per-row Cancel; transfer mode gets a "Next round" pill + banner
  and the confirm button reads "Queue N transfers for next round".
- **Free-transfer banking** (NEW): unused transfers roll over, capped
  at 5 (`lib/transfer-allocation.ts`, pure + unit-tested). Mercy rule
  beats the cap. Allocation table now: GR2 2, GR3 **2** (was 3 —
  user request, eliminations covered by mercy+banking), R32/R16/QF 3,
  SF/3RD/F 2.
- First-time squad saves still bypass the round lock (late joiners can
  build tonight); only re-saves of an existing squad freeze.

Verification: typecheck clean, 198 unit tests pass, 16/16 dashboard
API smoke checks (incl. dream-team/trends/leagues/history), and a NEW
end-to-end harness `scripts/smoke-test-queued-transfers.ts` (17/17):
flips GR1 deadline into the past, exercises queue/cap/cancel/apply
against the real server+DB, then restores the deadline and deletes the
smoke user. Re-run any time the transfer rules change.

Still on the user: rebuild the admin squad before kickoff; verify the
iOS install prompt on a real iPhone.

## Session 2026-06-11 — FIFA OFFICIAL DATA SYNC (applied to prod DB)

The entire player pool was audited against FIFA's own fantasy game
(play.fifa.com — public JSON API) and synced. The DB is now
**100% converged**: every one of FIFA's 1,245 squad players matches one
of ours, 0 position mismatches, 0 price flags.

### What was applied (all via scripts, dry-run first)

- **329 price changes** — everyone ≥£0.7m off FIFA's price after
  quantile-mapping their 3.5–10.5 scale onto our 3.5–14 curve
  (preserves our spread, adopts their rankings). Kane 11→13.5 (joins
  Haaland/Mbappé at top), Ronaldo 10→11; Gyökeres 11→8, Vitinha
  9→6.5, De Bruyne 10→8, Isak 10.5→8.5. Balance verified:
  cheapest XV £55m, triple-premium squad £82.5m fits.
- **136 position fixes** to FIFA's official classification (Kimmich
  MID→DEF, Nico Williams FWD→MID, Kluivert/Summerville FWD→MID …).
  Only 1 squad existed (admin ops) — it broke composition and was
  reset (picks deleted, bank back to £100m). Rebuild before kickoff.
- **6 identity fixes** — rows whose displayName didn't match the player
  their apiFootballId actually is: Mitoma→**H. Ito** (FWD→DEF!),
  Dia→**M. Diaw** (FWD→GK!), Hwang H-C→**Kim Moon-Hwan**,
  K. Rocha→**CJ dos Santos**, Al-Rawabdeh→**I. Sa'deh**, and
  D. Eckert Ayensa→**D. Dargahi** (took Iranian citizenship May 2026).
- **8 cut players** → `isAvailable=false` ("Not in final World Cup
  squad"): Baumgartner, J. Timber, Balerdi, Wesley, Sabra, M. Flores,
  L. Karl, A. Yahya (IRQ).
- **5 additions**: L. Geertruida (NED, 37143), A. Ouédraogo (GER,
  380978), Éderson the BRA MID (10097), Mohammad Taha (JOR, 601853 —
  FIFA mislabels him "Abu Ghoush"), **A. Maknzi (IRQ, apiFootballId
  NULL — not in API-Football; BACKFILL his id from day-of lineups or
  he will never score points)**.
- DB now: **1,253 players, 1,245 available** (= FIFA's playing count),
  prices 3.5–13.5.

### Scripts (all dry-run by default, `--apply` to write)

- `scripts/cross-check-fifa-prices.ts` — the auditor. Downloads needed:
  `scripts/fifa-players.json` + `fifa-squads.json` (refetch from
  `https://play.fifa.com/json/fantasy/players.json` / `squads.json` —
  FIFA updates prices/status between rounds). Writes
  `fifa-cross-check-report.md` + machine-readable `fifa-sync-plan.json`.
  Matching: exact → subset → initial+last → fuzzy → API-Football
  profile assisted (cache: `scripts/.api-profile-cache.json`) →
  leftover pairing. Re-run between rounds to catch FIFA price moves.
- `scripts/apply-fifa-sync.ts` — applies plan prices + cuts, plus
  hardcoded identity fixes + additions. Idempotent (skips existing).
- `scripts/apply-fifa-positions.ts` — applies plan posFixes, detects
  squads broken by composition/formation rules, resets them.
- `scripts/find-api-ids.ts` — scratch helper for hunting API-Football
  ids (profiles search + club/national squads). Reuse for the Maknzi
  backfill.

### Gotchas discovered

- **npx/node "not recognized"** in fresh Claude Code shells on this
  box: the shell inherits a stale PATH copy missing
  `C:\Program Files\nodejs` (it IS in machine PATH). Fix per command:
  `$env:Path = "C:\Program Files\nodejs;$env:Path"; npx ...`
- FIFA's Arabic-name entries chain the full name through `firstName`
  ("Zaid Ismael Khaleel" / lastName "Al Dulaimi") with the usable form
  in `knownName` — match on knownName too.
- FIFA "transferred" status = cut from squad (239 rows). A cut player
  + his replacement look like a rename if you pair leftovers before
  checking transferred rows.

### iPhone / PWA reminders (user-flagged)

- `src/components/ios-install-prompt.tsx` — iOS add-to-home-screen
  prompt; `public/manifest.json` + icons via `scripts/generate-icons.ts`.
  Verify the prompt fires on a real iPhone (Safari, not in-app browser)
  before friends onboard today.
- Pitch background (`src/components/pitch-bg.tsx`) uses SVG
  feTurbulence — **known risk of GPU lag on iPhone Safari**. If a
  friend reports a laggy squad page: bake the noise into a small tiled
  PNG (plan already noted in Session 2026-06-10).
- Phone testing: `npm run dev`, open `http://192.168.2.25:3000` on the
  same Wi-Fi (Windows Firewall inbound rule for TCP 3000 if needed).

---

## Session 2026-06-10 — LAUNCH OPS (all shipped to prod) + UI pass (local)

### Part 1 — Launch ops: DONE and LIVE in production (commit `4a313e7`)

- **Fresh machine setup**: this box had no Node/.env/node_modules (fresh
  clone). Node 24 installed via winget; `.env` rebuilt — NOTE: Vercel
  prod secrets are write-only (pull returns empty), local `.env` is the
  only readable copy. DO NOT LOSE IT.
- **API-Football upgraded to Pro** (7,500/day) on a NEW account
  (21ymsa@queensu.ca). Old free key dead. **Subscription period ends
  Jul 10 — must stay active through the final Jul 19.**
- **Full data sync** (`scripts/sync-from-api-football.ts`, dry-run by
  default, `--apply` to write, caches in `.sync-cache.json`):
  48/48 nations mapped+validated (the old static NATION_TO_API_ID table
  had badly wrong ids), **1,248 players = every official 26-man squad
  with apiFootballId + photoUrl**, 72 group fixtures stamped with API
  fixture ids. KNOCKOUT FIXTURES NOT IN DB YET — sync them after GR3
  (~Jun 27).
- **Launch reset** (`scripts/reset-for-launch.ts`): all users/teams/
  leagues wiped EXCEPT `admin@worldcupfantasy.com` (ops account; owner
  plays on a separate personal account — not yet created). Stale
  unmapped players deleted. GR1 active. Friends re-register fresh.
- **UNLIMITED_TRANSFERS = false** in all 3 routes (transfers, squad/get,
  team).
- **Cron LIVE**: cron-job.org (user's account) hits
  `GET /api/live/update` every 1 min with `Bearer CRON_SECRET`.
  Verified 200s in Vercel logs. Gotcha: setting Vercel env via
  PowerShell stdin pipe appends \r and breaks exact-match auth — use
  `vercel env add NAME production --value $v --yes`. CLI hangs after
  success (telemetry); kill is safe once "Added" prints.
- Prod URL: https://world-cup-fantasy-coral.vercel.app
- Smoke test: `scripts/smoke-test-flow.ts` (register→team→squad→transfer
  against localhost). `scripts/delete-smoke-user.ts` cleans it up.

### Part 2 — Visual polish pass: WORKING TREE / LOCAL ONLY, NOT PUSHED

User was mid-review when session paused. Status:

- **Real player headshots everywhere** — `PlayerFace` component in
  `src/components/kit.tsx`: official API-Football photo framed in
  kit-color gradient + shirt-number chip, falls back to SVG `<Kit>` on
  missing/failed photo. Used by PlayerCard (pitch/bench), squad-builder
  picker rows, sub-priority list, player modal header. `photoUrl` was
  added to `/api/squad/get`, `/api/players` (now supports `?limit=N`),
  `/api/team/[teamId]/squad`, and the relevant page types.
- **EmptySlot** now shows a dark head-and-shoulders silhouette + small
  "+" badge (user-requested, approved direction).
- **PitchBg v3** (`src/components/pitch-bg.tsx`): clean grass, NO
  mowing stripes (user explicitly disliked them), gradient base +
  low-frequency mottling patches + fine grain via SVG feTurbulence.
  AWAITING USER VERDICT on realism. If still not right: try a
  photographic tiled texture. If laggy on iPhone: bake the SVG noise
  into a small tiled PNG (feTurbulence can be GPU-heavy on mobile
  Safari).
- **Landing page**: marquee row of top-6 priciest players with real
  faces (fetches `/api/players?limit=6`), "Kicks Off June 11 · Estadio
  Azteca" line, countdown flips to pulsing "Tournament Live" badge
  after kickoff (2026-06-11T18:00Z).
- **Fixtures page**: grouped under per-day date headers with green
  TODAY badge/ring.
- Login/register/dashboard/history reviewed and intentionally left
  unchanged.
- Typecheck clean; all pages compile in dev.

**Next steps when resuming:**
1. User reviews visuals on desktop + phone
   (dev server: `npm run dev`, phone via http://192.168.2.25:3000 on
   same Wi-Fi; if unreachable, add a Windows Firewall inbound rule for
   TCP 3000).
2. Iterate on grass if needed (see options above).
3. When approved: `git push origin main` (the visual commit is local).
4. User creates personal account + invites friends.
5. WATCH: first real cron-driven live match Jun 11 3pm ET (MEX-RSA).

---

This doc captures the state of the **live scoring + testing** work so the
next session can pick up without re-reading the whole transcript.

---

## Session 2026-05-13 — what changed

If you're picking this up cold, these are the deltas since the previous
handoff entry:

### Late session (night) — ops + validation + UI polish

Shipped in `main` (see git log around `ac740a4` / `cf67c4a`):

- **Production credential rotation** — `JWT_SECRET` and Neon
  `DATABASE_URL` were rotated in Vercel (delete + recreate sensitive
  vars where Edit was unavailable) and mirrored in local `.env`.
  Deploy picked up new values on the next push; all sessions
  invalidated once (expected). `CRON_SECRET` left in place for a
  future cron path.
- **Player modal Stats tile is no longer placeholder zeros**
  (`src/components/player-detail-modal.tsx`, commit `ac740a4`). The
  six tiles (**Goals, Assists, Apps, Minutes, DC, Clean**) are
  **derived client-side** from the same `PlayerPerformance` rows
  already fetched for Match History — no `/api/squad/get` change,
  no extra network call. Pre-WC zeros mean "no perfs yet", not
  hardcoded stubs. `/api/squad/get` still returns legacy
  `passAccuracy` / `tackles` / etc. as zeros for squad payload
  consumers; a cleanup pass can delete those fields later.
- **Real-match engine validation** via `/admin/live-test` (read-only,
  3 API calls per Run Once). Same evening: **Manchester City vs
  Crystal Palace** (API fixture `1379275`, PL) and **Lens vs PSG**
  (`1387952`, Ligue 1), including **FT** snapshots saved locally as
  `live-test-*.json` in the project root — those files are in
  `.gitignore` so they never get committed on accident. Validated
  live: goals/assists, 60+ appearance flip, saves floor-bonus, yellow
  cards, DC cliff at threshold, position-specific CS, on-pitch
  conceded counts, **subs off before 60' + subs on under 60' correctly
  denied CS** (e.g. Nunes/Gvardiol 58', Aké/Doku short minutes).
- **Vercel `crons` block** — attempted and **reverted** on Hobby (see
  below); handoff doc now includes full **Cron re-enable plan**
  (Pro vs external cron vs GH Actions).

- **`<PlayerDetailModal />` is now a shared component**
  (`src/components/player-detail-modal.tsx`). The squad page and the
  league team-view page mount the same modal — same Match History
  panel, same click-to-expand breakdown, same admin Undo. The modal
  owns its own body-scroll lock and the `/api/players/[id]/performances`
  fetch; parents only pass props (player, captaincy, callbacks). A
  `readOnly` prop swaps the Sub / Captain / V-Captain buttons for
  status badges so it works on someone else's team without exposing
  mutating actions.
- **League team-view is fully repurposed**
  (`src/app/(dashboard)/leagues/team/[teamId]/page.tsx`). It now uses
  `@/components/kit#PlayerCard` (same kit + name + points pill as
  /squad) on the pitch and bench, opens the shared modal on tap, and
  paints the captain ×2 / ×3 badge using that team's actual chip
  state — fixes the previous "friend's TC showed ×1" visual bug.
  Polls every 60s while `anyMatchLive`.
- **`/api/team/[teamId]/squad` extended** to return `livePoints` per
  player (PlayerPerformance overlay, mirrors `/api/squad/get`),
  `activeChips`, `tripleCaptainActive`, `benchBoostActive`, and
  `anyMatchLive`. The team-view page is the sole consumer for now;
  no other endpoint depends on the new fields.
- **`/api/players/[id]/performances` parallelized**. Four independent
  reads (player, squadRow, performances, auditLog) are now in a single
  `Promise.all` instead of a serial chain. On Neon's pooler this drops
  cold-modal-open time from ~600-1200ms to ~250-400ms — the modal feels
  ~instant now.
- **Shared helpers**: `fdrPill()` moved into `@/lib/fdr` and
  `getNextWcOpponent()` added to `@/lib/world-cup-fixtures`. Both pages
  now share a single source of truth for FDR colors + next-opponent
  resolution; the squad page still has local equivalents (`fdrPill`
  inside `FdrLegend`, `getNextOpponent`) because deleting them is
  invasive — fine to leave as duplicates that delegate later.
- **League pitch pill-clipping fix**. Previously the green points
  pill sitting above each kit was being chopped off because the
  league page stacked `overflow-x-auto` on BOTH the outer wrapper
  AND each row, and the browser couldn't keep Y visible when X was
  auto on the same element. Fixed by mirroring the squad page exactly:
  single `overflow-x-auto` at the OUTER pitch wrapper with `p-2 sm:p-6`
  padding to absorb the pill, no row-level overflow.

### Gotcha for next session

**Never run `Set-Content -Encoding utf8` against an existing UTF-8
file on Windows PowerShell 5.1.** Get-Content's default codepage on US
locales is Windows-1252, so it mangles every multi-byte UTF-8 sequence
(em-dash, ellipsis, £, etc.) into mojibake (`â€¦`, `Â£`) before the
write back. Earlier this session that corrupted the entire squad page
and we had to `git checkout` the clean version and replay the edits.
Use Node's `fs.readFileSync(p, 'utf8')` + `fs.writeFileSync(p, ..., 'utf8')`
for bulk slicing instead — that respects the file's actual encoding
and round-trips cleanly.

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
- **Player detail modal — extracted into a shared component**
  (`src/components/player-detail-modal.tsx`) consumed by BOTH
  `/squad` and `/leagues/team/[teamId]`:
  - Replaces the old static fixtures table that always showed dashes.
  - Real `PlayerPerformance` rows, sorted newest-first by kickoff,
    fetched via `GET /api/players/[id]/performances` (now parallelized
    server-side — see Session 2026-05-13 notes).
  - Each row clickable → expands inline with the full points breakdown
    (per scoring category) computed server-side from stored stats.
  - Pulsing green LIVE badge on in-progress matches.
  - **Adjustments section** below the table showing recent
    `MANUAL_OVERRIDE_*` audit entries for that player.
  - `readOnly` prop mode for the league team-view: hides Sub/Capt/V-Capt
    buttons, replaces them with status badges, but admin Undo is still
    surfaced (per-row, gated by `isAdmin`).
  - Parent-supplied `onAdjustmentReverted` callback fires after a
    successful undo so the page can re-pull its own squad/team data
    and refresh the per-card pills.
- **League team-view repurposed** (`src/app/(dashboard)/leagues/team/[teamId]/page.tsx`):
  - Uses `@/components/kit#PlayerCard` on the pitch + bench so the
    visual language matches /squad exactly.
  - Mounts the shared `<PlayerDetailModal readOnly />` on tap.
  - Captain badge surfaces `tripleCaptainActive` from this team's chip
    state, so a friend's TC correctly shows ×3 (not ×1, the prior bug).
  - 60s live polling gated by `anyMatchLive`, identical cadence to
    /squad.
- **`/api/team/[teamId]/squad` extended** to return `livePoints` per
  player (`SquadPlayer.points + sum(isLive PlayerPerformance.totalPoints)`),
  `activeChips`, `tripleCaptainActive`, `benchBoostActive`, and
  `anyMatchLive`. Mirrors `/api/squad/get`'s logic exactly so the two
  pages can't drift.
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
- **Cron attempt 2026-05-13 — BLOCKED on Hobby plan.** We tried turning
  the cron on (commit `ef15e4e`) but the deploy failed because Vercel
  Hobby caps cron at **once per day**; `*/2 * * * *` was rejected at
  build time. Reverted in commit `81fe23b`. `CRON_SECRET` is still set
  in Vercel env (Production + Preview) and the auth path in
  `/api/live/update` is verified to accept it, so re-enabling is a
  one-line edit once we pick a path (see "Cron re-enable plan" below).
  In the meantime live updates are driven by the manual
  "Update Live Scores" button on `/admin`, which hits the same route
  via an authenticated admin session.

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
- **Legacy squad payload fields** (`passAccuracy`, `interceptions`,
  `tackles`, `dribbles` on each row from `/api/squad/get`) are still
  all zeros — the modal **no longer reads them** (Stats tile uses
  Match History data inside the modal). Removing the dead fields
  from the API + squad page types is a small cleanup task, not
  blocking.
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
5. **Activate the live-scoring cron** — *blocked on Hobby plan, see
   "Cron re-enable plan" below*. Three options ranked by effort/cost.
   Until one is picked, the only thing driving `/api/live/update` is
   the manual button on `/admin`, so someone has to babysit during
   live matches. Re-enabling cron makes stage advancement fully
   hands-off.

### Tier 2.5 — Finish the Dream Team page

The `/dream-team` page is wired up end-to-end but feels like a stub.
The pitch renders, the stage dropdown works, the API
(`src/app/api/dream-team/route.ts`) does the greedy formation search.
What's missing to make it land:

1. **Top scorers leaderboard** — "players with the most points". The
   page currently shows only the 11 dream-team starters; users want
   to see "who's putting up numbers" beyond the XI. Easiest path:
   the existing API already sorts the top 50 by `_sum.totalPoints`
   in the same query — surface the FULL list (not just the 11
   picked) as a separate "Top Scorers" tab or accordion below the
   pitch. Per-position filter (All / GK / DEF / MID / FWD) would
   pair nicely with the existing stage dropdown.
2. **Dream-team bench (4 subs)** — Fantasy convention is to also
   pick the next-best GK + 3 highest-scoring outfield not in the XI
   so the dream-team mirrors a real squad. Trivially adds 4 more
   `byPos` slice calls inside `selectBestXI`. Render them in the
   existing two-col bench grid (copy the look from the league
   team-view page).
3. **Captain armband + ×2 points multiplier** — pick the
   highest-scoring outfielder, render the gold "C" on their kit
   (the shared `Kit` component already accepts `isCaptain`), bump
   their displayed points to `totalPoints × 2`, and add a "+X
   captain bonus" line to the totals tile. Mirrors how the rest of
   the app communicates captaincy and makes the dream-team total
   apples-to-apples with a player's actual team score.
4. **Clickable player cards → shared modal** — the new
   `<PlayerDetailModal readOnly />` (`src/components/player-detail-modal.tsx`)
   is ready to drop in. Each kit + bench card becomes an `onClick`
   target; modal opens with `readOnly`, isStarting + isCaptain
   wired from the dream-team payload. Re-uses the per-match
   breakdown + admin Undo machinery for free.
5. **Aggregate stats tile** — strip above the pitch showing
   "Top scorer · Most assists · Most clean sheets · Most DCs" for
   the selected stage. The data is already in `PlayerPerformance`
   (groupBy `playerId` with `_sum` on `goals` / `assists` /
   `cleanSheet` / `defensiveActions`). Cheap to add to the existing
   API in a single extra `groupBy` round-trip OR fold into the
   current `groupBy` by changing it to `_sum: { totalPoints: true,
   goals: true, assists: true, cleanSheet: true, defensiveActions: true }`.
6. **Your XI vs Dream XI comparison** — small tile at the bottom
   showing the user's actual stage points vs the dream XI's total
   (`dream - you = X points missed`). Requires also fetching the
   user's own `Team.totalPoints` (or per-stage `TeamStage` row once
   that snapshot is populated — see Tier 1 item 2 above).
7. **Live polling** — when `anyMatchLive`, repoll every 60s. The
   API already aggregates from `PlayerPerformance` so live perfs
   are included automatically; the page just needs the same
   `anyMatchLive` signal that `/squad` and `/leagues` already use.
   Easiest path: extend the dream-team endpoint response with
   `anyMatchLive: boolean` (a cheap `match.count({ where:
   isStarted: true, isFinished: false })`), then mirror the
   `setInterval(tick, 60_000)` loop from the league team-view.
8. **Encoding note** — when editing `src/app/(dashboard)/dream-team/page.tsx`
   on Windows, follow the same rule as everywhere else: use Node
   or the IDE for non-ASCII edits (the pitch may want a ⭐ in the
   header — that's a 3-byte UTF-8 sequence that PowerShell 5.1
   will mangle if you go near it with `Set-Content`).

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
- `src/app/(dashboard)/squad/page.tsx` — squad page (modal lives in
  shared component now)
- `src/app/(dashboard)/leagues/team/[teamId]/page.tsx` — read-only
  league team-view that mounts the same modal in `readOnly` mode
- `src/components/player-detail-modal.tsx` — shared modal w/ Match
  History, breakdown, admin Undo. Owns its own performances fetch.
- `src/app/api/squad/get/route.ts` — own-team fetch w/ livePoints
- `src/app/api/team/[teamId]/squad/route.ts` — other-team fetch w/
  livePoints + chips + anyMatchLive (mirrors squad/get)
- `src/app/api/players/[id]/performances/route.ts` — per-match
  breakdown, parallelized (Promise.all of four reads)
- `src/lib/fdr.ts` — `fdrPill()` + `getFixtureDifficulty()` (shared)
- `src/lib/world-cup-fixtures.ts` — `getNextWcOpponent()` + fixtures

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
- **Re-enable the live-scoring cron** (see plan below).
- **Optional**: backfill legacy MANUAL_OVERRIDE_* rows into
  `Team.totalPoints` so even pre-fix overrides show up in
  /admin/users + league standings. Only relevant if there are
  historical overrides we want to preserve rather than undo.

---

## Cron re-enable plan (pre-WC final push)

`/api/live/update` is wired and verified, `CRON_SECRET` is already set
in Vercel env, but Vercel **Hobby cron is capped at once per day** so
`*/2 * * * *` fails at deploy time. Pick ONE of these before WC kickoff
on Jun 11, 2026.

### Option A — Vercel Pro upgrade (recommended for the WC)

**Cost**: $20/mo per member.
**Effort**: 2 minutes.
**Why this is the right answer for the WC**: it's the closest setup to
production-grade and stays inside the same dashboard for logs,
function timings, and rate-limit observability. Per Vercel's
[Cron Jobs Usage & Pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)
docs, Pro gets per-minute scheduling precision.

Steps:
1. vercel.com → project → Settings → Plan → upgrade to Pro.
2. Re-add the cron block to `vercel.json`:
   ```json
   "crons": [
     { "path": "/api/live/update", "schedule": "*/2 * * * *" }
   ]
   ```
3. `git push origin main`. Within 2 minutes you'll see invocations in
   Logs (filter Function = `/api/live/update`).

That's it. `CRON_SECRET` is already set, the auth path was already
proven by the manual curl smoke test during the 2026-05-13 session.

### Option B — External cron service (free, decent reliability)

**Cost**: $0.
**Effort**: ~5 minutes.
**Service**: [cron-job.org](https://cron-job.org) (free tier supports
1-minute intervals, 50 jobs per account). Alternatives:
[EasyCron](https://www.easycron.com) (5-min free tier),
[Upstash QStash](https://upstash.com/docs/qstash) (free 500 msgs/day).

Steps (cron-job.org):
1. Sign up at cron-job.org (free).
2. **Create cronjob**:
   - Title: `Fantasy LaLiGa live update`
   - URL: `https://YOUR_VERCEL_URL/api/live/update`
   - Schedule: Every 2 minutes (their UI has a preset; or cron `*/2 * * * *`)
   - Request method: GET
3. **Advanced → Headers** → add:
   - Header name: `Authorization`
   - Header value: `Bearer YOUR_CRON_SECRET` (paste the exact value
     stored in Vercel's `CRON_SECRET` env var)
4. **Notifications**: enable failure notifications to your email so
   you find out fast if API-Football is down or the route 500s.
5. Save → toggle to "Enabled".

Verification: wait 2 minutes, check the job's "History" tab on
cron-job.org for 200 responses, and cross-check Vercel Function logs.

### Option C — GitHub Actions scheduled workflow (free, lower precision)

**Cost**: $0 (within free GH Actions minutes on public repo; this repo
is public per the git remote).
**Effort**: ~3 minutes.
**Caveat**: GH Actions docs explicitly warn that scheduled workflows
may be delayed during high load, and the minimum effective interval is
~5 minutes. Acceptable for live points (a 60s pill poll on the
frontend smooths over a 5-min cron) but worse than Option A or B.

Steps:
1. In GitHub repo → Settings → Secrets and variables → Actions → New
   repository secret. Name: `CRON_SECRET`. Value: same as the Vercel
   env var.
2. Add a second secret `VERCEL_URL` = `https://YOUR_VERCEL_URL` (no
   trailing slash).
3. Create `.github/workflows/live-update-cron.yml`:
   ```yaml
   name: Live update cron
   on:
     schedule:
       - cron: '*/5 * * * *'  # GH minimum reliable interval
     workflow_dispatch:        # allow manual trigger from Actions tab
   jobs:
     ping:
       runs-on: ubuntu-latest
       steps:
         - name: Hit /api/live/update
           run: |
             curl -fsS \
               -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
               "${{ secrets.VERCEL_URL }}/api/live/update"
   ```
4. Commit + push. The workflow runs automatically every ~5 minutes,
   and you can trigger it manually from the Actions tab as a sanity
   check.

### Decision deadline

Pick one **at least 24 hours before WC kickoff** so the cron logs at
least one full overnight cycle of no-op runs (confirming the route
stays cheap when no match is live). Earlier is better — Option A is a
2-minute change so even day-of works in a pinch, but B and C want
half-a-day of bake time to catch any auth/header bugs.

### Validation checklist (any option)

Before declaring cron production-ready:

- [ ] First cron invocation visible in Vercel Function logs.
- [ ] `curl -H "Authorization: Bearer $CRON_SECRET" $URL/api/live/update`
      from your laptop returns 200. (Tests the same auth path the cron
      service uses; if your curl works, theirs will too.)
- [ ] With no live match in the DB, invocations return quickly
      (~< 1s) and `playersUpdated` is 0 for every match. This confirms
      the no-op-when-idle behavior is healthy and quota cost ≈ 0.
- [ ] Trigger a live match via `/admin/match-simulator` (Go LIVE +
      Tick). Within 2 min (Pro) / 2 min (cron-job.org) / 5 min (GH
      Actions), the cron should be writing `PlayerPerformance` rows
      and the `/squad` pill should reflect them.
- [ ] Run `/admin/live-test` once to capture API-Football rate-limit
      headroom; with cron at 2-min intervals you'll burn ~720 calls/day
      when matches are live (Pro plan API-Football is 7,500/day).
