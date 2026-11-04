import type { Metadata } from "next";
import { Package } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProductDialog } from "@/features/catalog/components/product-dialog";
import { ProductRowActions } from "@/features/catalog/components/product-row-actions";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission, requirePermission } from "@/lib/auth/session";
import { formatCurrency } from "@/lib/format";
import { moneyToString } from "@/lib/money";
import { listProducts } from "@/server/catalog/catalog-service";

export const metadata: Metadata = { title: "Serviços" };

const KIND_LABEL: Record<string, string> = {
  CONSULTATION: "Consulta",
  SERVICE: "Serviço",
  OTHER: "Outro",
};

export default async function ServicesPage() {
  const user = await requirePermission(PERMISSIONS.CATALOG_VIEW);
  const canManage = hasPermission(user, PERMISSIONS.CATALOG_MANAGE);
  const products = await listProducts();

  return (
    <div>
      <PageHeader
        title="Catálogo de serviços"
        help="servicos"
        description="O que a empresa vende, com preço e custo de referência."
        actions={canManage ? <ProductDialog /> : null}
      />

      {products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nenhum serviço cadastrado"
          description="Cadastre os serviços comercializados para começar a registrar vendas."
          action={canManage ? <ProductDialog /> : null}
        />
      ) : (
        <Card className="py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serviço</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Preço</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                  <TableHead>Regras</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage ? <TableHead className="w-12" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <div className="space-y-0.5">
                        <p className="font-medium">{product.name}</p>
                        {product.category ? (
                          <p className="text-muted-foreground text-xs">{product.category}</p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{KIND_LABEL[product.kind] ?? product.kind}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(product.defaultPrice)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {formatCurrency(product.defaultCost)}
                    </TableCell>
                    <TableCell>
                      <div className="text-muted-foreground flex flex-wrap gap-1 text-xs">
                        {product.allowCustomPrice ? <span>preço editável</span> : <span>preço fixo</span>}
                        <span>·</span>
                        <span>{product.createsCrmCard ? "gera card" : "sem card"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={product.isActive ? "default" : "outline"}>
                        {product.isActive ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <ProductRowActions
                          product={{
                            id: product.id,
                            name: product.name,
                            description: product.description ?? "",
                            category: product.category ?? "",
                            kind: product.kind,
                            defaultPrice: moneyToString(product.defaultPrice),
                            defaultCost: moneyToString(product.defaultCost),
                            allowCustomPrice: product.allowCustomPrice,
                            createsCrmCard: product.createsCrmCard,
                            isActive: product.isActive,
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
    </div>
  );
}
