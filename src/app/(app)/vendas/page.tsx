import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardPaste, Plus, ShoppingCart } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { SearchInput } from "@/components/common/search-input";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission, requirePermission } from "@/lib/auth/session";
import { formatCurrency, formatDate } from "@/lib/format";
import { listSales } from "@/server/sales/sales-queries";

export const metadata: Metadata = { title: "Vendas" };

export default async function SalesPage({ searchParams }: PageProps<"/vendas">) {
  const user = await requirePermission(PERMISSIONS.SALE_VIEW);
  const canManage = hasPermission(user, PERMISSIONS.SALE_MANAGE);

  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search : undefined;
  const status = typeof params.status === "string" ? params.status : undefined;
  const page = Number(typeof params.page === "string" ? params.page : "1") || 1;

  const { rows, total, pageCount } = await listSales({
    search,
    status: status as "OPEN" | "PARTIALLY_PAID" | "PAID" | "CANCELLED" | undefined,
    page,
  });

  return (
    <div>
      <PageHeader
        title="Vendas"
        help="vendas"
        description={`${total} venda(s) registrada(s).`}
        actions={
          canManage ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href="/vendas/importar" />}
              >
                <ClipboardPaste className="size-4" />
                Importar ficha
              </Button>
              <Button nativeButton={false} render={<Link href="/vendas/nova" />}>
                <Plus className="size-4" />
                Nova venda
              </Button>
            </div>
          ) : null
        }
      />

      <div className="mb-4">
        <SearchInput placeholder="Buscar por código ou cliente" className="w-full sm:w-80" />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Nenhuma venda encontrada"
          description="Registre a primeira venda para alimentar o financeiro e o CRM."
          action={
            canManage ? (
              <Button nativeButton={false} render={<Link href="/vendas/nova" />}>
                Nova venda
              </Button>
            ) : null
          }
        />
      ) : (
        <Card className="py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Itens</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Recebido</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ sale, received }) => (
                  <TableRow key={sale.id}>
                    <TableCell>
                      <Link
                        href={`/vendas/${sale.id}`}
                        className="font-mono text-xs hover:underline"
                      >
                        {sale.code}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/clientes/${sale.customer.id}`} className="hover:underline">
                        {sale.customer.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-60 truncate text-sm">
                      {sale.items.map((item) => item.product.name).join(", ")}
                    </TableCell>
                    <TableCell>{formatDate(sale.soldAt)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(sale.total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(received)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={sale.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {pageCount > 1 ? (
        <div className="text-muted-foreground mt-4 flex items-center justify-between text-sm">
          <span>
            Página {page} de {pageCount}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={{ pathname: "/vendas", query: { search, page: page - 1 } }}
                className="hover:text-foreground underline"
              >
                Anterior
              </Link>
            ) : null}
            {page < pageCount ? (
              <Link
                href={{ pathname: "/vendas", query: { search, page: page + 1 } }}
                className="hover:text-foreground underline"
              >
                Próxima
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
