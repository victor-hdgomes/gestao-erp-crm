import type { NextRequest } from "next/server";

import { withIntegrationRead } from "@/server/integrations/api-context";
import { listServicesForLeona } from "@/server/integrations/leona-handlers";

export async function GET(request: NextRequest) {
  return withIntegrationRead(request, async () => ({
    body: await listServicesForLeona(),
  }));
}
