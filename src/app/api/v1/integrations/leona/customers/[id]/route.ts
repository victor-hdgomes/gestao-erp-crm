import type { NextRequest } from "next/server";

import { withIntegrationRead } from "@/server/integrations/api-context";
import { getCustomerForLeona } from "@/server/integrations/leona-handlers";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return withIntegrationRead(request, async () => ({
    body: await getCustomerForLeona(id),
  }));
}
