import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/common/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ApiKeysPanel } from "@/features/settings/components/api-keys-panel";
import { IntegrationCard } from "@/features/settings/components/integration-card";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission, requirePermission } from "@/lib/auth/session";
import { listApiKeys } from "@/server/integrations/api-keys-service";
import { getIntegrationStatus } from "@/server/integrations/credentials-service";

export const metadata: Metadata = { title: "Integrações" };

export default async function IntegrationsPage() {
  const user = await requirePermission(PERMISSIONS.INTEGRATION_VIEW);
  const canManage = hasPermission(user, PERMISSIONS.INTEGRATION_MANAGE);

  const [leona, mercadoPago, openai, n8n, drive, apiKeys] = await Promise.all([
    getIntegrationStatus("LEONA_FLOW"),
    getIntegrationStatus("MERCADO_PAGO"),
    getIntegrationStatus("OPENAI"),
    getIntegrationStatus("N8N"),
    getIntegrationStatus("GOOGLE_DRIVE"),
    listApiKeys(),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Integrações"
        description="Configure credenciais sem alterar código nem publicar nova versão."
      />

      <Alert className="mb-6">
        <AlertTitle>Como as credenciais são guardadas</AlertTitle>
        <AlertDescription>
          Tudo é criptografado em repouso com AES-256-GCM usando a chave mestra
          <code className="mx-1">APP_ENCRYPTION_KEY</code> da infraestrutura. A interface só
          mostra os últimos quatro caracteres e a API nunca devolve o valor completo.
        </AlertDescription>
      </Alert>

      <div className="space-y-4">
        <ApiKeysPanel
          canManage={canManage}
          apiKeys={apiKeys.map((apiKey) => ({
            id: apiKey.id,
            name: apiKey.name,
            provider: apiKey.provider,
            prefix: apiKey.prefix,
            isActive: apiKey.isActive,
            lastUsedAt: apiKey.lastUsedAt?.toISOString() ?? null,
            createdAt: apiKey.createdAt.toISOString(),
          }))}
        />

        <IntegrationCard
          title="Leona Flow"
          description="O Leona Flow faz o atendimento e chama nossa API para registrar o que aconteceu."
          status={leona}
          canManage={canManage}
          footer={
            <div className="bg-muted/40 rounded-md border p-3 text-sm">
              <p className="mb-1 font-medium">Endpoints disponíveis</p>
              <ul className="text-muted-foreground space-y-0.5 font-mono text-xs">
                <li>POST /api/v1/integrations/leona/customers</li>
                <li>POST /api/v1/integrations/leona/sales</li>
                <li>POST /api/v1/integrations/leona/contracts</li>
                <li>POST /api/v1/integrations/leona/transactions</li>
                <li>POST /api/v1/integrations/leona/documents</li>
                <li>PATCH /api/v1/integrations/leona/crm-cards/:id</li>
                <li>GET /api/v1/integrations/leona/customers/:id</li>
                <li>GET /api/v1/integrations/leona/services</li>
              </ul>
              <p className="text-muted-foreground mt-2 text-xs">
                Contrato completo em{" "}
                <Link href="/api/v1/openapi.json" className="underline">
                  /api/v1/openapi.json
                </Link>
                .
              </p>
            </div>
          }
        />

        <IntegrationCard
          title="Mercado Pago"
          description="Cobranças, consulta de pagamentos e conciliação automática via webhook."
          status={mercadoPago}
          canManage={canManage}
          footer={
            <div className="bg-muted/40 rounded-md border p-3 text-sm">
              <p className="font-medium">Webhook</p>
              <p className="text-muted-foreground font-mono text-xs">
                POST /api/v1/webhooks/mercado-pago
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                O pagamento é sempre reconsultado na API do Mercado Pago antes de virar
                recebimento, e o mesmo <code>payment_id</code> nunca entra duas vezes.
              </p>
            </div>
          }
        />

        <IntegrationCard
          title="OpenAI"
          description="Opcional. O ERP funciona normalmente sem esta integração."
          status={openai}
          canManage={canManage}
        />

        <IntegrationCard
          title="n8n"
          description="Automações complementares. Nenhum fluxo principal depende do n8n."
          status={n8n}
          canManage={canManage}
        />

        <IntegrationCard
          title="Google Drive"
          description="Por enquanto apenas links. Nenhum arquivo é enviado pelo sistema."
          status={drive}
          canManage={canManage}
        />
      </div>
    </div>
  );
}
