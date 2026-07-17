import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const s = await prisma.stage.findFirst({ where: { stageId: 'F' } });
  console.log(s);
}
main().catch(console.error).finally(() => prisma.$disconnect());
