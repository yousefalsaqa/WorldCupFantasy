// Retroactive squad correction (owner's chimbohimbo team): swap Cucurella
// for Porro as if it happened before SF started. Per the established
// pattern: no Transfer row, no free-transfer cost, no hit — direct
// SquadPlayer swap with bank/value conserved via the price delta.
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

function roundPrice(n: number) { return Math.round(n * 10) / 10; }

async function main() {
  const team = await prisma.team.findFirst({ where: { name: 'chimbohimbo' }, select: { id: true, bankBalance: true, teamValue: true } });
  if (!team) throw new Error('chimbohimbo not found');

  const outPlayer = await prisma.player.findFirst({ where: { displayName: { contains: 'Cucurella', mode: 'insensitive' } }, select: { id: true, displayName: true, position: true, currentPrice: true } });
  const inPlayer = await prisma.player.findFirst({ where: { displayName: { contains: 'Porro', mode: 'insensitive' } }, select: { id: true, displayName: true, position: true, currentPrice: true } });
  if (!outPlayer) throw new Error('Cucurella not found');
  if (!inPlayer) throw new Error('Porro not found');
  console.log('OUT:', outPlayer);
  console.log('IN:', inPlayer);

  if (outPlayer.position !== inPlayer.position) {
    console.log(`POSITION MISMATCH: ${outPlayer.position} vs ${inPlayer.position} — aborting, need explicit confirmation.`);
    return;
  }

  const squadRow = await prisma.squadPlayer.findFirst({ where: { teamId: team.id, playerId: outPlayer.id } });
  if (!squadRow) { console.log('Cucurella not on chimbohimbo squad'); return; }

  const alreadyOwnsPorro = await prisma.squadPlayer.findFirst({ where: { teamId: team.id, playerId: inPlayer.id } });
  if (alreadyOwnsPorro) { console.log('Porro already on squad — aborting'); return; }

  console.log('squadRow before:', squadRow);
  console.log('team bank/value before:', team.bankBalance, team.teamValue);

  const netDelta = roundPrice(inPlayer.currentPrice - squadRow.purchasePrice);

  const updatedSquadRow = await prisma.squadPlayer.update({
    where: { id: squadRow.id },
    data: { playerId: inPlayer.id, purchasePrice: inPlayer.currentPrice },
  });

  const updatedTeam = await prisma.team.update({
    where: { id: team.id },
    data: {
      bankBalance: roundPrice(team.bankBalance - netDelta),
      teamValue: roundPrice(team.teamValue + netDelta),
    },
  });

  await prisma.auditLog.create({
    data: {
      action: 'ADMIN_RETROACTIVE_SQUAD_CORRECTION',
      userId: null,
      details: JSON.stringify({
        reason: 'swap Cucurella for Porro for chimbo as if he did it before SF started',
        teamId: team.id,
        teamName: 'chimbohimbo',
        outPlayer: { id: outPlayer.id, name: outPlayer.displayName, purchasePrice: squadRow.purchasePrice },
        inPlayer: { id: inPlayer.id, name: inPlayer.displayName, purchasePrice: inPlayer.currentPrice },
        netDelta,
        bankBefore: team.bankBalance,
        bankAfter: updatedTeam.bankBalance,
        teamValueBefore: team.teamValue,
        teamValueAfter: updatedTeam.teamValue,
      }),
    },
  });

  console.log('squadRow after:', updatedSquadRow);
  console.log('team bank/value after:', updatedTeam.bankBalance, updatedTeam.teamValue);
}
main().catch(console.error).finally(() => prisma.$disconnect());
