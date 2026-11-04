import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Receipt } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { PeriodFilter } from "@/components/common/period-filter";
import { SearchInput } from "@/components/common/search-input";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TransactionDialog } from "@/features/finance/components/transaction-dialog";
import { TransactionRowActions } from "@/features/finance/components/transaction-row-actions";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission, requirePermission } from "@/lib/auth/session";
import { formatCurrency, formatDate } from "@/lib/format";
import { moneyToString } from "@/lib/money";
import { resolvePeriod, toInputDate } from "@/lib/period";
import { listExpenseCategories, listPaymentMethods } from "@/server/catalog/catalog-service";
import { listCustomers } from "@/server/customers/customers-service";
import {
  listContractsForSelect,
  listOpenSalesForSelect,
  listTransactions,
} from "@/server/finance/finance-queries";

export const metadata: Metadata = { title: "Transações" };

export default async function TransactionsPage({ searchParams }: PageProps<"/transacoes">) {
  const user = await requirePermission(PERMISSIONS.FINANCE_VIEW);
  const canManage = hasPermission(user, PERMISSIONS.FINANCE_MANAGE);

  const params = await searchParams;
  const asString = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const period = resolvePeriod({
    preset: asString(params.preset) ?? "thisMonth",
    from: asString(params.from),
    to: asString(params.to),
  });

  const type = asString(params.type) as "INCOME" | "EXPENSE" | undefined;
  const page = Number(asString(params.page) ?? "1") || 1;

  const [
    { items, totals, total, pageCount, missingPaymentMethod },
    paymentMethods,
    expenseCategories,
    contracts,
    openSales,
    customers,
  ] = await Promise.all([
      listTransactions({
        type,
        search: asString(params.search),
        from: period.from,
        to: period.to,
        page,
      }),
      listPaymentMethods(),
      listExpenseCategories(),
      listContractsForSelect(),
      listOpenSalesForSelect(),
      listCustomers({ pageSize: 10 }),
    ]);

  const dialog = canManage ? (
    <TransactionDialog
      paymentMethods={paymentMethods.map((method) => ({ id: method.id, name: method.name }))}
      expenseCategories={expenseCategories.map((category) => ({
        id: category.id,
        name: category.name,
      }))}
      contracts={contracts.map((contract) => ({
        id: contract.id,
        code: contract.code,
        title: contract.title,
        customer: contract.customer,
        installments: contract.installments.map((installment) => ({
          id: installment.id,
          number: installment.number,
          label: installment.label,
          dueDate: installment.dueDate.toISOString(),
          expectedAmount: moneyToString(installment.expectedAmount),
          paidAmount: moneyToString(installment.paidAmount),
          status: installment.status,
        })),
      }))}
      openSales={openSales.map((sale) => ({
        id: sale.id,
        code: sale.code,
        title: sale.title,
        balance: sale.balance.toFixed(2),
        customer: sale.customer,
      }))}
      recentCustomers={customers.items.map((customer) => ({
        id: customer.id,
        name: customer.name,
        document: customer.document,
        phone: customer.phone,
      }))}
    />
  ) : null;

  return (
    <div>
      <PageHeader
        title="Transações"
        help="transacoes"
        description={`${total} lançamento(s) no período.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PeriodFilter
              from={toInputDate(period.from)}
              to={toInputDate(period.to)}
              preset={period.preset}
            />
            {dialog}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Receitas previstas" value={formatCurrency(totals.incomeExpected)} />
        <StatCard
          label="Receitas recebidas"
          value={formatCurrency(totals.incomeSettled)}
          tone="positive"
        />
        <StatCard label="Despesas previstas" value={formatCurrency(totals.expenseExpected)} />
        <StatCard
          label="Despesas pagas"
          value={formatCurrency(totals.expenseSettled)}
          tone="negative"
        />
      </div>

      {missingPaymentMethod > 0 ? (
        <div className="mt-6 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            {missingPaymentMethod === 1
              ? "1 lançamento liquidado está sem forma de pagamento."
              : `${missingPaymentMethod} lançamentos liquidados estão sem forma de pagamento.`}{" "}
            Sem ela, o relatório de recebimentos não separa Pix de cartão.
          </p>
        </div>
      ) : null}

      <div className="mt-6 mb-4 flex flex-wrap items-center gap-2">
        <SearchInput placeholder="Buscar por código ou descrição" className="w-full sm:w-80" />
        <nav className="text-muted-foreground flex items-center gap-1 text-sm">
          <FilterLink label="Todas" active={!type} href="/transacoes" />
          <FilterLink label="Receitas" active={type === "INCOME"} href="/transacoes?type=INCOME" />
          <FilterLink
            label="Despesas"
            active={type === "EXPENSE"}
            href="/transacoes?type=EXPENSE"
          />
        </nav>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Nenhuma transação no período"
          description="Registre receitas e despesas para alimentar o dashboard."
          action={dialog}
        />
      ) : (
        <Card className="py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Cliente / categoria</TableHead>
                  <TableHead>Competência</TableHead>
                  <TableHead className="text-right">Previsto</TableHead>
                  <TableHead className="text-right">Liquidado</TableHead>
                  <TableHead>Forma</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage ? <TableHead className="w-12" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell className="font-mono text-xs">{transaction.code}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            transaction.type === "INCOME"
                              ? "size-2 rounded-full bg-emerald-500"
                              : "size-2 rounded-full bg-rose-500"
                          }
                          aria-hidden
                        />
                        {transaction.description}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {transaction.customer ? (
                        <Link
                          href={`/clientes/${transaction.customer.id}`}
                          className="hover:underline"
                        >
                          {transaction.customer.name}
                        </Link>
                      ) : (
                        (transaction.expenseCategory?.name ?? "—")
                      )}
                    </TableCell>
                    <TableCell>{formatDate(transaction.competenceDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(transaction.expectedAmount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(transaction.settledAmount)}
                    </TableCell>
                    <TableCell className="text-sm">
                      <PaymentMethodCell
                        name={transaction.paymentMethod?.name ?? null}
                        settled={Number(transaction.settledAmount) > 0}
                        closed={
                          transaction.status === "CANCELLED" ||
                          transaction.status === "REFUNDED"
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={transaction.status} />
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <TransactionRowActions
                          transaction={{
                            id: transaction.id,
                            code: transaction.code,
                            status: transaction.status,
                          }}
                        />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {pageCount > 1 ? (
        <p className="text-muted-foreground mt-4 text-sm">
          Página {page} de {pageCount}
        </p>
      ) : null}
    </div>
  );
}

function FilterLink({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "bg-secondary text-secondary-foreground rounded-md px-2.5 py-1 font-medium"
          : "hover:bg-muted rounded-md px-2.5 py-1"
      }
    >
      {label}
    </Link>
  );
}

/**
 * A settled amount with no payment method is not an error, but it is a hole in
 * the receipts report, so the row says so instead of showing a silent dash.
 */
function PaymentMethodCell({
  name,
  settled,
  closed,
}: {
  name: string | null;
  settled: boolean;
  closed: boolean;
}) {
  if (name) return <span>{name}</span>;
  if (!settled || closed) return <span className="text-muted-foreground">—</span>;

  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-300">
      <AlertTriangle className="size-3" aria-hidden />
      Sem forma
    </span>
  );
}
