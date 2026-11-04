import type { NextRequest } from "next/server";

import { withIntegration } from "@/server/integrations/api-context";
import { createContractFromLeona } from "@/server/integrations/leona-handlers";

export async function POST(request: NextRequest) {
  return withIntegration(request, "contract.create", async (payload) => {
    const result = await createContractFromLeona(payload);
    return { status: result.created ? 201 : 200, body: result };
  });
}
