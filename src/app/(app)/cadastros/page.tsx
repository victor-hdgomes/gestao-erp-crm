import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { LookupManager, type LookupRow } from "@/features/lookups/components/lookup-manager";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission, requirePermission } from "@/lib/auth/session";
import {
  archiveDocumentTypeAction,
  archiveTransactionCategoryAction,
  createDocumentTypeAction,
  createExpenseCategoryAction,
  createIncomeCategoryAction,
  updateDocumentTypeAction,
  updateTransactionCategoryAction,
} from "@/server/lookups/lookups-actions";
import {
  countDocumentsByType,
  countTransactionsByCategory,
  listDocumentTypes,
  listTransactionCategories,
} from "@/server/lookups/lookups-service";

export const metadata: Metadata = { title: "Cadastros" };

export default async function LookupsPage() {
  const user = await requirePermission(PERMISSIONS.SETTINGS_VIEW);
  const canManageFinance = hasPermission(user, PERMISSIONS.FINANCE_MANAGE);
  const canManageDocuments = hasPermission(user, PERMISSIONS.DOCUMENT_MANAGE);

  const [categories, documentTypes] = await Promise.all([
    listTransactionCategories({ includeInactive: true }),
    listDocumentTypes({ includeInactive: true }),
  ]);

  const [categoryUsage, typeUsage] = await Promise.all([
    countTransactionsByCategory(categories.map((category) => category.id)),
    countDocumentsByType(documentTypes.map((type) => type.id)),
  ]);

  const toRow = (
    row: { id: string; name: string; isActive: boolean; isSystem: boolean },
    usage: Map<string, number>,
  ): LookupRow => ({
    id: row.id,
    name: row.name,
    isActive: row.isActive,
    isSystem: row.isSystem,
    usageCount: usage.get(row.id) ?? 0,
  });

  const incomeCategories = categories
    .filter((category) => category.kind === "INCOME")
    .map((category) => toRow(category, categoryUsage));
  const expenseCategories = categories
    .filter((category) => category.kind === "EXPENSE")
    .map((category) => toRow(category, categoryUsage));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Cadastros"
        help="cadastros"
        description="As listas que alimentam os formulários do sistema."
      />

      <div className="space-y-6">
        <LookupManager
          title="Categorias de receita"
          description="Separam a origem do dinheiro que entra: serviço, consulta, outra coisa."
          noun="a categoria"
          usageLabel="Lançamentos"
          rows={incomeCategories}
          canManage={canManageFinance}
          onCreate={createIncomeCategoryAction}
          onUpdate={updateTransactionCategoryAction}
          onArchive={archiveTransactionCategoryAction}
        />

        <LookupManager
          title="Categorias de despesa"
          description="Agrupam o que sai do caixa e alimentam o gráfico do dashboard."
          noun="a categoria"
          usageLabel="Lançamentos"
          rows={expenseCategories}
          canManage={canManageFinance}
          onCreate={createExpenseCategoryAction}
          onUpdate={updateTransactionCategoryAction}
          onArchive={archiveTransactionCategoryAction}
        />

        <LookupManager
          title="Tipos de documento"
          description="Como os arquivos e links do cliente são classificados."
          noun="o tipo"
          usageLabel="Documentos"
          rows={documentTypes.map((type) => toRow(type, typeUsage))}
          canManage={canManageDocuments}
          onCreate={createDocumentTypeAction}
          onUpdate={updateDocumentTypeAction}
          onArchive={archiveDocumentTypeAction}
        />
      </div>
    </div>
  );
}
