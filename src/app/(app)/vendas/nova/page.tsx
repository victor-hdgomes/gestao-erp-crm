import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { SaleForm } from "@/features/sales/components/sale-form";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { moneyToString } from "@/lib/money";
import { listPaymentMethods, listProducts } from "@/server/catalog/catalog-service";
import { listCustomers } from "@/server/customers/customers-service";

export const metadata: Metadata = { title: "Nova venda" };

export default async function NewSalePage() {
  await requirePermission(PERMISSIONS.SALE_MANAGE);

  const [products, paymentMethods, customers] = await Promise.all([
    listProducts({ onlyActive: true }),
    listPaymentMethods(),
    listCustomers({ pageSize: 10 }),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Nova venda"
        description="Registre o que foi vendido e como o cliente vai pagar."
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
      />
    </div>
  );
}
