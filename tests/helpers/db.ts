import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

export const testPrisma = new PrismaClient({ adapter });

/** Removes only the rows created by a test run, keeping the seed intact. */
export async function cleanupByPrefix(prefix: string): Promise<void> {
  const customers = await testPrisma.customer.findMany({
    where: { name: { startsWith: prefix } },
    select: { id: true },
  });
  const customerIds = customers.map((customer) => customer.id);
  if (customerIds.length === 0) return;

  await testPrisma.transactionAllocation.deleteMany({
    where: { transaction: { customerId: { in: customerIds } } },
  });
  await testPrisma.transaction.deleteMany({ where: { customerId: { in: customerIds } } });
  await testPrisma.crmStageHistory.deleteMany({
    where: { card: { customerId: { in: customerIds } } },
  });
  await testPrisma.crmCard.deleteMany({ where: { customerId: { in: customerIds } } });
  await testPrisma.serviceExecution.deleteMany({ where: { customerId: { in: customerIds } } });
  await testPrisma.installment.deleteMany({
    where: { contract: { customerId: { in: customerIds } } },
  });
  await testPrisma.document.deleteMany({ where: { customerId: { in: customerIds } } });
  await testPrisma.contract.deleteMany({ where: { customerId: { in: customerIds } } });
  await testPrisma.saleItem.deleteMany({ where: { sale: { customerId: { in: customerIds } } } });
  await testPrisma.sale.deleteMany({ where: { customerId: { in: customerIds } } });
  await testPrisma.customer.deleteMany({ where: { id: { in: customerIds } } });
}

/** Generates a syntactically valid CPF, so validation is exercised for real. */
export function makeCpf(seed: number): string {
  const base = String(seed).padStart(9, "0").slice(-9).split("").map(Number);

  const digit = (digits: number[], weightStart: number) => {
    const sum = digits.reduce(
      (acc, value, index) => acc + value * (weightStart - index),
      0,
    );
    const remainder = (sum * 10) % 11;
    return remainder === 10 || remainder === 11 ? 0 : remainder;
  };

  const first = digit(base, 10);
  const second = digit([...base, first], 11);
  return [...base, first, second].join("");
}
