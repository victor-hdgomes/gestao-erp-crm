import type { Metadata } from "next";
import Link from "next/link";
import { Pencil } from "lucide-react";

import { CopyField } from "@/components/common/copy-field";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
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
import { hasPermission, requirePermission } from "@/lib/auth/session";
import { formatCurrency, formatDate } from "@/lib/format";
import { moneyToString } from "@/lib/money";
import { resolveInstallmentStatus } from "@/server/finance/calculations";
import { getSaleDetails } from "@/server/sales/sales-queries";

export const metadata: Metadata = { title: "Venda" };

export default async function SaleDetailsPage({ params }: PageProps<"/vendas/[id]">) {
  const user = await requirePermission(PERMISSIONS.SALE_VIEW);
  const canManage = hasPermission(user, PERMISSIONS.SALE_MANAGE);

  const { id } = await params;
  const { sale, contractSummaries, directReceived } = await getSaleDetails(id);

  // A consultation has no contract: the money sits on the sale itself.
  const received =
    contractSummaries.reduce(
      (acc, entry) => acc + Number(entry.summary.received.toFixed(2)),
      0,
    ) + Number(directReceived.toFixed(2));
  const pending =
    contractSummaries.length > 0
      ? contractSummaries.reduce(
          (acc, entry) => acc + Number(entry.summary.pending.toFixed(2)),
          0,
        )
      : Math.max(0, Number(sale.total) - Number(directReceived.toFixed(2)));

  return (
    <div>
      <PageHeader
        title={`Venda ${sale.code}`}
        description={`${sale.customer.name} · ${formatDate(sale.soldAt)}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={sale.status} />
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/clientes/${sale.customer.id}`} />}
            >
              Ver cliente
            </Button>
            {canManage && sale.status !== "CANCELLED" ? (
              <Button nativeButton={false} render={<Link href={`/vendas/${sale.id}/editar`} />}>
                <Pencil className="size-4" />
                Editar
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total da venda" value={formatCurrency(sale.total)} />
        <StatCard label="Recebido" value={formatCurrency(received)} tone="positive" />
        <StatCard
          label="Pendente"
          value={formatCurrency(pending)}
          tone={pending > 0 ? "warning" : "default"}
        />
        <StatCard label="Desconto" value={formatCurrency(sale.discount)} />
      </div>

      <Card className="mt-6 py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Serviço</TableHead>
                <TableHead className="text-center">Qtd.</TableHead>
                <TableHead className="text-right">Valor unitário</TableHead>
                <TableHead className="text-right">Desconto</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sale.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.description}</TableCell>
                  <TableCell className="text-center tabular-nums">{item.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(item.unitPrice)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(item.discount)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(item.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {contractSummaries.map(({ contract, summary }) => (
        <Card key={contract.id} className="mt-4">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">
                  Contrato {contract.code} — {contract.title}
                </CardTitle>
                <CardDescription>
                  {summary.installmentCount} parcela(s) · próximo vencimento em{" "}
                  {summary.nextDueDate ? formatDate(summary.nextDueDate) : "—"}
                </CardDescription>
              </div>
              <StatusBadge status={contract.status} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <CopyField
                label="Valor contratado"
                value={formatCurrency(summary.total)}
                copyValue={moneyToString(summary.total)}
              />
              <CopyField
                label="Entrada"
                value={formatCurrency(contract.installments[0]?.expectedAmount ?? 0)}
                copyValue={moneyToString(contract.installments[0]?.expectedAmount ?? 0)}
              />
              <CopyField
                label="Valor final"
                value={formatCurrency(
                  contract.installments[contract.installments.length - 1]?.expectedAmount ?? 0,
                )}
                copyValue={moneyToString(
                  contract.installments[contract.installments.length - 1]?.expectedAmount ?? 0,
                )}
              />
              <CopyField
                label="Data de cobrança final"
                value={formatDate(
                  contract.installments[contract.installments.length - 1]?.dueDate ?? null,
                )}
              />
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Parcela</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Previsto</TableHead>
                  <TableHead className="text-right">Recebido</TableHead>
                  <TableHead>Transações</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contract.installments.map((installment) => (
                  <TableRow key={installment.id}>
                    <TableCell>
                      {installment.label ?? `Parcela ${installment.number}`}
                    </TableCell>
                    <TableCell>{formatDate(installment.dueDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(installment.expectedAmount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(installment.paidAmount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {installment.allocations
                        .map((allocation) => allocation.transaction.code)
                        .join(", ") || "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={resolveInstallmentStatus(installment)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {contractSummaries.length === 0 && sale.allocations.length > 0 ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Recebimentos</CardTitle>
            <CardDescription>
              Esta venda não tem contrato: o valor foi recebido direto na venda.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transação</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Liquidação</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sale.allocations.map((allocation) => (
                  <TableRow key={allocation.id}>
                    <TableCell className="font-mono text-xs">
                      {allocation.transaction.code}
                    </TableCell>
                    <TableCell>{allocation.transaction.description}</TableCell>
                    <TableCell>{formatDate(allocation.transaction.settledAt)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(allocation.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {sale.notes ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-line">{sale.notes}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
