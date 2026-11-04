"use client";

import { useState } from "react";

import {
  CardDrawer,
  type DrawerFinanceOptions,
  type DrawerStage,
} from "@/features/crm/components/card-drawer";
import { KanbanBoard } from "@/features/crm/components/kanban-board";
import type { KanbanColumn } from "@/server/crm/crm-service";

export function CrmView({
  columns,
  canManage,
  stages,
  finance,
}: {
  columns: KanbanColumn[];
  canManage: boolean;
  stages: DrawerStage[];
  finance: DrawerFinanceOptions | null;
}) {
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  return (
    <>
      <KanbanBoard columns={columns} canManage={canManage} onOpenCard={setOpenCardId} />
      <CardDrawer
        cardId={openCardId}
        onClose={() => setOpenCardId(null)}
        canManage={canManage}
        stages={stages}
        finance={finance}
      />
    </>
  );
}
