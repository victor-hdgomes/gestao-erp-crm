"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, FolderPlus, FolderOpen, Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { CopyField } from "@/components/common/copy-field";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CustomerDialog } from "@/features/customers/components/customer-dialog";
import {
  TransactionDialog,
  type ContractOption,
  type OpenSaleOption,
} from "@/features/finance/components/transaction-dialog";
import { formatCpf, formatCurrency, formatDate, formatPhone } from "@/lib/format";
import { loadCardDetailsAction, moveCardAction } from "@/server/crm/crm-actions";
import type { CardDetailsDto } from "@/server/crm/card-details";
import type { CustomerOption } from "@/server/customers/customers-actions";

export type DrawerStage = { id: string; name: string };

/** Tudo que o diálogo de transação precisa, carregado uma vez pela página. */
export type DrawerFinanceOptions = {
  paymentMethods: { id: string; name: string }[];
  expenseCategories: { id: string; name: string }[];
  incomeCategories: { id: string; name: string }[];
  contracts: ContractOption[];
  openSales: OpenSaleOption[];
};

type CardDrawerProps = {
  cardId: string | null;
  onClose: () => void;
  canManage: boolean;
  stages: DrawerStage[];
  finance: DrawerFinanceOptions | null;
};

export function CardDrawer({ cardId, onClose, canManage, stages, finance }: CardDrawerProps) {
  const router = useRouter();
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [isMoving, startMove] = useTransition();
  const [loaded, setLoaded] = useState<{ cardId: string; details: CardDetailsDto } | null>(
    null,
  );
  // Limpar os dados não basta para recarregar: o efeito só reage ao cardId, e
  // reabrir o mesmo card depois de uma edição deixaria o painel girando.
  const [refreshToken, setRefreshToken] = useState(0);
  const [openedCardId, setOpenedCardId] = useState<string | null>(cardId);

  // Drop the previous card's data during render, so the drawer never shows the
  // wrong customer for a frame while the next one loads.
  if (openedCardId !== cardId) {
    setOpenedCardId(cardId);
    if (loaded && loaded.cardId !== cardId) setLoaded(null);
  }

  const details = loaded && loaded.cardId === cardId ? loaded.details : null;

  useEffect(() => {
    if (!cardId) return;

    let active = true;

    loadCardDetailsAction(cardId).then((result) => {
      if (!active) return;
      if (!result.success) {
        toast.error(result.error);
        onClose();
        return;
      }
      setLoaded({ cardId, details: result.data });
    });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId, refreshToken]);

  function refresh() {
    setLoaded(null);
    setRefreshToken((token) => token + 1);
  }

  function moveTo(stageId: string | null) {
    if (!stageId || !details || stageId === details.stage.id) return;
    startMove(async () => {
      const result = await moveCardAction({ cardId: details.id, toStageId: stageId });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Card movido.");
      refresh();
      router.refresh();
    });
  }

  const customerOption: CustomerOption | null = details
    ? {
        id: details.customer.id,
        name: details.customer.name,
        document: details.customer.document,
        phone: details.customer.phone,
      }
    : null;

  return (
    <>
    <Sheet open={cardId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        // A variante data-[side=right] do Sheet trava em max-w-sm e vence um
        // sm:max-w-* solto, que o tailwind-merge não enxerga como conflito.
        // Por isso a largura daqui precisa vir na mesma variante.
        className="w-full data-[side=right]:sm:max-w-3xl"
      >
        {!details ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="text-muted-foreground size-5 animate-spin" />
          </div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>{details.customer.name}</SheetTitle>
              <SheetDescription>
                {details.stage.name} · desde {formatDate(details.enteredStageAt)}
              </SheetDescription>
            </SheetHeader>

            {canManage ? (
              <div className="flex flex-wrap items-center gap-2 px-4">
                <Select
                  value={details.stage.id}
                  onValueChange={moveTo}
                  disabled={isMoving}
                >
                  <SelectTrigger className="w-full sm:w-64">
                    <SelectValue>{details.stage.name}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        {stage.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button variant="outline" size="sm" onClick={() => setEditingCustomer(true)}>
                  <Pencil className="size-4" />
                  Editar cliente
                </Button>

                {details.customer.driveFolderUrl ? (
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={
                      <a
                        href={details.customer.driveFolderUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    }
                  >
                    <FolderOpen className="size-4" />
                    Pasta do cliente
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setEditingCustomer(true)}>
                    <FolderPlus className="size-4" />
                    Adicionar pasta
                  </Button>
                )}

                {finance ? (
                  <TransactionDialog
                    {...finance}
                    recentCustomers={customerOption ? [customerOption] : []}
                    defaultCustomer={customerOption}
                    trigger={
                      <Button variant="outline" size="sm">
                        <Plus className="size-4" />
                        Nova transação
                      </Button>
                    }
                  />
                ) : null}

                <Button
                  variant="ghost"
                  size="sm"
                  nativeButton={false}
                  render={<Link href={`/clientes/${details.customer.id}`} />}
                >
                  Ficha completa
                </Button>
              </div>
            ) : null}

            <ScrollArea className="min-h-0 flex-1 px-4">
              <Tabs defaultValue="dados" className="pb-6">
                <TabsList>
                  <TabsTrigger value="dados">Dados</TabsTrigger>
                  <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
                  <TabsTrigger value="historico">Histórico</TabsTrigger>
                </TabsList>

                <TabsContent value="dados" className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <CopyField label="Nome completo" value={details.customer.name} />
                    <CopyField
                      label="CPF"
                      value={formatCpf(details.customer.document)}
                      copyValue={details.customer.document}
                    />
                    <CopyField
                      label="Telefone"
                      value={formatPhone(details.customer.phone)}
                      copyValue={details.customer.phone}
                    />
                    <CopyField label="E-mail" value={details.customer.email} />
                    <CopyField
                      label="Endereço"
                      value={details.customer.address}
                      className="sm:col-span-2"
                    />
                    {details.contract ? (
                      <CopyField
                        label="Data de início"
                        value={formatDate(details.contract.startDate)}
                      />
                    ) : null}
                  </div>

                  <Separator />

                  {details.documents.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-muted-foreground text-xs">Documentos</p>
                      {details.documents.map((document) => (
                        <a
                          key={document.id}
                          href={document.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:bg-muted flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                        >
                          <span className="truncate">{document.title}</span>
                          <ExternalLink className="size-3.5 shrink-0" />
                        </a>
                      ))}
                    </div>
                  ) : null}

                  {details.customer.notes ? (
                    <div>
                      <p className="text-muted-foreground text-xs">Observações</p>
                      <p className="mt-1 text-sm whitespace-pre-line">
                        {details.customer.notes}
                      </p>
                    </div>
                  ) : null}
                </TabsContent>

                <TabsContent value="financeiro" className="space-y-4">
                  {details.contract ? (
                    <>
                      <div className="grid grid-cols-3 gap-2">
                        <Metric label="Contratado" value={details.contract.total} />
                        <Metric label="Recebido" value={details.contract.received} tone="positive" />
                        <Metric
                          label="Pendente"
                          value={details.contract.pending}
                          tone={Number(details.contract.pending) > 0 ? "warning" : "default"}
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-muted-foreground text-sm">
                          Próxima cobrança:{" "}
                        {details.contract.nextDueDate
                          ? `${formatDate(details.contract.nextDueDate)} · ${formatCurrency(
                              details.contract.nextDueAmount ?? 0,
                            )}`
                            : "nenhuma parcela em aberto"}
                        </p>
                        {canManage && finance ? (
                          <TransactionDialog
                            {...finance}
                            recentCustomers={customerOption ? [customerOption] : []}
                            defaultCustomer={customerOption}
                            trigger={
                              <Button size="sm">
                                <Plus className="size-4" />
                                Lançar recebimento
                              </Button>
                            }
                          />
                        ) : null}
                      </div>

                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Parcela</TableHead>
                            <TableHead>Vence</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {details.contract.installments.map((installment) => (
                            <TableRow key={installment.id}>
                              <TableCell className="text-sm">
                                {installment.label ?? `Parcela ${installment.number}`}
                              </TableCell>
                              <TableCell className="text-sm">
                                {formatDate(installment.dueDate)}
                              </TableCell>
                              <TableCell className="text-right text-sm tabular-nums">
                                {formatCurrency(installment.expectedAmount)}
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={installment.status} />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>

                      <div className="grid grid-cols-2 gap-2">
                        <CopyField
                          label="Valor de entrada"
                          value={formatCurrency(
                            details.contract.installments[0]?.expectedAmount ?? 0,
                          )}
                          copyValue={details.contract.installments[0]?.expectedAmount ?? ""}
                        />
                        <CopyField
                          label="Valor final"
                          value={formatCurrency(
                            details.contract.installments.at(-1)?.expectedAmount ?? 0,
                          )}
                          copyValue={details.contract.installments.at(-1)?.expectedAmount ?? ""}
                        />
                        <CopyField
                          label="Data de cobrança final"
                          value={formatDate(details.contract.installments.at(-1)?.dueDate)}
                        />
                        <CopyField
                          label="Contrato"
                          value={details.contract.code}
                          copyValue={details.contract.code}
                        />
                      </div>
                    </>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      Este card não possui contrato vinculado.
                    </p>
                  )}
                </TabsContent>

                <TabsContent value="historico" className="space-y-3">
                  {details.history.length === 0 ? (
                    <p className="text-muted-foreground text-sm">Sem movimentações.</p>
                  ) : (
                    <ol className="space-y-3">
                      {details.history.map((entry) => (
                        <li key={entry.id} className="border-l-2 pl-3">
                          <p className="text-sm">
                            {entry.from ? `${entry.from} → ` : ""}
                            <strong>{entry.to}</strong>
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {formatDate(entry.createdAt)}
                            {entry.by ? ` · ${entry.by}` : ""}
                          </p>
                        </li>
                      ))}
                    </ol>
                  )}
                </TabsContent>
              </Tabs>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>

      {details ? (
        <CustomerDialog
          open={editingCustomer}
          onOpenChange={(next) => {
            setEditingCustomer(next);
            // Fechou depois de salvar: o painel recarrega com o que mudou.
            if (!next) {
              refresh();
              router.refresh();
            }
          }}
          customer={{
            id: details.customer.id,
            name: details.customer.name,
            document: details.customer.document ?? "",
            phone: details.customer.phone ?? "",
            email: details.customer.email ?? "",
            zipCode: details.customer.form.zipCode ?? "",
            street: details.customer.form.street ?? "",
            number: details.customer.form.number ?? "",
            complement: details.customer.form.complement ?? "",
            district: details.customer.form.district ?? "",
            city: details.customer.form.city ?? "",
            state: details.customer.form.state ?? "",
            driveFolderUrl: details.customer.driveFolderUrl ?? "",
            notes: details.customer.notes ?? "",
            status: details.customer.form.status,
          }}
        />
      ) : null}
    </>
  );
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "warning";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : "";

  return (
    <div className="rounded-md border p-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`text-sm font-semibold tabular-nums ${toneClass}`}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}
