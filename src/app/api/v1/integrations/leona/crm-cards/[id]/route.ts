import type { NextRequest } from "next/server";

import { withIntegration } from "@/server/integrations/api-context";
import { updateCardFromLeona } from "@/server/integrations/leona-handlers";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return withIntegration(request, "crm.card.update", async (payload) => ({
    body: await updateCardFromLeona(id, payload),
  }));
}
