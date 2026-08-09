import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";

// Positions in drawdown funds created before capital calls existed were
// recorded as fully funded at subscription time. That was never true: a
// drawdown fund calls capital over its life. Restate each such position's
// funded amount as the sum of capital actually received against it.
//
// Continuous vehicles are left alone — for those, committed and funded really
// do coincide at the close.
const prisma = new PrismaClient();

async function main() {
  const positions = await prisma.position.findMany({
    include: { fund: { select: { structure: true, name: true } }, callAllocations: true },
  });

  let restated = 0;
  for (const p of positions) {
    if (p.fund.structure === "continuous") continue;

    const received = p.callAllocations.reduce(
      (sum, a) => sum.add(a.amountPaid),
      new Prisma.Decimal(0)
    );
    if (new Prisma.Decimal(p.fundedAmount).equals(received)) continue;

    await prisma.position.update({
      where: { id: p.id },
      data: { fundedAmount: received },
    });
    console.log(
      `  ${p.fund.name}: funded ${p.fundedAmount} → ${received.toString()} (of ${p.commitmentAmount} committed)`
    );
    restated++;
  }
  console.log(`Restated ${restated} drawdown position(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
