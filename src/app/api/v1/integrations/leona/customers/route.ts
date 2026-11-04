import type { NextRequest } from "next/server";

import { withIntegration } from "@/server/integrations/api-context";
import { upsertCustomerFromLeona } from "@/server/integrations/leona-handlers";

export async function POST(request: NextRequest) {
  return withIntegration(request, "customer.upsert", async (payload) => {
    const result = await upsertCustomerFromLeona(payload);
    return { status: result.created ? 201 : 200, body: result };
  });
}
