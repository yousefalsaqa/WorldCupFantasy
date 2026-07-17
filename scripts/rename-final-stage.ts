import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const updated = await prisma.stage.update({ where: { stageId: 'F' }, data: { name: '3rd Place & Final' } });
  console.log(updated);
}
main().catch(console.error).finally(() => prisma.$disconnect());
