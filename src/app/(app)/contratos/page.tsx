import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
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
import { formatCurrency, formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { summarizeContract } from "@/server/finance/calculations";
import { toInstallmentLike } from "@/server/finance/transactions";

export const metadata: Metadata = { title: "Contratos" };

export default async function ContractsPage() {
  await requirePermission(PERMISSIONS.CONTRACT_VIEW);

  const contracts = await prisma.contract.findMany({
    where: { deletedAt: null },
    orderBy: { startDate: "desc" },
    include: {
      customer: { select: { id: true, name: true } },
      installments: { orderBy: { number: "asc" } },
    },
  });

  return (
    <div>
      <PageHeader
        title="Contratos"
        help="contratos"
        description={`${contracts.length} contrato(s) registrados.`}
      />

      {contracts.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum contrato"
          description="Contratos nascem das vendas de serviços com plano de pagamento."
        />
      ) : (
        <Card className="py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead className="text-center">Parcelas</TableHead>
                  <TableHead className="text-right">Contratado</TableHead>
                  <TableHead className="text-right">Recebido</TableHead>
                  <TableHead className="text-right">Pendente</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map((contract) => {
                  const summary = summarizeContract(
                    contract.installments.map(toInstallmentLike),
                  );
                  return (
                    <TableRow key={contract.id}>
                      <TableCell className="font-mono text-xs">{contract.code}</TableCell>
                      <TableCell>
                        <Link
                          href={`/clientes/${contract.customer.id}`}
                          className="hover:underline"
                        >
                          {contract.customer.name}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-60 truncate">{contract.title}</TableCell>
                      <TableCell>{formatDate(contract.startDate)}</TableCell>
                      <TableCell className="text-center tabular-nums">
                        {summary.paidInstallmentCount}/{summary.installmentCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(summary.total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(summary.received)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(summary.pending)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={contract.status} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
