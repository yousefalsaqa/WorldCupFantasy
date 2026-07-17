// Shared by the public landing page and the authenticated dashboard: both
// show a compact, stage-grouped strip of real matches from
// /api/fixtures/scores. One source of truth for "what goes in the ticker."

export interface TickerFixture {
  id: string;
  home: string;
  away: string;
  kickoff: string;
  homeScore: number | null;
  awayScore: number | null;
  isStarted: boolean;
  isFinished: boolean;
  stageId: string;
  stageOrder: number;
}

// Sorted by stage first so same-stage matches stay contiguous — the ticker
// then renders one stage label per group ("QF" · "SF") instead of a flat,
// undifferentiated stream.
export function buildTicker(matches: TickerFixture[]): TickerFixture[] {
  if (matches.length === 0) return [];
  const sorted = [...matches].sort(
    (a, b) => a.stageOrder - b.stageOrder || new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime(),
  );
  const now = Date.now();
  const live = sorted.filter((m) => m.isStarted && !m.isFinished);
  if (live.length > 0) {
    const liveStageOrder = live[0].stageOrder;
    const rest = sorted.filter((m) => m.stageOrder >= liveStageOrder && !(m.isStarted && !m.isFinished));
    return [...live, ...rest].slice(0, 12);
  }
  const upcoming = sorted.filter((m) => !m.isStarted && new Date(m.kickoff).getTime() > now);
  if (upcoming.length > 0) {
    const nextStageOrder = upcoming[0].stageOrder;
    return sorted.filter((m) => m.stageOrder >= nextStageOrder).slice(0, 12);
  }
  // Nothing live or upcoming (tail end of the tournament) — show the last
  // two completed stages in FULL (not an arbitrary count that could cut a
  // stage's matches in half), most recent stage first, newest match first
  // within each stage.
  const finished = sorted.filter((m) => m.isFinished);
  const stageOrders = Array.from(new Set(finished.map((m) => m.stageOrder))).sort((a, b) => a - b);
  const lastTwo = stageOrders.slice(-2).reverse();
  return lastTwo.flatMap((so) =>
    finished
      .filter((m) => m.stageOrder === so)
      .sort((a, b) => new Date(b.kickoff).getTime() - new Date(a.kickoff).getTime()),
  );
}

export function formatKickoff(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
