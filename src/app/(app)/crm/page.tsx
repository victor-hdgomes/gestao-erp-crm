import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { SearchInput } from "@/components/common/search-input";
import { CrmView } from "@/features/crm/components/crm-view";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission, requirePermission } from "@/lib/auth/session";
import { getKanbanBoard } from "@/server/crm/crm-service";
import { listStages } from "@/server/crm/stages-service";
import { listPaymentMethods } from "@/server/catalog/catalog-service";
import { listTransactionCategories } from "@/server/lookups/lookups-service";
import {
  listContractsForSelect,
  listOpenSalesForSelect,
} from "@/server/finance/finance-queries";
import { moneyToString } from "@/lib/money";

export const metadata: Metadata = { title: "CRM" };

export default async function CrmPage({ searchParams }: PageProps<"/crm">) {
  const user = await requirePermission(PERMISSIONS.CRM_VIEW);
  const canManage = hasPermission(user, PERMISSIONS.CRM_MANAGE);

  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search : undefined;
  const onlyOverdue = params.overdue === "1";

  const [columns, stages] = await Promise.all([
    getKanbanBoard({ search, onlyOverdue }),
    listStages(),
  ]);

  // O painel do card lança transação sem sair do quadro, então as listas que o
  // diálogo precisa vêm junto — mas só para quem pode mexer.
  const finance = canManage
    ? await (async () => {
        const [paymentMethods, expenseCategories, incomeCategories, contracts, openSales] =
          await Promise.all([
            listPaymentMethods(),
            listTransactionCategories({ kind: "EXPENSE" }),
            listTransactionCategories({ kind: "INCOME" }),
            listContractsForSelect(),
            listOpenSalesForSelect(),
          ]);

        return {
          paymentMethods: paymentMethods.map((method) => ({
            id: method.id,
            name: method.name,
          })),
          expenseCategories: expenseCategories.map((category) => ({
            id: category.id,
            name: category.name,
          })),
          incomeCategories: incomeCategories.map((category) => ({
            id: category.id,
            name: category.name,
          })),
          contracts: contracts.map((contract) => ({
            id: contract.id,
            code: contract.code,
            title: contract.title,
            customer: contract.customer,
            installments: contract.installments.map((installment) => ({
              id: installment.id,
              number: installment.number,
              label: installment.label,
              dueDate: installment.dueDate.toISOString(),
              expectedAmount: moneyToString(installment.expectedAmount),
              paidAmount: moneyToString(installment.paidAmount),
              status: installment.status,
            })),
          })),
          openSales: openSales.map((sale) => ({
            id: sale.id,
            code: sale.code,
            title: sale.title,
            balance: sale.balance.toFixed(2),
            customer: sale.customer,
          })),
        };
      })()
    : null;
  const totalCards = columns.reduce((acc, column) => acc + column.totals.count, 0);

  return (
    <div>
      <PageHeader
        title="CRM / Kanban"
        help="crm"
        description="Execução dos serviços contratados. Os valores vêm direto do financeiro."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput placeholder="Buscar cliente ou CPF" className="w-full sm:w-72" />
            <Link
              href={onlyOverdue ? "/crm" : "/crm?overdue=1"}
              className={
                onlyOverdue
                  ? "bg-secondary text-secondary-foreground rounded-md px-3 py-1.5 text-sm font-medium"
                  : "hover:bg-muted rounded-md border px-3 py-1.5 text-sm"
              }
            >
              Só inadimplentes
            </Link>
            {canManage ? (
              <Link
                href="/cadastros"
                className="hover:bg-muted rounded-md border px-3 py-1.5 text-sm"
              >
                Editar etapas
              </Link>
            ) : null}
          </div>
        }
      />

      {totalCards === 0 ? (
        <EmptyState
          title="Nenhum card no Kanban"
          description="Vendas de serviços de maior valor criam cards automaticamente. Consultas não geram card."
        />
      ) : (
        <CrmView
          columns={columns}
          canManage={canManage}
          stages={stages.map((stage) => ({ id: stage.id, name: stage.name }))}
          finance={finance}
        />
      )}
    </div>
  );
}
