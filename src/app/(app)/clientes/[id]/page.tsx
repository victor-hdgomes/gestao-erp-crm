import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, FileText, FolderOpen } from "lucide-react";

import { CopyField } from "@/components/common/copy-field";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { formatCpf, formatCurrency, formatDate, formatPhone } from "@/lib/format";
import { moneyToString } from "@/lib/money";
import { getCustomerDetails } from "@/server/customers/customers-service";

export const metadata: Metadata = { title: "Cliente" };

export default async function CustomerDetailsPage({ params }: PageProps<"/clientes/[id]">) {
  const user = await requirePermission(PERMISSIONS.CUSTOMER_VIEW);
  const canManage = hasPermission(user, PERMISSIONS.CUSTOMER_MANAGE);

  const { id } = await params;
  const { customer, contractSummaries, totals, nextDue } = await getCustomerDetails(id);

  const address = [
    customer.street,
    customer.number,
    customer.complement,
    customer.district,
    customer.city && customer.state ? `${customer.city}/${customer.state}` : customer.city,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div>
      <PageHeader
        title={customer.name}
        description={`Cliente desde ${formatDate(customer.createdAt)}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={customer.status} />
            {customer.driveFolderUrl ? (
              <Button
                variant="outline"
                nativeButton={false}
                render={
                  <a href={customer.driveFolderUrl} target="_blank" rel="noopener noreferrer" />
                }
              >
                <FolderOpen className="size-4" />
                Abrir pasta
              </Button>
            ) : null}
            {canManage ? (
              <CustomerDialog
                customer={{
                  id: customer.id,
                  name: customer.name,
                  document: customer.document ?? "",
                  phone: customer.phone ?? "",
                  email: customer.email ?? "",
                  zipCode: customer.zipCode ?? "",
                  street: customer.street ?? "",
                  number: customer.number ?? "",
                  complement: customer.complement ?? "",
                  district: customer.district ?? "",
                  city: customer.city ?? "",
                  state: customer.state ?? "",
                  driveFolderUrl: customer.driveFolderUrl ?? "",
                  notes: customer.notes ?? "",
                  status: customer.status,
                }}
                trigger={<Button variant="outline">Editar</Button>}
              />
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Valor contratado" value={formatCurrency(totals.contracted)} />
        <StatCard
          label="Recebido"
          value={formatCurrency(totals.received)}
          tone="positive"
        />
        <StatCard
          label="Saldo pendente"
          value={formatCurrency(totals.pending)}
          tone={totals.pending > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Próximo vencimento"
          value={nextDue?.nextDueDate ? formatDate(nextDue.nextDueDate) : "—"}
          hint={
            nextDue?.nextDueAmount
              ? formatCurrency(moneyToString(nextDue.nextDueAmount))
              : "Nenhuma parcela em aberto"
          }
          tone={totals.overdueCount > 0 ? "negative" : "default"}
        />
      </div>

      <Tabs defaultValue="dados" className="mt-6">
        <TabsList>
          <TabsTrigger value="dados">Dados pessoais</TabsTrigger>
          <TabsTrigger value="contratos">Serviços e contratos</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="dados">
          <Card>
            <CardHeader>
              <CardTitle>Dados do cliente</CardTitle>
              <CardDescription>
                Passe o mouse sobre um campo para copiar o valor.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-x-8 sm:grid-cols-2">
              <CopyField label="Nome completo" value={customer.name} />
              <CopyField
                label="CPF"
                value={formatCpf(customer.document)}
                copyValue={customer.document}
              />
              <CopyField
                label="Telefone"
                value={formatPhone(customer.phone)}
                copyValue={customer.phone}
              />
              <CopyField label="E-mail" value={customer.email} />
              <CopyField label="Endereço" value={address} className="sm:col-span-2" />
              <CopyField label="CEP" value={customer.zipCode} />
              <CopyField label="Data de cadastro" value={formatDate(customer.createdAt)} />
              {customer.notes ? (
                <div className="sm:col-span-2">
                  <Separator className="my-3" />
                  <p className="text-muted-foreground text-xs">Observações</p>
                  <p className="mt-1 text-sm whitespace-pre-line">{customer.notes}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contratos">
          {contractSummaries.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Nenhum contrato"
              description="Contratos são criados automaticamente nas vendas de serviços."
            />
          ) : (
            <div className="space-y-4">
              {contractSummaries.map(({ contract, summary }) => (
                <Card key={contract.id}>
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">
                          {contract.code} — {contract.title}
                        </CardTitle>
                        <CardDescription>
                          Início em {formatDate(contract.startDate)}
                        </CardDescription>
                      </div>
                      <StatusBadge status={contract.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-4">
                      <CopyField
                        label="Valor contratado"
                        value={formatCurrency(summary.total)}
                        copyValue={moneyToString(summary.total)}
                      />
                      <CopyField
                        label="Recebido"
                        value={formatCurrency(summary.received)}
                        copyValue={moneyToString(summary.received)}
                      />
                      <CopyField
                        label="Pendente"
                        value={formatCurrency(summary.pending)}
                        copyValue={moneyToString(summary.pending)}
                      />
                      <CopyField
                        label="Data de início"
                        value={formatDate(contract.startDate)}
                      />
                    </div>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Parcela</TableHead>
                          <TableHead>Vencimento</TableHead>
                          <TableHead className="text-right">Previsto</TableHead>
                          <TableHead className="text-right">Recebido</TableHead>
                          <TableHead>Forma</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="w-12" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {contract.installments.map((installment) => (
                          <TableRow key={installment.id}>
                            <TableCell>
                              {installment.label ?? `Parcela ${installment.number}`}
                            </TableCell>
                            <TableCell>{formatDate(installment.dueDate)}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCurrency(installment.expectedAmount)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCurrency(installment.paidAmount)}
                            </TableCell>
                            <TableCell>{installment.paymentMethod?.name ?? "—"}</TableCell>
                            <TableCell>
                              <StatusBadge status={installment.status} />
                            </TableCell>
                            <TableCell />
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="financeiro">
          <Card className="py-0">
            <CardContent className="px-0">
              {customer.transactions.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="Sem transações"
                    description="Receitas e despesas vinculadas a este cliente aparecem aqui."
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Competência</TableHead>
                      <TableHead className="text-right">Previsto</TableHead>
                      <TableHead className="text-right">Liquidado</TableHead>
                      <TableHead>Forma</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customer.transactions.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell className="font-mono text-xs">{transaction.code}</TableCell>
                        <TableCell>{transaction.description}</TableCell>
                        <TableCell>{formatDate(transaction.competenceDate)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(transaction.expectedAmount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(transaction.settledAmount)}
                        </TableCell>
                        <TableCell>{transaction.paymentMethod?.name ?? "—"}</TableCell>
                        <TableCell>
                          <StatusBadge status={transaction.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documentos">
          <Card>
            <CardHeader>
              <CardTitle>Documentos e links</CardTitle>
              <CardDescription>
                Os arquivos ficam no Google Drive. Aqui guardamos os links de acesso.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {customer.driveFolderUrl ? (
                <DocumentLink title="Pasta do cliente" url={customer.driveFolderUrl} />
              ) : null}
              {customer.documents.map((document) => (
                <DocumentLink key={document.id} title={document.title} url={document.url} />
              ))}
              {!customer.driveFolderUrl && customer.documents.length === 0 ? (
                <EmptyState
                  icon={FolderOpen}
                  title="Nenhum link cadastrado"
                  description="Adicione o link da pasta do cliente ao editar o cadastro."
                />
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico">
          <Card>
            <CardHeader>
              <CardTitle>Movimentações no CRM</CardTitle>
            </CardHeader>
            <CardContent>
              {customer.crmCards.length === 0 ? (
                <EmptyState
                  title="Sem cards no CRM"
                  description="Vendas de serviços de maior valor geram cards automaticamente."
                />
              ) : (
                <ul className="space-y-3">
                  {customer.crmCards.map((card) => (
                    <li key={card.id} className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{card.title}</p>
                        <p className="text-muted-foreground text-xs">
                          Etapa atual: {card.stage.name} · desde{" "}
                          {formatDate(card.enteredStageAt)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        nativeButton={false}
                        render={<Link href="/crm" />}
                      >
                        Ver no Kanban
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DocumentLink({ title, url }: { title: string; url: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="text-muted-foreground truncate text-xs">{url}</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        nativeButton={false}
        render={<a href={url} target="_blank" rel="noopener noreferrer" />}
      >
        <ExternalLink className="size-4" />
        Abrir
      </Button>
    </div>
  );
}
