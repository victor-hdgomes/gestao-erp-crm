"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/common/field";
import { CurrencyInput } from "@/components/common/currency-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  createProductAction,
  updateProductAction,
  type ProductOption,
} from "@/server/catalog/catalog-actions";

export type ProductFormValues = {
  id?: string;
  name: string;
  description: string;
  category: string;
  kind: "CONSULTATION" | "SERVICE" | "OTHER";
  defaultPrice: string;
  defaultCost: string;
  allowCustomPrice: boolean;
  createsCrmCard: boolean;
  isActive: boolean;
};

const EMPTY: ProductFormValues = {
  name: "",
  description: "",
  category: "",
  kind: "SERVICE",
  defaultPrice: "0.00",
  defaultCost: "0.00",
  allowCustomPrice: true,
  createsCrmCard: true,
  isActive: true,
};

const KIND_LABEL: Record<ProductFormValues["kind"], string> = {
  CONSULTATION: "Consulta (ticket baixo, sem card no CRM)",
  SERVICE: "Serviço (gera contrato e card no CRM)",
  OTHER: "Outro",
};

type ProductDialogProps = {
  product?: ProductFormValues;
  trigger?: React.ReactNode;
  /** Controlled mode: used by the row actions menu, which owns the open state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Lets a caller such as the sale form use the new service right away. */
  onCreated?: (product: ProductOption) => void;
};

export function ProductDialog({
  product,
  trigger,
  open: controlledOpen,
  onOpenChange,
  onCreated,
}: ProductDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const [values, setValues] = useState<ProductFormValues>(product ?? EMPTY);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});

    startTransition(async () => {
      const payload = {
        ...values,
        description: values.description || null,
        category: values.category || null,
      };

      const result = product?.id
        ? await updateProductAction(product.id, payload)
        : await createProductAction(payload);

      if (!result.success) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }

      toast.success(product?.id ? "Serviço atualizado." : "Serviço cadastrado.");
      if (!product?.id) {
        onCreated?.(result.data as ProductOption);
        setValues(EMPTY);
      }
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setValues(product ?? EMPTY);
      }}
    >
      {isControlled ? null : (
        <DialogTrigger
          render={
            (trigger as React.ReactElement) ?? (
              <Button>
                <Plus className="size-4" />
                Novo serviço
              </Button>
            )
          }
        />
      )}
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-lg">
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>{product?.id ? "Editar serviço" : "Novo serviço"}</DialogTitle>
            <DialogDescription>
              Preços e custos são referências: a venda pode ajustar o valor quando permitido.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="-mx-1 min-h-0 px-1">
              <div className="grid gap-4 pb-1">
              <Field label="Nome" htmlFor="name" required error={errors.name}>
                <Input
                  id="name"
                  value={values.name}
                  onChange={(event) => set("name", event.target.value)}
                  placeholder="Serviço de regularização"
                />
              </Field>

              <Field label="Descrição" htmlFor="description" error={errors.description}>
                <Textarea
                  id="description"
                  rows={2}
                  value={values.description}
                  onChange={(event) => set("description", event.target.value)}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Categoria" htmlFor="category" error={errors.category}>
                  <Input
                    id="category"
                    value={values.category}
                    onChange={(event) => set("category", event.target.value)}
                    placeholder="Regularização"
                  />
                </Field>

                <Field label="Tipo" error={errors.kind}>
                  <Select
                    value={values.kind}
                    onValueChange={(value) => {
                      const kind = value as ProductFormValues["kind"];
                      set("kind", kind);
                      set("createsCrmCard", kind === "SERVICE");
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(KIND_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Preço padrão" htmlFor="price" required error={errors.defaultPrice}>
                  <CurrencyInput
                    id="price"
                    value={values.defaultPrice}
                    onValueChange={(value) => set("defaultPrice", value)}
                  />
                </Field>

                <Field label="Custo padrão" htmlFor="cost" error={errors.defaultCost}>
                  <CurrencyInput
                    id="cost"
                    value={values.defaultCost}
                    onValueChange={(value) => set("defaultCost", value)}
                  />
                </Field>
              </div>

              <div className="space-y-3 rounded-md border p-3">
                <ToggleRow
                  label="Permitir preço personalizado na venda"
                  checked={values.allowCustomPrice}
                  onCheckedChange={(value) => set("allowCustomPrice", value)}
                />
                <ToggleRow
                  label="Gerar card no CRM ao vender"
                  checked={values.createsCrmCard}
                  onCheckedChange={(value) => set("createsCrmCard", value)}
                />
                <ToggleRow
                  label="Serviço ativo"
                  checked={values.isActive}
                  onCheckedChange={(value) => set("isActive", value)}
                />
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
