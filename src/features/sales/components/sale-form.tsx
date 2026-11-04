"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { CurrencyInput } from "@/components/common/currency-input";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ProductDialog } from "@/features/catalog/components/product-dialog";
import { CustomerPicker } from "@/features/customers/components/customer-picker";
import {
  InstallmentPlanner,
  type InstallmentDraft,
  type PaymentMethodOption,
} from "@/features/sales/components/installment-planner";
import { formatCurrency } from "@/lib/format";
import { toInputDate } from "@/lib/period";
import type { CustomerOption } from "@/server/customers/customers-actions";
import { createSaleAction, updateSaleAction } from "@/server/sales/sales-actions";

export type ProductOption = {
  id: string;
  name: string;
  kind: "CONSULTATION" | "SERVICE" | "OTHER";
  defaultPrice: string;
  defaultCost: string;
  allowCustomPrice: boolean;
};

const NEW_PRODUCT = "__new_product__";

type ItemDraft = {
  productId: string;
  quantity: number;
  unitPrice: string;
  unitCost: string;
  discount: string;
};

/** An existing sale loaded into the form so it can be corrected. */
export type SaleFormInitial = {
  id: string;
  customer: CustomerOption;
  soldAt: string;
  discount: string;
  notes: string;
  items: ItemDraft[];
  withContract: boolean;
  contractTitle: string;
  contractUrl: string;
  installments: InstallmentDraft[];
};

type SaleFormProps = {
  products: ProductOption[];
  paymentMethods: PaymentMethodOption[];
  recentCustomers: CustomerOption[];
  initial?: SaleFormInitial;
};

export function SaleForm({
  products,
  paymentMethods,
  recentCustomers,
  initial,
}: SaleFormProps) {
  const router = useRouter();
  const today = toInputDate(new Date());
  const editing = Boolean(initial);

  const [customer, setCustomer] = useState<CustomerOption | null>(initial?.customer ?? null);
  const [soldAt, setSoldAt] = useState(initial?.soldAt ?? today);
  const [discount, setDiscount] = useState(initial?.discount ?? "0.00");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [items, setItems] = useState<ItemDraft[]>(initial?.items ?? []);
  const [withContract, setWithContract] = useState(initial ? initial.withContract : true);
  const [contractTitle, setContractTitle] = useState(initial?.contractTitle ?? "");
  const [installments, setInstallments] = useState<InstallmentDraft[]>(
    initial?.installments ?? [
      { label: "Pagamento único", dueDate: today, amount: "0.00", paymentMethodId: null },
    ],
  );
  const [generator, setGenerator] = useState({
    count: Math.max(1, initial?.installments.length ?? 2),
    downPayment: "0.00",
    firstDueDate: initial?.installments[0]?.dueDate ?? today,
    intervalDays: 30,
  });
  const [contractUrl, setContractUrl] = useState(initial?.contractUrl ?? "");
  const [newProductOpen, setNewProductOpen] = useState(false);
  // Services created from this form, listed until the page revalidates.
  const [createdProducts, setCreatedProducts] = useState<ProductOption[]>([]);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  const catalog = useMemo(
    () => [...products, ...createdProducts.filter((p) => !products.some((o) => o.id === p.id))],
    [products, createdProducts],
  );

  const productById = useMemo(
    () => new Map(catalog.map((product) => [product.id, product])),
    [catalog],
  );

  const subtotal = items.reduce(
    (acc, item) =>
      acc + Number(item.unitPrice || "0") * item.quantity - Number(item.discount || "0"),
    0,
  );
  const total = Math.max(0, subtotal - Number(discount || "0"));

  const requiresContract = items.some(
    (item) => productById.get(item.productId)?.kind === "SERVICE",
  );

  function addItem(productId: string | null) {
    if (!productId) return;
    const product = productById.get(productId);
    if (!product) return;
    setItems((current) => [
      ...current,
      {
        productId,
        quantity: 1,
        unitPrice: product.defaultPrice,
        unitCost: product.defaultCost,
        discount: "0.00",
      },
    ]);
  }

  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setItems((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});

    if (!customer) {
      toast.error("Selecione o cliente.");
      return;
    }
    if (items.length === 0) {
      toast.error("Adicione ao menos um item.");
      return;
    }

    const useContract = withContract || requiresContract;

    if (useContract) {
      const planned = installments.reduce((acc, item) => acc + Number(item.amount || "0"), 0);
      if (Math.abs(planned - total) >= 0.005) {
        toast.error("A soma das parcelas precisa fechar com o valor total da venda.");
        return;
      }
    }

    const payload = {
      soldAt: new Date(`${soldAt}T12:00:00`),
        discount,
        notes: notes || null,
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          unitCost: item.unitCost,
          discount: item.discount,
        })),
        contract: useContract
          ? {
              title: contractTitle || undefined,
              startDate: new Date(`${soldAt}T12:00:00`),
              documentUrl: contractUrl.trim() || null,
              installments: installments.map((installment) => ({
                label: installment.label || null,
                dueDate: new Date(`${installment.dueDate}T12:00:00`),
                amount: installment.amount,
                paymentMethodId: installment.paymentMethodId,
                notes: null,
              })),
            }
          : undefined,
    };

    startTransition(async () => {
      const result = initial
        ? await updateSaleAction(initial.id, payload)
        : await createSaleAction({ ...payload, customerId: customer.id });

      if (!result.success) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }

      toast.success(initial ? "Venda atualizada." : "Venda registrada.");
      router.push(`/vendas/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Dados da venda</CardTitle>
          <CardDescription>
            Uma venda registra o valor contratado. O dinheiro entra pelas transações.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Cliente"
            required={!editing}
            error={errors.customerId}
            hint={editing ? "O cliente de uma venda já registrada não muda." : undefined}
            className="sm:col-span-2"
          >
            {editing ? (
              <Input value={customer?.name ?? ""} readOnly />
            ) : (
              <CustomerPicker
                value={customer}
                onChange={setCustomer}
                initialOptions={recentCustomers}
              />
            )}
          </Field>
          <Field label="Data da venda" htmlFor="soldAt" required error={errors.soldAt}>
            <Input
              id="soldAt"
              type="date"
              value={soldAt}
              onChange={(event) => setSoldAt(event.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Itens</CardTitle>
              <CardDescription>Serviços comercializados nesta venda.</CardDescription>
            </div>
            <Select
              value=""
              onValueChange={(value) => {
                if (value === NEW_PRODUCT) {
                  setNewProductOpen(true);
                  return;
                }
                addItem(value);
              }}
            >
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue>
                  <span className="flex items-center gap-1.5">
                    <Plus className="size-4" />
                    Adicionar serviço
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {catalog.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name} — {formatCurrency(product.defaultPrice)}
                  </SelectItem>
                ))}
                <SelectSeparator />
                <SelectItem value={NEW_PRODUCT}>
                  <Plus className="size-4" />
                  Cadastrar novo serviço
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 ? (
            <p className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
              Nenhum item adicionado.
            </p>
          ) : (
            items.map((item, index) => {
              const product = productById.get(item.productId);
              return (
                <div
                  key={`${item.productId}-${index}`}
                  className="grid items-end gap-2 rounded-md border p-2 sm:grid-cols-[1fr_90px_150px_150px_auto]"
                >
                  <Field label="Serviço">
                    <Input value={product?.name ?? ""} readOnly />
                  </Field>
                  <Field label="Qtd.">
                    <Input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(event) =>
                        updateItem(index, { quantity: Number(event.target.value) || 1 })
                      }
                    />
                  </Field>
                  <Field label="Valor unitário">
                    <CurrencyInput
                      value={item.unitPrice}
                      disabled={product ? !product.allowCustomPrice : false}
                      onValueChange={(value) => updateItem(index, { unitPrice: value })}
                    />
                  </Field>
                  <Field label="Desconto">
                    <CurrencyInput
                      value={item.discount}
                      onValueChange={(value) => updateItem(index, { discount: value })}
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remover item"
                    onClick={() => setItems(items.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              );
            })
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Desconto na venda" htmlFor="discount">
              <CurrencyInput id="discount" value={discount} onValueChange={setDiscount} />
            </Field>
            <div className="sm:col-span-2 sm:flex sm:items-end sm:justify-end">
              <div className="text-right">
                <p className="text-muted-foreground text-xs">Total da venda</p>
                <p className="text-2xl font-semibold tabular-nums">{formatCurrency(total)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Contrato e parcelas</CardTitle>
              <CardDescription>
                {requiresContract
                  ? "Obrigatório: há serviços que geram contrato e card no CRM."
                  : "Opcional para consultas pagas à vista."}
              </CardDescription>
            </div>
            <Switch
              checked={withContract || requiresContract}
              disabled={requiresContract}
              onCheckedChange={setWithContract}
            />
          </div>
        </CardHeader>
        {withContract || requiresContract ? (
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Título do contrato" htmlFor="contractTitle">
                <Input
                  id="contractTitle"
                  value={contractTitle}
                  onChange={(event) => setContractTitle(event.target.value)}
                  placeholder="Gerado a partir dos itens quando vazio"
                />
              </Field>

              <Field
                label="Link do contrato assinado"
                htmlFor="contractUrl"
                error={errors["contract.documentUrl"]}
                hint="Opcional. Fica salvo como documento do cliente."
              >
                <Input
                  id="contractUrl"
                  type="url"
                  value={contractUrl}
                  onChange={(event) => setContractUrl(event.target.value)}
                  placeholder="https://drive.google.com/..."
                />
              </Field>
            </div>

            <InstallmentPlanner
              total={total.toFixed(2)}
              installments={installments}
              onChange={setInstallments}
              paymentMethods={paymentMethods}
              generator={generator}
              onGeneratorChange={setGenerator}
            />
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Observações</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Informações internas sobre a negociação"
          />
        </CardContent>
      </Card>

      <ProductDialog
        open={newProductOpen}
        onOpenChange={setNewProductOpen}
        onCreated={(product) => {
          setCreatedProducts((current) => [...current, product]);
          setItems((current) => [
            ...current,
            {
              productId: product.id,
              quantity: 1,
              unitPrice: product.defaultPrice,
              unitCost: product.defaultCost,
              discount: "0.00",
            },
          ]);
        }}
      />

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending
            ? "Salvando..."
            : editing
              ? "Salvar alterações"
              : "Registrar venda"}
        </Button>
      </div>
    </form>
  );
}
