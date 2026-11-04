import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/features/auth/components/login-form";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <section className="flex items-center justify-center p-6">
        <LoginForm />
      </section>
      <section className="bg-muted/40 hidden flex-col justify-between border-l p-10 lg:flex">
        <div className="text-sm font-medium tracking-tight">Painel de Gestão</div>
        <div className="space-y-4">
          <h2 className="text-3xl font-semibold tracking-tight text-balance">
            ERP e CRM na mesma base de dados.
          </h2>
          <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
            Vendas, contratos, parcelas e recebimentos em um único fluxo. O CRM lê os
            números direto do financeiro, sem segunda fonte de verdade.
          </p>
        </div>
        <p className="text-muted-foreground text-xs">
          Acesso restrito. Todas as operações são registradas em auditoria.
        </p>
      </section>
    </main>
  );
}
