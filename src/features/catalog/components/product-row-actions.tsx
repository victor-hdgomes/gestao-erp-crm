"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmActionDialog } from "@/components/common/confirm-action-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProductDialog, type ProductFormValues } from "@/features/catalog/components/product-dialog";
import { archiveProductAction } from "@/server/catalog/catalog-actions";

export function ProductRowActions({ product }: { product: ProductFormValues }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleArchive() {
    startTransition(async () => {
      const result = await archiveProductAction(product.id!);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Serviço arquivado.");
      setConfirmOpen(false);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" aria-label="Ações do serviço">
              <MoreHorizontal className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="size-4" />
            Arquivar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ProductDialog product={product} open={editOpen} onOpenChange={setEditOpen} />

      <ConfirmActionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Arquivar “${product.name}”?`}
        description="O serviço deixa de aparecer em novas vendas. As vendas já registradas continuam intactas."
        confirmPhrase={product.name}
        confirmLabel="Arquivar serviço"
        pending={isPending}
        onConfirm={handleArchive}
      />
    </>
  );
}
