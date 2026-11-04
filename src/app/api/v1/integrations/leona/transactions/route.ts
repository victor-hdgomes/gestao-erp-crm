import type { NextRequest } from "next/server";

import { withIntegration } from "@/server/integrations/api-context";
import { createTransactionFromLeona } from "@/server/integrations/leona-handlers";

export async function POST(request: NextRequest) {
  return withIntegration(request, "transaction.create", async (payload) => ({
    status: 201,
    body: await createTransactionFromLeona(payload),
  }));
}
