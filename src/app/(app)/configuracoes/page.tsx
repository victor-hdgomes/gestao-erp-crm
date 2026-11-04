import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, Plug, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GeneralSettingsForm } from "@/features/settings/components/general-settings-form";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission, requirePermission } from "@/lib/auth/session";
import { getFinanceSettings, getGeneralSettings } from "@/server/settings/settings-service";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const user = await requirePermission(PERMISSIONS.SETTINGS_VIEW);
  const canManage = hasPermission(user, PERMISSIONS.SETTINGS_MANAGE);

  const [general, finance] = await Promise.all([getGeneralSettings(), getFinanceSettings()]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Configurações"
        help="configuracoes"
        description="Dados da empresa, regras financeiras e integrações."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <ShortcutCard
          href="/configuracoes/integracoes"
          icon={<Plug className="size-4" />}
          title="Integrações"
          description="Leona Flow, Mercado Pago, OpenAI e n8n."
        />
        <ShortcutCard
          href="/usuarios"
          icon={<KeyRound className="size-4" />}
          title="Usuários e permissões"
          description="Quem acessa o sistema e o que pode fazer."
        />
        <ShortcutCard
          href="/configuracoes/auditoria"
          icon={<ShieldCheck className="size-4" />}
          title="Auditoria"
          description="Histórico de operações sensíveis."
        />
      </div>

      <GeneralSettingsForm
        general={general}
        finance={finance}
        canManage={canManage}
      />
    </div>
  );
}

function ShortcutCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link href={href}>
      <Card className="hover:border-primary/40 h-full gap-0 py-4 transition-colors">
        <CardHeader className="px-4">
          <CardTitle className="flex items-center gap-2 text-sm">
            {icon}
            {title}
          </CardTitle>
          <CardDescription className="text-xs">{description}</CardDescription>
        </CardHeader>
        <CardContent className="px-4" />
      </Card>
    </Link>
  );
}
