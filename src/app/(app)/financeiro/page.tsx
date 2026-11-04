import type { Metadata } from "next";
import Link from "next/link";
import { Wallet } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatCurrency, formatDate } from "@/lib/format";
import { listOpenInstallments } from "@/server/finance/finance-queries";
import { resolveInstallmentStatus } from "@/server/finance/calculations";

export const metadata: Metadata = { title: "Financeiro" };

export default async function FinancePage() {
  await requirePermission(PERMISSIONS.FINANCE_VIEW);

  const installments = await listOpenInstallments();
  const now = new Date();

  const rows = installments.map((installment) => {
    const balance = Number(installment.expectedAmount) - Number(installment.paidAmount);
    const status = resolveInstallmentStatus(
      {
        expectedAmount: installment.expectedAmount,
        paidAmount: installment.paidAmount,
        dueDate: installment.dueDate,
        status: installment.status,
      },
      now,
    );
    return { installment, balance, status };
  });

  const totalOpen = rows.reduce((acc, row) => acc + row.balance, 0);
  const overdue = rows.filter((row) => row.status === "OVERDUE");
  const totalOverdue = overdue.reduce((acc, row) => acc + row.balance, 0);
  const next30 = rows.filter(
    (row) =>
      row.status !== "OVERDUE" &&
      row.installment.dueDate <= new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
  );
  const totalNext30 = next30.reduce((acc, row) => acc + row.balance, 0);

  return (
    <div>
      <PageHeader
        title="Financeiro"
        help="financeiro"
        description="Contas a receber geradas pelas parcelas dos contratos."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total em aberto"
          value={formatCurrency(totalOpen)}
          hint={`${rows.length} parcela(s)`}
          icon={Wallet}
        />
        <StatCard
          label="Vencido"
          value={formatCurrency(totalOverdue)}
          hint={`${overdue.length} parcela(s)`}
          tone={totalOverdue > 0 ? "negative" : "default"}
        />
        <StatCard
          label="Vence em 30 dias"
          value={formatCurrency(totalNext30)}
          hint={`${next30.length} parcela(s)`}
          tone="warning"
        />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Contas a receber</CardTitle>
          <CardDescription>
            Registre o recebimento em Transações para abater a parcela automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {rows.length === 0 ? (
            <div className="px-6">
              <EmptyState
                title="Nada em aberto"
                description="Todas as parcelas dos contratos ativos estão quitadas."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Contrato</TableHead>
                  <TableHead>Parcela</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Previsto</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ installment, balance, status }) => (
                  <TableRow key={installment.id}>
                    <TableCell>
                      <Link
                        href={`/clientes/${installment.contract.customer.id}`}
                        className="hover:underline"
                      >
                        {installment.contract.customer.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {installment.contract.code}
                    </TableCell>
                    <TableCell>
                      {installment.label ?? `Parcela ${installment.number}`}
                    </TableCell>
                    <TableCell>{formatDate(installment.dueDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(installment.expectedAmount)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCurrency(balance)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
