// Amends the prior retroactive Kounde->Porro correction for Micho's Bichos:
// the owner now wants it to cost 1 free transfer, like a real transfer would.
// The squad swap itself already happened (scripts/swap-kounde-porro-michobichos.ts);
// this only adds the missing pieces: a real Transfer row (isFreeTransfer=true,
// stageId=SF) and the freeTransfers decrement.
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const team = await prisma.team.findFirst({ where: { name: 'Micho’s Bichos' }, select: { id: true, freeTransfers: true } });
  if (!team) throw new Error('team not found');

  const sf = await prisma.stage.findFirst({ where: { stageId: 'SF' }, select: { id: true } });
  if (!sf) throw new Error('SF stage not found');

  const kounde = await prisma.player.findFirst({ where: { displayName: { contains: 'Kound', mode: 'insensitive' } }, select: { id: true, displayName: true } });
  const porro = await prisma.player.findFirst({ where: { displayName: { contains: 'Porro', mode: 'insensitive' } }, select: { id: true, displayName: true, currentPrice: true } });
  if (!kounde || !porro) throw new Error('player lookup failed');

  console.log('freeTransfers before:', team.freeTransfers);

  const transfer = await prisma.transfer.create({
    data: {
      teamId: team.id,
      stageId: sf.id,
      playerInId: porro.id,
      playerOutId: kounde.id,
      priceIn: porro.currentPrice,
      priceOut: 5.1, // Kounde's purchase price at time of swap
      isFreeTransfer: true,
      isMercyTransfer: false,
      isWildcard: false,
    },
  });

  const newFreeTransfers = Math.max(0, team.freeTransfers - 1);
  const updatedTeam = await prisma.team.update({
    where: { id: team.id },
    data: { freeTransfers: newFreeTransfers },
  });

  await prisma.auditLog.create({
    data: {
      action: 'ADMIN_RETROACTIVE_TRANSFER_CHARGE',
      userId: null,
      details: JSON.stringify({
        reason: 'amend prior Kounde->Porro correction for Micho’s Bichos to cost 1 free transfer instead of being free',
        teamId: team.id,
        teamName: 'Micho’s Bichos',
        transferId: transfer.id,
        freeTransfersBefore: team.freeTransfers,
        freeTransfersAfter: updatedTeam.freeTransfers,
      }),
    },
  });

  console.log('Transfer row created:', transfer);
  console.log('freeTransfers after:', updatedTeam.freeTransfers);
}
main().catch(console.error).finally(() => prisma.$disconnect());
