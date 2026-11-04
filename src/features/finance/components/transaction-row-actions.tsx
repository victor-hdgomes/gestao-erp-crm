"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, MoreHorizontal, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmActionDialog } from "@/components/common/confirm-action-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { reverseTransactionAction } from "@/server/finance/finance-actions";

type TransactionRowActionsProps = {
  transaction: { id: string; code: string; status: string };
};

export function TransactionRowActions({ transaction }: TransactionRowActionsProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"CANCELLED" | "REFUNDED" | null>(null);
  const [isPending, startTransition] = useTransition();

  const closed = transaction.status === "CANCELLED" || transaction.status === "REFUNDED";

  function confirm(reason: string) {
    if (!mode) return;
    startTransition(async () => {
      const result = await reverseTransactionAction(transaction.id, mode, reason);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(mode === "CANCELLED" ? "Transação cancelada." : "Transação estornada.");
      setMode(null);
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" aria-label="Ações da transação">
              <MoreHorizontal className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={closed} onClick={() => setMode("CANCELLED")}>
            <Ban className="size-4" />
            Cancelar
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            disabled={closed}
            onClick={() => setMode("REFUNDED")}
          >
            <Undo2 className="size-4" />
            Estornar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmActionDialog
        open={mode !== null}
        onOpenChange={(open) => !open && setMode(null)}
        title={`${mode === "CANCELLED" ? "Cancelar" : "Estornar"} ${transaction.code}?`}
        description="As alocações são marcadas como revertidas e as parcelas voltam a ficar em aberto. O histórico financeiro é preservado."
        confirmPhrase={transaction.code}
        confirmLabel={mode === "CANCELLED" ? "Cancelar transação" : "Estornar transação"}
        reasonLabel="Motivo"
        reasonRequired
        pending={isPending}
        onConfirm={confirm}
      />
    </>
  );
}
