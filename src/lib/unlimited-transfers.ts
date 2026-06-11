// ============================================
// Single source of truth for "are transfers unlimited right now?"
//
// Previously this logic was copy-pasted across /api/transfers,
// /api/squad/get and /api/team and the copies drifted: the transfers
// route knew about the GR1 grace period (free tinkering until the first
// whistle of the tournament) but squad/get and team did not, so the
// dashboard kept showing "2 free transfers" before kickoff while the API
// would happily accept twenty.
//
// Unlimited when:
//   a) no stage is active (pre-tournament), or
//   b) the active stage is GR1 and its deadline (= first kickoff) hasn't
//      passed — everyone can rebuild freely until the tournament starts, or
//   c) an unlimited-transfer chip (Wildcard 1/2, Free Hit) is active for
//      this team in the active stage.
//
// NEVER unlimited while the stage is locked (round in progress): in that
// window transfers are QUEUED for the next round and capped at the
// remaining free-transfer count — see /api/transfers + lib/pending-transfers.
// ============================================

import { prisma } from './db';
import {
  parseActiveChips,
  hasUnlimitedTransferChip,
  type ChipType,
} from './chips-active';

export async function computeUnlimitedTransfers(teamId: string): Promise<boolean> {
  const activeStage = await prisma.stage.findFirst({
    where: { isActive: true },
    select: { id: true, stageId: true, deadlineTime: true },
  });
  if (!activeStage) return true; // pre-tournament

  const locked = activeStage.deadlineTime
    ? new Date() >= activeStage.deadlineTime
    : false;
  if (locked) return false; // round in progress → queue rules apply

  if (activeStage.stageId === 'GR1') return true; // pre-tournament grace

  const teamStage = await prisma.teamStage.findUnique({
    where: { teamId_stageId: { teamId, stageId: activeStage.id } },
    select: { chipsUsed: true, chipUsed: true },
  });
  let activeChips = parseActiveChips(teamStage?.chipsUsed);
  if (activeChips.length === 0 && teamStage?.chipUsed) {
    activeChips = [teamStage.chipUsed as ChipType];
  }
  return hasUnlimitedTransferChip(activeChips);
}
