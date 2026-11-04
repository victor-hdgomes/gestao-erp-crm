"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  saveFinanceSettingsAction,
  saveGeneralSettingsAction,
} from "@/server/integrations/integrations-actions";
import type { FinanceSettings, GeneralSettings } from "@/server/settings/settings-service";

const COST_MODE_LABEL: Record<FinanceSettings["consultationCostMode"], string> = {
  MANUAL: "Lançar manualmente (padrão)",
  ON_SALE: "Gerar despesa ao vender a consulta",
};

export function GeneralSettingsForm({
  general,
  finance,
  canManage,
}: {
  general: GeneralSettings;
  finance: FinanceSettings;
  canManage: boolean;
}) {
  const router = useRouter();
  const [companyName, setCompanyName] = useState(general.companyName);
  const [currency, setCurrency] = useState(general.currency);
  const [timezone, setTimezone] = useState(general.timezone);
  const [logoUrl, setLogoUrl] = useState(general.logoUrl ?? "");
  const [costMode, setCostMode] = useState(finance.consultationCostMode);
  const [interval, setInterval] = useState(String(finance.defaultInstallmentIntervalDays));
  const [isPending, startTransition] = useTransition();

  function save(event: React.FormEvent) {
    event.preventDefault();

    startTransition(async () => {
      const generalResult = await saveGeneralSettingsAction({
        companyName,
        currency,
        timezone,
        logoUrl: logoUrl || null,
      });
      if (!generalResult.success) {
        toast.error(generalResult.error);
        return;
      }

      const financeResult = await saveFinanceSettingsAction({
        consultationCostMode: costMode,
        defaultInstallmentIntervalDays: Number(interval) || 30,
      });
      if (!financeResult.success) {
        toast.error(financeResult.error);
        return;
      }

      toast.success("Configurações salvas.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Dados da empresa</CardTitle>
          <CardDescription>Aparecem na navegação e nos relatórios.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome da empresa" htmlFor="companyName" required>
            <Input
              id="companyName"
              value={companyName}
              disabled={!canManage}
              onChange={(event) => setCompanyName(event.target.value)}
            />
          </Field>
          <Field label="Logotipo (URL)" htmlFor="logoUrl">
            <Input
              id="logoUrl"
              value={logoUrl}
              disabled={!canManage}
              onChange={(event) => setLogoUrl(event.target.value)}
              placeholder="https://..."
            />
          </Field>
          <Field label="Moeda" htmlFor="currency">
            <Input
              id="currency"
              value={currency}
              maxLength={3}
              disabled={!canManage}
              onChange={(event) => setCurrency(event.target.value.toUpperCase())}
            />
          </Field>
          <Field label="Fuso horário" htmlFor="timezone">
            <Input
              id="timezone"
              value={timezone}
              disabled={!canManage}
              onChange={(event) => setTimezone(event.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Regras financeiras</CardTitle>
          <CardDescription>
            Decisões de negócio configuráveis, para não ficarem fixas no código.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Custo da consulta"
            hint="Define quando o custo vira despesa: no ato da venda ou por lançamento manual."
          >
            <Select
              value={costMode}
              disabled={!canManage}
              onValueChange={(value) =>
                setCostMode((value ?? "MANUAL") as FinanceSettings["consultationCostMode"])
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue>{COST_MODE_LABEL[costMode]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(COST_MODE_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Intervalo padrão entre parcelas (dias)"
            htmlFor="interval"
            hint="Usado ao gerar planos de parcelamento."
          >
            <Input
              id="interval"
              type="number"
              min={1}
              max={365}
              value={interval}
              disabled={!canManage}
              onChange={(event) => setInterval(event.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      {canManage ? (
        <div className="flex justify-end">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Salvando..." : "Salvar configurações"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
