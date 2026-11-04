import type { NextRequest } from "next/server";

import { withIntegration } from "@/server/integrations/api-context";
import { createSaleFromLeona } from "@/server/integrations/leona-handlers";

export async function POST(request: NextRequest) {
  return withIntegration(request, "sale.create", async (payload) => {
    const result = await createSaleFromLeona(payload);
    return { status: result.created ? 201 : 200, body: result };
  });
}
