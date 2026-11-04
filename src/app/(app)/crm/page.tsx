import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { SearchInput } from "@/components/common/search-input";
import { CrmView } from "@/features/crm/components/crm-view";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission, requirePermission } from "@/lib/auth/session";
import { getKanbanBoard } from "@/server/crm/crm-service";

export const metadata: Metadata = { title: "CRM" };

export default async function CrmPage({ searchParams }: PageProps<"/crm">) {
  const user = await requirePermission(PERMISSIONS.CRM_VIEW);
  const canManage = hasPermission(user, PERMISSIONS.CRM_MANAGE);

  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search : undefined;
  const onlyOverdue = params.overdue === "1";

  const columns = await getKanbanBoard({ search, onlyOverdue });
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
          </div>
        }
      />

      {totalCards === 0 ? (
        <EmptyState
          title="Nenhum card no Kanban"
          description="Vendas de serviços de maior valor criam cards automaticamente. Consultas não geram card."
        />
      ) : (
        <CrmView columns={columns} canManage={canManage} />
      )}
    </div>
  );
}
