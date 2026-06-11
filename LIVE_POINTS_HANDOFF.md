# Live Points Feature — Handoff

Last updated: 2026-06-11 (**WE ARE LIVE** — tournament kicked off,
real users have squads in prod; see Session 2026-06-11 №3)

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
