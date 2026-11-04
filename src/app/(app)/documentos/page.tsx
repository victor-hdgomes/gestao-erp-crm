import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, FolderOpen } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { SearchInput } from "@/components/common/search-input";
import { Badge } from "@/components/ui/badge";
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
import { DocumentDialog } from "@/features/documents/components/document-dialog";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission, requirePermission } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { listCustomers } from "@/server/customers/customers-service";
import { listDocuments } from "@/server/documents/documents-service";

export const metadata: Metadata = { title: "Documentos" };

const KIND_LABEL: Record<string, string> = {
  DRIVE_FOLDER: "Pasta do Drive",
  CONTRACT: "Contrato",
  RECEIPT: "Comprovante",
  OTHER: "Outro",
};

export default async function DocumentsPage({ searchParams }: PageProps<"/documentos">) {
  const user = await requirePermission(PERMISSIONS.DOCUMENT_VIEW);
  const canManage = hasPermission(user, PERMISSIONS.DOCUMENT_MANAGE);

  const params = await searchParams;
  const search = typeof params.search === "string" ? params.search : undefined;

  const [documents, customers] = await Promise.all([
    listDocuments({ search }),
    listCustomers({ pageSize: 10 }),
  ]);

  const dialog = canManage ? (
    <DocumentDialog
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
        title="Documentos"
        help="documentos"
        description="Links para contratos, comprovantes e pastas no Google Drive."
        actions={dialog}
      />

      <div className="mb-4">
        <SearchInput placeholder="Buscar por título" className="w-full sm:w-80" />
      </div>

      {documents.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="Nenhum documento"
          description="Cadastre links de pastas, contratos e comprovantes."
          action={dialog}
        />
      ) : (
        <Card className="py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Cadastro</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((document) => (
                  <TableRow key={document.id}>
                    <TableCell className="font-medium">{document.title}</TableCell>
                    <TableCell>
                      {document.customer ? (
                        <Link
                          href={`/clientes/${document.customer.id}`}
                          className="hover:underline"
                        >
                          {document.customer.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {KIND_LABEL[document.kind] ?? document.kind}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(document.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        nativeButton={false}
                        render={
                          <a href={document.url} target="_blank" rel="noopener noreferrer" />
                        }
                      >
                        <ExternalLink className="size-4" />
                        Abrir
                      </Button>
                    </TableCell>
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
