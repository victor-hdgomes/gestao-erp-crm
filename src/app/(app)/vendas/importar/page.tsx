import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { FichaImporter } from "@/features/sales/components/ficha-importer";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import { listPaymentMethods, listProducts } from "@/server/catalog/catalog-service";

export const metadata: Metadata = { title: "Importar ficha" };

export default async function ImportFichaPage() {
  await requirePermission(PERMISSIONS.SALE_MANAGE);

  const [products, paymentMethods] = await Promise.all([
    listProducts({ onlyActive: true }),
    listPaymentMethods(),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Importar ficha do cliente"
        description="Cole a resposta do WhatsApp e o sistema monta o cliente, a venda e as parcelas para você conferir."
      />

      <FichaImporter
        produtos={products.map((product) => ({ id: product.id, name: product.name }))}
        formasPagamento={paymentMethods.map((method) => ({ id: method.id, name: method.name }))}
      />
    </div>
  );
}
