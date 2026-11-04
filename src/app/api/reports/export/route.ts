import type { NextRequest } from "next/server";

import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { handleApiError } from "@/lib/api/response";
import { resolvePeriod, toInputDate } from "@/lib/period";
import {
  buildReport,
  REPORT_LABELS,
  toCsv,
  type ReportKey,
} from "@/server/reports/reports-service";

export async function GET(request: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.REPORT_VIEW);

    const params = request.nextUrl.searchParams;
    const requested = params.get("report") ?? "sales";
    const key = (Object.keys(REPORT_LABELS) as ReportKey[]).includes(requested as ReportKey)
      ? (requested as ReportKey)
      : "sales";

    const period = resolvePeriod({
      preset: params.get("preset"),
      from: params.get("from"),
      to: params.get("to"),
    });

    const csv = toCsv(await buildReport(key, period));
    // Local dates, so the filename matches the period the user picked.
    const filename = `${key}-${toInputDate(period.from)}-a-${toInputDate(period.to)}.csv`;

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
