import type { Metadata } from "next";
import {
  AlertTriangle,
  Banknote,
  CreditCard,
  FileSignature,
  Megaphone,
  PiggyBank,
  Receipt,
  Search,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { PageHeader } from "@/components/common/page-header";
import { PeriodFilter } from "@/components/common/period-filter";
import { StatCard } from "@/components/common/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import { formatCurrency } from "@/lib/format";
import { resolvePeriod, toInputDate } from "@/lib/period";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import {
  getDashboardMetrics,
  getDashboardSeries,
  getExpensesByCategory,
  getSalesByProduct,
} from "@/server/dashboard/dashboard-service";
import {
  CategoryBarChart,
  RevenueTrendChart,
} from "@/features/dashboard/components/revenue-chart";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  await requirePermission(PERMISSIONS.DASHBOARD_VIEW);

  const params = await searchParams;
  const period = resolvePeriod({
    preset: asString(params.preset),
    from: asString(params.from),
    to: asString(params.to),
  });

  const [metrics, series, expensesByCategory, salesByProduct] = await Promise.all([
    getDashboardMetrics(period),
    getDashboardSeries(period),
    getExpensesByCategory(period),
    getSalesByProduct(period),
  ]);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        help="dashboard"
        description="Indicadores financeiros e comerciais do período selecionado."
        actions={<PeriodFilter
              from={toInputDate(period.from)}
              to={toInputDate(period.to)}
              preset={period.preset}
            />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Faturamento contratado"
          value={formatCurrency(metrics.revenueContracted)}
          hint={`${metrics.salesCount} venda(s) no período`}
          icon={TrendingUp}
        />
        <StatCard
          label="Recebimentos"
          value={formatCurrency(metrics.revenueReceived)}
          hint="Dinheiro que entrou no caixa"
          icon={Banknote}
          tone="positive"
        />
        <StatCard
          label="Contas a receber"
          value={formatCurrency(metrics.accountsReceivable)}
          hint={`${formatCurrency(metrics.overdueReceivable)} vencido · saldo total em aberto`}
          icon={Wallet}
          tone={Number(metrics.overdueReceivable) > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Despesas pagas"
          value={formatCurrency(metrics.expensesPaid)}
          hint={`${formatCurrency(metrics.expensesPending)} em aberto`}
          icon={Receipt}
          tone="negative"
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Lucro operacional"
          value={formatCurrency(metrics.operatingProfit)}
          hint="Recebido − despesas pagas (caixa)"
          icon={PiggyBank}
          tone={Number(metrics.operatingProfit) >= 0 ? "positive" : "negative"}
        />
        <StatCard
          label="Tráfego pago"
          value={formatCurrency(metrics.adsExpenses)}
          icon={Megaphone}
        />
        <StatCard
          label="Custo de consultas"
          value={formatCurrency(metrics.consultationExpenses)}
          icon={CreditCard}
        />
        <StatCard
          label="Consultas vendidas"
          value={String(metrics.consultationsSold)}
          icon={Search}
        />
        <StatCard
          label="Contratos fechados"
          value={String(metrics.contractsClosed)}
          icon={FileSignature}
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Contratado × recebido × despesas</CardTitle>
            <CardDescription>
              Faturamento contratado não é caixa. Parcelas futuras não entram em recebimentos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RevenueTrendChart data={series} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Despesas por categoria</CardTitle>
            <CardDescription>Valores efetivamente pagos no período.</CardDescription>
          </CardHeader>
          <CardContent>
            {expensesByCategory.length > 0 ? (
              <CategoryBarChart data={expensesByCategory} color="var(--chart-5)" />
            ) : (
              <EmptyState
                icon={AlertTriangle}
                title="Sem despesas no período"
                description="Lance despesas em Transações para acompanhar o custo da operação."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Vendas por serviço</CardTitle>
          <CardDescription>Valor contratado por item do catálogo.</CardDescription>
        </CardHeader>
        <CardContent>
          {salesByProduct.length > 0 ? (
            <CategoryBarChart data={salesByProduct} color="var(--chart-1)" />
          ) : (
            <EmptyState
              title="Sem vendas no período"
              description="Registre vendas para acompanhar o desempenho de cada serviço."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function asString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
