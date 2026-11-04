"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { CreatableSelect } from "@/components/common/creatable-select";
import { CurrencyInput } from "@/components/common/currency-input";
import { Field } from "@/components/common/field";
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
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CustomerPicker } from "@/features/customers/components/customer-picker";
import { formatCurrency, formatDate } from "@/lib/format";
import { toInputDate } from "@/lib/period";
import type { CustomerOption } from "@/server/customers/customers-actions";
import {
  createExpenseCategoryAction,
  createPaymentMethodAction,
} from "@/server/catalog/catalog-actions";
import { createTransactionAction } from "@/server/finance/finance-actions";

export type ContractOption = {
  id: string;
  code: string;
  title: string;
  customer: { id: string; name: string };
  installments: {
    id: string;
    number: number;
    label: string | null;
    dueDate: string;
    expectedAmount: string;
    paidAmount: string;
    status: string;
  }[];
};

/** A sale with no contract — a consultation — that still owes money. */
export type OpenSaleOption = {
  id: string;
  code: string;
  title: string;
  balance: string;
  customer: { id: string; name: string };
};

type Option = { id: string; name: string };

type TransactionDialogProps = {
  paymentMethods: Option[];
  expenseCategories: Option[];
  contracts: ContractOption[];
  openSales: OpenSaleOption[];
  recentCustomers: CustomerOption[];
  defaultType?: "INCOME" | "EXPENSE";
  trigger?: React.ReactNode;
};

export function TransactionDialog({
  paymentMethods,
  expenseCategories,
  contracts,
  openSales,
  recentCustomers,
  defaultType = "INCOME",
  trigger,
}: TransactionDialogProps) {
  const router = useRouter();
  const today = toInputDate(new Date());

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"INCOME" | "EXPENSE">(defaultType);
  const [description, setDescription] = useState("");
  const [customer, setCustomer] = useState<CustomerOption | null>(null);
  const [expenseCategoryId, setExpenseCategoryId] = useState<string | null>(null);
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
  const [expectedAmount, setExpectedAmount] = useState("0.00");
  const [settledAmount, setSettledAmount] = useState("0.00");
  const [dueDate, setDueDate] = useState(today);
  const [settledAt, setSettledAt] = useState(today);
  const [competenceDate, setCompetenceDate] = useState(today);
  // "contract:<id>" or "sale:<id>"; a receipt lands on one of the two.
  const [target, setTarget] = useState<string | null>(null);
  const contractId = target?.startsWith("contract:") ? target.slice("contract:".length) : null;
  const saleId = target?.startsWith("sale:") ? target.slice("sale:".length) : null;
  const [installmentId, setInstallmentId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedContract = useMemo(
    () => contracts.find((contract) => contract.id === contractId) ?? null,
    [contracts, contractId],
  );

  const selectedSale = useMemo(
    () => openSales.find((sale) => sale.id === saleId) ?? null,
    [openSales, saleId],
  );

  // Picking a customer narrows both lists to what belongs to that person.
  const visibleContracts = useMemo(
    () => contracts.filter((contract) => !customer || contract.customer.id === customer.id),
    [contracts, customer],
  );

  const visibleSales = useMemo(
    () => openSales.filter((sale) => !customer || sale.customer.id === customer.id),
    [openSales, customer],
  );

  const openInstallments = useMemo(
    () =>
      selectedContract?.installments.filter(
        (installment) =>
          installment.status !== "CANCELLED" &&
          Number(installment.expectedAmount) - Number(installment.paidAmount) > 0,
      ) ?? [],
    [selectedContract],
  );

  function reset() {
    setType(defaultType);
    setDescription("");
    setCustomer(null);
    setExpenseCategoryId(null);
    setPaymentMethodId(null);
    setExpectedAmount("0.00");
    setSettledAmount("0.00");
    setDueDate(today);
    setSettledAt(today);
    setCompetenceDate(today);
    setTarget(null);
    setInstallmentId(null);
    setNotes("");
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    startTransition(async () => {
      const settled = Number(settledAmount || "0");

      const allocations =
        type === "INCOME" && installmentId && settled > 0
          ? [
              {
                targetType: "INSTALLMENT" as const,
                installmentId,
                contractId,
                saleId: null,
                amount: settledAmount,
              },
            ]
          : [];

      const result = await createTransactionAction(
        {
          type,
          description,
          customerId: type === "INCOME" ? (customer?.id ?? null) : null,
          expenseCategoryId: type === "EXPENSE" ? expenseCategoryId : null,
          paymentMethodId,
          expectedAmount,
          settledAmount,
          dueDate: dueDate ? new Date(`${dueDate}T12:00:00`) : null,
          settledAt: settled > 0 ? new Date(`${settledAt}T12:00:00`) : null,
          competenceDate: new Date(`${competenceDate}T12:00:00`),
          notes: notes || null,
          origin: "MANUAL",
          allocations,
        },
        {
          autoAllocateContractId:
            type === "INCOME" && !installmentId && contractId ? contractId : null,
          autoAllocateSaleId: type === "INCOME" && saleId ? saleId : null,
        },
      );

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(type === "INCOME" ? "Receita registrada." : "Despesa registrada.");
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger
        render={
          (trigger as React.ReactElement) ?? (
            <Button>
              <Plus className="size-4" />
              Nova transação
            </Button>
          )
        }
      />
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-2xl">
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>Nova transação</DialogTitle>
            <DialogDescription>
              O valor liquidado abate as parcelas vinculadas. Previsto e recebido são campos
              diferentes.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="-mx-1 min-h-0 px-1">
            <div className="space-y-4 pb-1">
              <Tabs
                value={type}
                onValueChange={(value) => setType(value as "INCOME" | "EXPENSE")}
              >
                <TabsList>
                  <TabsTrigger value="INCOME">Receita</TabsTrigger>
                  <TabsTrigger value="EXPENSE">Despesa</TabsTrigger>
                </TabsList>
              </Tabs>

              <Field label="Descrição" htmlFor="description" required>
                <Input
                  id="description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={
                    type === "INCOME" ? "Entrada do contrato CTR-..." : "Tráfego pago — Meta Ads"
                  }
                />
              </Field>

              {type === "INCOME" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Cliente">
                    <CustomerPicker
                      value={customer}
                      onChange={(next) => {
                        setCustomer(next);
                        setTarget(null);
                        setInstallmentId(null);
                      }}
                      initialOptions={recentCustomers}
                    />
                  </Field>

                  <Field
                    label="Vincular a"
                    hint="Abate as parcelas do contrato ou quita uma consulta avulsa."
                  >
                    <Select
                      value={target ?? "none"}
                      onValueChange={(value) => {
                        const next = value === "none" ? null : value;
                        setTarget(next);
                        setInstallmentId(null);
                        if (!next) return;

                        if (next.startsWith("sale:")) {
                          const sale = visibleSales.find(
                            (item) => `sale:${item.id}` === next,
                          );
                          if (sale) {
                            setExpectedAmount(sale.balance);
                            setSettledAmount(sale.balance);
                          }
                          return;
                        }

                        // Pre-fill with the oldest open instalment: the amount the
                        // auto allocation would settle first.
                        const oldest = contracts
                          .find((contract) => `contract:${contract.id}` === next)
                          ?.installments.find(
                            (installment) =>
                              installment.status !== "CANCELLED" &&
                              Number(installment.expectedAmount) -
                                Number(installment.paidAmount) >
                                0,
                          );
                        if (oldest) {
                          const balance = (
                            Number(oldest.expectedAmount) - Number(oldest.paidAmount)
                          ).toFixed(2);
                          setExpectedAmount(balance);
                          setSettledAmount(balance);
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {selectedContract
                            ? `${selectedContract.code} — ${selectedContract.customer.name}`
                            : selectedSale
                              ? `${selectedSale.code} — ${selectedSale.title}`
                              : "Sem vínculo"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem vínculo</SelectItem>
                        {visibleContracts.map((contract) => (
                          <SelectItem key={contract.id} value={`contract:${contract.id}`}>
                            {contract.code} — {contract.customer.name}
                          </SelectItem>
                        ))}
                        {visibleSales.length > 0 ? <SelectSeparator /> : null}
                        {visibleSales.map((sale) => (
                          <SelectItem key={sale.id} value={`sale:${sale.id}`}>
                            {sale.code} — {sale.title} · {formatCurrency(sale.balance)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  {openInstallments.length > 0 ? (
                    <Field
                      label="Parcela"
                      className="sm:col-span-2"
                      hint="Sem escolher, o valor abate as parcelas mais antigas primeiro."
                    >
                      <Select
                        value={installmentId ?? "auto"}
                        onValueChange={(value) => {
                          const next = value === "auto" ? null : value;
                          setInstallmentId(next);
                          const installment = openInstallments.find((item) => item.id === next);
                          if (installment) {
                            const balance =
                              Number(installment.expectedAmount) - Number(installment.paidAmount);
                            setExpectedAmount(balance.toFixed(2));
                            setSettledAmount(balance.toFixed(2));
                          }
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue>
                            {installmentId
                              ? (() => {
                                  const item = openInstallments.find(
                                    (installment) => installment.id === installmentId,
                                  );
                                  return item
                                    ? `${item.label ?? `Parcela ${item.number}`} · ${formatDate(item.dueDate)}`
                                    : "Automático";
                                })()
                              : "Automático (mais antiga primeiro)"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Automático (mais antiga primeiro)</SelectItem>
                          {openInstallments.map((installment) => (
                            <SelectItem key={installment.id} value={installment.id}>
                              {installment.label ?? `Parcela ${installment.number}`} ·{" "}
                              {formatDate(installment.dueDate)} ·{" "}
                              {formatCurrency(
                                Number(installment.expectedAmount) -
                                  Number(installment.paidAmount),
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  ) : null}
                </div>
              ) : (
                <Field label="Categoria" required>
                  <CreatableSelect
                    value={expenseCategoryId}
                    onValueChange={setExpenseCategoryId}
                    options={expenseCategories}
                    placeholder="Selecionar categoria"
                    createLabel="Nova categoria"
                    createPlaceholder="Nome da categoria"
                    onCreate={createExpenseCategoryAction}
                  />
                </Field>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Valor previsto" required>
                  <CurrencyInput value={expectedAmount} onValueChange={setExpectedAmount} />
                </Field>
                <Field
                  label={type === "INCOME" ? "Valor recebido" : "Valor pago"}
                  hint="Deixe zero se ainda não houve movimentação."
                >
                  <CurrencyInput value={settledAmount} onValueChange={setSettledAmount} />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Vencimento">
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                </Field>
                <Field
                  label="Liquidação"
                  hint={
                    Number(settledAmount) > 0 ? undefined : "Usada quando há valor recebido."
                  }
                >
                  <Input
                    type="date"
                    value={settledAt}
                    onChange={(event) => setSettledAt(event.target.value)}
                  />
                </Field>
                <Field label="Competência">
                  <Input
                    type="date"
                    value={competenceDate}
                    onChange={(event) => setCompetenceDate(event.target.value)}
                  />
                </Field>
              </div>

              <Field
                label="Forma de pagamento"
                warning={
                  Number(settledAmount) > 0 && !paymentMethodId
                    ? "Houve dinheiro movimentado e a forma está em branco. Sem ela, o relatório de recebimentos não separa Pix de cartão."
                    : undefined
                }
              >
                <CreatableSelect
                  value={paymentMethodId}
                  onValueChange={setPaymentMethodId}
                  options={paymentMethods}
                  placeholder="A definir"
                  emptyLabel="A definir"
                  createLabel="Nova forma de pagamento"
                  createPlaceholder="Pix, Boleto, Cartão..."
                  onCreate={createPaymentMethodAction}
                />
              </Field>

              <Field label="Observações">
                <Textarea
                  rows={2}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </Field>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
