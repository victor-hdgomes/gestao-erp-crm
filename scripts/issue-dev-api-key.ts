/**
 * Issues an API key for local testing of the integration endpoints.
 * Prints the token once; only its hash is stored.
 *
 *   npx tsx scripts/issue-dev-api-key.ts "Leona Flow local"
 */
import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const name = process.argv[2] ?? "Leona Flow local";
  const prefix = `lf_${randomBytes(4).toString("hex")}`;
  const token = `${prefix}.${randomBytes(32).toString("base64url")}`;

  await prisma.apiKey.create({
    data: {
      name,
      provider: "LEONA_FLOW",
      prefix,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      scopes: [],
    },
  });

  console.log(token);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
