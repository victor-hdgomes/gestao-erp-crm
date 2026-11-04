"use client";

import { useMemo } from "react";
import { Plus, Trash2, Wand2 } from "lucide-react";

import { CreatableSelect } from "@/components/common/creatable-select";
import { CurrencyInput } from "@/components/common/currency-input";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createPaymentMethodAction } from "@/server/catalog/catalog-actions";
import { formatCurrency } from "@/lib/format";
import { buildInstallmentPlan } from "@/server/finance/calculations";
import { toInputDate } from "@/lib/period";

export type InstallmentDraft = {
  label: string;
  dueDate: string;
  amount: string;
  paymentMethodId: string | null;
};

export type PaymentMethodOption = { id: string; name: string };

type InstallmentPlannerProps = {
  total: string;
  installments: InstallmentDraft[];
  onChange: (installments: InstallmentDraft[]) => void;
  paymentMethods: PaymentMethodOption[];
  /** Generator defaults, kept in state by the parent form. */
  generator: { count: number; downPayment: string; firstDueDate: string; intervalDays: number };
  onGeneratorChange: (generator: InstallmentPlannerProps["generator"]) => void;
};

export function InstallmentPlanner({
  total,
  installments,
  onChange,
  paymentMethods,
  generator,
  onGeneratorChange,
}: InstallmentPlannerProps) {
  const planned = useMemo(
    () => installments.reduce((acc, item) => acc + Number(item.amount || "0"), 0),
    [installments],
  );
  const difference = Number(total || "0") - planned;
  const balanced = Math.abs(difference) < 0.005;

  function generate() {
    try {
      const plan = buildInstallmentPlan({
        total: total || "0",
        count: generator.count,
        firstDueDate: new Date(`${generator.firstDueDate}T12:00:00`),
        intervalDays: generator.intervalDays,
        downPayment: Number(generator.downPayment) > 0 ? generator.downPayment : null,
      });

      onChange(
        plan.map((item) => ({
          label: item.label,
          dueDate: toInputDate(item.dueDate),
          amount: item.amount.toFixed(2),
          paymentMethodId: installments[0]?.paymentMethodId ?? null,
        })),
      );
    } catch {
      // The banner below already tells the user the plan does not add up.
    }
  }

  function update(index: number, patch: Partial<InstallmentDraft>) {
    onChange(installments.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  return (
    <div className="space-y-4">
      <div className="bg-muted/40 grid gap-3 rounded-md border p-3 sm:grid-cols-5">
        <Field label="Parcelas">
          <Input
            type="number"
            min={1}
            max={48}
            value={generator.count}
            onChange={(event) =>
              onGeneratorChange({ ...generator, count: Number(event.target.value) || 1 })
            }
          />
        </Field>
        <Field label="Entrada">
          <CurrencyInput
            value={generator.downPayment}
            onValueChange={(value) => onGeneratorChange({ ...generator, downPayment: value })}
          />
        </Field>
        <Field label="1º vencimento">
          <Input
            type="date"
            value={generator.firstDueDate}
            onChange={(event) =>
              onGeneratorChange({ ...generator, firstDueDate: event.target.value })
            }
          />
        </Field>
        <Field label="Intervalo (dias)">
          <Input
            type="number"
            min={1}
            max={365}
            value={generator.intervalDays}
            onChange={(event) =>
              onGeneratorChange({ ...generator, intervalDays: Number(event.target.value) || 30 })
            }
          />
        </Field>
        <div className="flex items-end">
          <Button type="button" variant="outline" className="w-full" onClick={generate}>
            <Wand2 className="size-4" />
            Gerar
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {installments.map((installment, index) => (
          <div
            key={index}
            className="grid items-end gap-2 rounded-md border p-2 sm:grid-cols-[1fr_150px_150px_170px_auto]"
          >
            <Field label="Descrição">
              <Input
                value={installment.label}
                onChange={(event) => update(index, { label: event.target.value })}
                placeholder={`Parcela ${index + 1}`}
              />
            </Field>
            <Field label="Vencimento">
              <Input
                type="date"
                value={installment.dueDate}
                onChange={(event) => update(index, { dueDate: event.target.value })}
              />
            </Field>
            <Field label="Valor">
              <CurrencyInput
                value={installment.amount}
                onValueChange={(value) => update(index, { amount: value })}
              />
            </Field>
            <Field label="Forma">
              <CreatableSelect
                value={installment.paymentMethodId}
                onValueChange={(value) => update(index, { paymentMethodId: value })}
                options={paymentMethods}
                placeholder="A definir"
                emptyLabel="A definir"
                createLabel="Nova forma de pagamento"
                createPlaceholder="Pix, Boleto, Cartão..."
                onCreate={createPaymentMethodAction}
              />
            </Field>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remover parcela"
              disabled={installments.length <= 1}
              onClick={() => onChange(installments.filter((_, i) => i !== index))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange([
              ...installments,
              {
                label: `Parcela ${installments.length + 1}`,
                dueDate: generator.firstDueDate,
                amount: "0.00",
                paymentMethodId: null,
              },
            ])
          }
        >
          <Plus className="size-4" />
          Adicionar parcela
        </Button>
      </div>

      <div
        className={
          balanced
            ? "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
            : "rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
        }
      >
        Soma das parcelas: <strong>{formatCurrency(planned)}</strong> · Valor contratado:{" "}
        <strong>{formatCurrency(total || "0")}</strong>
        {balanced ? " · plano fechado." : ` · diferença de ${formatCurrency(difference)}.`}
      </div>
    </div>
  );
}
