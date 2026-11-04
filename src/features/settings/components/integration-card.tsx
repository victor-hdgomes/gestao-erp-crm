"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, Loader2, PlugZap } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/common/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";
import {
  saveCredentialsAction,
  testConnectionAction,
} from "@/server/integrations/integrations-actions";
import type { IntegrationStatus } from "@/server/integrations/credentials-service";

type IntegrationCardProps = {
  title: string;
  description: string;
  status: IntegrationStatus;
  canManage: boolean;
  footer?: React.ReactNode;
};

export function IntegrationCard({
  title,
  description,
  status,
  canManage,
  footer,
}: IntegrationCardProps) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(status.fields.map((field) => [field.key, field.value ?? ""])),
  );
  const [isSaving, startSaving] = useTransition();
  const [isTesting, startTesting] = useTransition();

  function save() {
    startSaving(async () => {
      const result = await saveCredentialsAction(status.provider, values, status.environment);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Credenciais salvas e criptografadas.");
      router.refresh();
    });
  }

  function test() {
    startTesting(async () => {
      const result = await testConnectionAction(status.provider, status.environment);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (result.data.ok) toast.success(result.data.message);
      else toast.error(result.data.message);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <PlugZap className="size-4" />
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {status.configured ? (
              <Badge variant="secondary">Configurado</Badge>
            ) : (
              <Badge variant="outline">Não configurado</Badge>
            )}
            {status.lastTestOk === true ? (
              <span className="text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4" />
              </span>
            ) : status.lastTestOk === false ? (
              <span className="text-destructive">
                <CircleAlert className="size-4" />
              </span>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {status.fields.map((field) => (
            <Field
              key={field.key}
              label={field.label}
              htmlFor={`${status.provider}-${field.key}`}
              hint={
                field.secret && field.configured
                  ? `Valor atual: ${field.maskedHint}. Preencha para substituir.`
                  : undefined
              }
            >
              <Input
                id={`${status.provider}-${field.key}`}
                type={field.secret ? "password" : "text"}
                autoComplete="off"
                disabled={!canManage}
                value={values[field.key] ?? ""}
                placeholder={field.secret && field.configured ? "••••••••" : undefined}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [field.key]: event.target.value }))
                }
              />
            </Field>
          ))}
        </div>

        {status.lastTestedAt ? (
          <p className="text-muted-foreground text-xs">
            Último teste: {formatDateTime(status.lastTestedAt)} ·{" "}
            {status.lastTestOk ? "sucesso" : "falha"}
          </p>
        ) : null}

        {footer}

        {canManage ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={test} disabled={isTesting}>
              {isTesting ? <Loader2 className="size-4 animate-spin" /> : null}
              Testar conexão
            </Button>
            <Button type="button" onClick={save} disabled={isSaving}>
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
