import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { PeriodFilter } from "@/components/common/period-filter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { resolvePeriod, toInputDate } from "@/lib/period";
import { buildReport, REPORT_LABELS, type ReportKey } from "@/server/reports/reports-service";

export const metadata: Metadata = { title: "Relatórios" };

const REPORT_KEYS = Object.keys(REPORT_LABELS) as ReportKey[];

export default async function ReportsPage({ searchParams }: PageProps<"/relatorios">) {
  await requirePermission(PERMISSIONS.REPORT_VIEW);

  const params = await searchParams;
  const asString = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const report = (asString(params.report) ?? "sales") as ReportKey;
  const key = REPORT_KEYS.includes(report) ? report : "sales";

  const period = resolvePeriod({
    preset: asString(params.preset) ?? "thisMonth",
    from: asString(params.from),
    to: asString(params.to),
  });

  const table = await buildReport(key, period);

  const exportQuery = new URLSearchParams({
    report: key,
    preset: asString(params.preset) ?? "thisMonth",
    from: toInputDate(period.from),
    to: toInputDate(period.to),
  });

  return (
    <div>
      <PageHeader
        title="Relatórios"
        help="relatorios"
        description="Consulte e exporte os dados operacionais e financeiros."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PeriodFilter
              from={toInputDate(period.from)}
              to={toInputDate(period.to)}
              preset={period.preset}
            />
            <Button
              variant="outline"
              nativeButton={false}
              render={<a href={`/api/reports/export?${exportQuery.toString()}`} />}
            >
              <Download className="size-4" />
              Exportar CSV
            </Button>
          </div>
        }
      />

      <nav className="mb-4 flex flex-wrap gap-1">
        {REPORT_KEYS.map((item) => (
          <Link
            key={item}
            href={{ pathname: "/relatorios", query: { ...params, report: item } }}
            className={
              item === key
                ? "bg-secondary text-secondary-foreground rounded-md px-3 py-1.5 text-sm font-medium"
                : "hover:bg-muted rounded-md border px-3 py-1.5 text-sm"
            }
          >
            {REPORT_LABELS[item]}
          </Link>
        ))}
      </nav>

      {table.rows.length === 0 ? (
        <EmptyState
          title="Sem dados no período"
          description="Ajuste o período ou escolha outro relatório."
        />
      ) : (
        <Card className="py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  {table.columns.map((column) => (
                    <TableHead key={column}>{column}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.rows.map((row, index) => (
                  <TableRow key={index}>
                    {row.map((cell, cellIndex) => (
                      <TableCell key={cellIndex} className="whitespace-nowrap">
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
