import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { SaleForm } from "@/features/sales/components/sale-form";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { moneyToString } from "@/lib/money";
import { toInputDate } from "@/lib/period";
import { listPaymentMethods, listProducts } from "@/server/catalog/catalog-service";
import { listCustomers } from "@/server/customers/customers-service";
import { getSaleDetails } from "@/server/sales/sales-queries";

export const metadata: Metadata = { title: "Editar venda" };

export default async function EditSalePage({ params }: PageProps<"/vendas/[id]/editar">) {
  await requirePermission(PERMISSIONS.SALE_MANAGE);

  const { id } = await params;
  const [{ sale, contractSummaries, directReceived }, products, paymentMethods, customers] =
    await Promise.all([
      getSaleDetails(id),
      listProducts({ onlyActive: true }),
      listPaymentMethods(),
      listCustomers({ pageSize: 10 }),
    ]);

  const received =
    contractSummaries.reduce(
      (acc, entry) => acc + Number(entry.summary.received.toFixed(2)),
      0,
    ) + Number(directReceived.toFixed(2));

  const locked = received > 0 || sale.status === "CANCELLED";

  if (locked) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title={`Editar venda ${sale.code}`}
          description={`${sale.customer.name}`}
        />
        <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div className="space-y-2">
            <p className="font-medium">
              {sale.status === "CANCELLED"
                ? "Esta venda está cancelada."
                : "Esta venda já recebeu dinheiro."}
            </p>
            <p>
              {sale.status === "CANCELLED"
                ? "Uma venda cancelada permanece como registro histórico e não é alterada."
                : "Mudar itens ou parcelas agora faria o contratado divergir do que já entrou no caixa. Estorne as transações em Transações e volte aqui."}
            </p>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href={`/vendas/${sale.id}`} />}
              >
                Voltar para a venda
              </Button>
              {sale.status !== "CANCELLED" ? (
                <Button nativeButton={false} render={<Link href="/transacoes" />}>
                  Ir para Transações
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const contract = sale.contracts[0] ?? null;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={`Editar venda ${sale.code}`}
        description="Nada foi recebido ainda, então itens, descontos e parcelas podem ser reescritos."
      />

      <SaleForm
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          kind: product.kind,
          defaultPrice: moneyToString(product.defaultPrice),
          defaultCost: moneyToString(product.defaultCost),
          allowCustomPrice: product.allowCustomPrice,
        }))}
        paymentMethods={paymentMethods.map((method) => ({ id: method.id, name: method.name }))}
        recentCustomers={customers.items.map((customer) => ({
          id: customer.id,
          name: customer.name,
          document: customer.document,
          phone: customer.phone,
        }))}
        initial={{
          id: sale.id,
          customer: {
            id: sale.customer.id,
            name: sale.customer.name,
            document: sale.customer.document,
            phone: sale.customer.phone,
          },
          soldAt: toInputDate(sale.soldAt),
          discount: moneyToString(sale.discount),
          notes: sale.notes ?? "",
          items: sale.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: moneyToString(item.unitPrice),
            unitCost: moneyToString(item.unitCost),
            discount: moneyToString(item.discount),
          })),
          withContract: Boolean(contract),
          contractTitle: contract?.title ?? "",
          contractUrl: contract?.documents?.[0]?.url ?? "",
          installments:
            contract?.installments.map((installment) => ({
              label: installment.label ?? "",
              dueDate: toInputDate(installment.dueDate),
              amount: moneyToString(installment.expectedAmount),
              paymentMethodId: installment.paymentMethodId,
            })) ?? [],
        }}
      />
    </div>
  );
}
