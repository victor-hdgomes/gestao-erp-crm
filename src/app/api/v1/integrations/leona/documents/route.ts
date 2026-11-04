import type { NextRequest } from "next/server";

import { withIntegration } from "@/server/integrations/api-context";
import { createDocumentFromLeona } from "@/server/integrations/leona-handlers";

export async function POST(request: NextRequest) {
  return withIntegration(request, "document.create", async (payload) => {
    const result = await createDocumentFromLeona(payload);
    return { status: result.created ? 201 : 200, body: result };
  });
}
