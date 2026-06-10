import { prisma } from './db';

// Squad-lock state for the active stage. The deadline lives on the Stage
// row (set 1 hour before the stage's first kickoff). Between the deadline
// and the moment maybeAdvanceStage() rolls to the next stage, lineups,
// transfers and (existing-squad) saves are frozen. When the next stage
// activates, its deadline is in the future again and everything unlocks.
export interface StageLock {
  stage: { id: string; stageId: string; name: string; deadlineTime: Date | null } | null;
  locked: boolean;
}

export async function getStageLock(): Promise<StageLock> {
  const stage = await prisma.stage.findFirst({
    where: { isActive: true },
    select: { id: true, stageId: true, name: true, deadlineTime: true },
  });
  if (!stage?.deadlineTime) return { stage, locked: false };
  return { stage, locked: new Date() >= stage.deadlineTime };
}

export const LOCKED_ERROR =
  'Squads are locked while this round is being played. You can make changes again once the round finishes.';
