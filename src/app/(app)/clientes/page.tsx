import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { SearchInput } from "@/components/common/search-input";
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
import { CustomerDialog } from "@/features/customers/components/customer-dialog";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission, requirePermission } from "@/lib/auth/session";
import { formatCpf, formatDate, formatPhone } from "@/lib/format";
import { listCustomers } from "@/server/customers/customers-service";

export const metadata: Metadata = { title: "Clientes" };

export default async function CustomersPage({ searchParams }: PageProps<"/clientes">) {
  const user = await requirePermission(PERMISSIONS.CUSTOMER_VIEW);
  const canManage = hasPermission(user, PERMISSIONS.CUSTOMER_MANAGE);

  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search : undefined;
  const page = Number(typeof params.page === "string" ? params.page : "1") || 1;

  const { items, total, pageCount } = await listCustomers({ search, page });

  return (
    <div>
      <PageHeader
        title="Clientes"
        help="clientes"
        description={`${total} cliente(s) cadastrado(s).`}
        actions={canManage ? <CustomerDialog /> : null}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput placeholder="Buscar por nome, CPF ou telefone" className="w-full sm:w-80" />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum cliente encontrado"
          description="Cadastre clientes manualmente ou receba-os pela API do Leona Flow."
          action={canManage ? <CustomerDialog /> : null}
        />
      ) : (
        <Card className="py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead className="text-center">Contratos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cadastro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <Link
                        href={`/clientes/${customer.id}`}
                        className="font-medium hover:underline"
                      >
                        {customer.name}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatCpf(customer.document)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatPhone(customer.phone)}
                    </TableCell>
                    <TableCell>
                      {customer.city ? `${customer.city}/${customer.state ?? ""}` : "—"}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {customer._count.contracts}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={customer.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(customer.createdAt)}
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
                href={{ pathname: "/clientes", query: { search, page: page - 1 } }}
                className="hover:text-foreground underline"
              >
                Anterior
              </Link>
            ) : null}
            {page < pageCount ? (
              <Link
                href={{ pathname: "/clientes", query: { search, page: page + 1 } }}
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
