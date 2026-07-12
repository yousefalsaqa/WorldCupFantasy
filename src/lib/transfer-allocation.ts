// ============================================
// Free-transfer allocation math (pure — no Prisma)
//
// Unused free transfers BANK between rounds: when a stage closes, the new
// allocation = leftover + the entering stage's base allocation, capped so
// a hoarder can't stockpile unlimited moves (FPL caps at 5; we mirror it).
//
// The mercy rule still applies on top: if a team has more eliminated
// players than the banked total, they get exactly enough transfers to
// replace every eliminated player (uncapped — the cap must never trap a
// user with dead squad slots).
//
// Kept prisma-free so scripts/test-stage-advance.ts can exercise the real
// production math without a database.
// ============================================

export const FREE_TRANSFER_BANK_CAP = 5;

export interface NextAllocation {
  freeTransfers: number;
  // Extra transfers granted by the mercy rule beyond the banked total
  // (0 when the rule didn't fire). Stamped on TeamStage for history.
  mercyTransfers: number;
}

export function computeNextFreeTransfers(opts: {
  /** Unused free transfers carried out of the closing stage (incl. refunds for queued transfers that couldn't apply). */
  leftover: number;
  /** Base allocation for the stage being entered (TRANSFERS_FOR_STAGE). */
  baseAllocation: number;
  eliminatedCount: number;
  mercyEnabled: boolean;
  /**
   * SF-only rule: mercy transfers STACK on top of the banked total instead
   * of just replacing it when eliminatedCount > banked. Field halves to 4
   * nations at SF, so eliminations are much more likely to bite mid-banking
   * — additive mercy guarantees every eliminated player gets replaced
   * without eating into the banked allocation. Uncapped, same as normal
   * mercy.
   */
  additiveMercy?: boolean;
}): NextAllocation {
  const banked = Math.min(
    FREE_TRANSFER_BANK_CAP,
    Math.max(0, opts.leftover) + opts.baseAllocation,
  );
  if (opts.mercyEnabled && opts.additiveMercy && opts.eliminatedCount > 0) {
    return {
      freeTransfers: banked + opts.eliminatedCount,
      mercyTransfers: opts.eliminatedCount,
    };
  }
  if (opts.mercyEnabled && opts.eliminatedCount > banked) {
    return {
      freeTransfers: opts.eliminatedCount,
      mercyTransfers: opts.eliminatedCount - banked,
    };
  }
  return { freeTransfers: banked, mercyTransfers: 0 };
}
