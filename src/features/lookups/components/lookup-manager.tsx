"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { ConfirmActionDialog } from "@/components/common/confirm-action-dialog";
import { Field } from "@/components/common/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ActionResult } from "@/server/shared/action-result";

export type LookupRow = {
  id: string;
  name: string;
  isActive: boolean;
  /** Rows the system itself depends on: renameable, never removable. */
  isSystem: boolean;
  usageCount: number;
};

type LookupManagerProps = {
  title: string;
  description: string;
  /** What a row is, in the singular, for the buttons and messages. */
  noun: string;
  usageLabel: string;
  rows: LookupRow[];
  canManage: boolean;
  onCreate: (name: string) => Promise<ActionResult<{ id: string; name: string }>>;
  onUpdate: (
    id: string,
    input: { name: string; isActive: boolean },
  ) => Promise<ActionResult<{ id: string; name: string }>>;
  onArchive: (id: string) => Promise<ActionResult<null>>;
};

export function LookupManager({
  title,
  description,
  noun,
  usageLabel,
  rows,
  canManage,
  onCreate,
  onUpdate,
  onArchive,
}: LookupManagerProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<LookupRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [archiving, setArchiving] = useState<LookupRow | null>(null);
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isPending, startTransition] = useTransition();

  function openCreate() {
    setName("");
    setIsActive(true);
    setEditing(null);
    setCreating(true);
  }

  function openEdit(row: LookupRow) {
    setName(row.name);
    setIsActive(row.isActive);
    setCreating(false);
    setEditing(row);
  }

  function closeForm() {
    setCreating(false);
    setEditing(null);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const label = name.trim();
    if (label.length < 2) {
      toast.error(`Informe um nome para ${noun}.`);
      return;
    }

    startTransition(async () => {
      const result = editing
        ? await onUpdate(editing.id, { name: label, isActive })
        : await onCreate(label);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(editing ? "Alteração salva." : "Cadastro criado.");
      closeForm();
      router.refresh();
    });
  }

  function archive() {
    if (!archiving) return;
    const target = archiving;
    startTransition(async () => {
      const result = await onArchive(target.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`"${target.name}" foi arquivado.`);
      setArchiving(null);
      router.refresh();
    });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
            {canManage ? (
              <Button variant="outline" onClick={openCreate}>
                <Plus className="size-4" />
                Novo
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {rows.length === 0 ? (
            <p className="text-muted-foreground px-(--card-padding) text-sm">
              Nenhum cadastro ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-right">{usageLabel}</TableHead>
                  <TableHead>Situação</TableHead>
                  {canManage ? <TableHead className="w-24" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} className={row.isActive ? undefined : "opacity-60"}>
                    <TableCell className="font-medium">
                      {row.name}
                      {row.isSystem ? (
                        <span className="text-muted-foreground ml-2 text-xs">do sistema</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.usageCount}</TableCell>
                    <TableCell>
                      <Badge variant={row.isActive ? "secondary" : "outline"}>
                        {row.isActive ? "Ativo" : "Arquivado"}
                      </Badge>
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Editar ${row.name}`}
                            onClick={() => openEdit(row)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Arquivar ${row.name}`}
                            disabled={row.isSystem || !row.isActive}
                            onClick={() => setArchiving(row)}
                          >
                            <Archive className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={creating || editing !== null} onOpenChange={(next) => !next && closeForm()}>
        <DialogContent>
          <form onSubmit={submit} className="contents">
            <DialogHeader>
              <DialogTitle>
                {editing ? `Editar ${noun}` : `Novo cadastro`}
              </DialogTitle>
              <DialogDescription>
                {editing
                  ? "O nome muda em todas as telas. Os lançamentos já feitos continuam ligados a este cadastro."
                  : description}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <Field label="Nome" htmlFor="lookup-name" required>
                <Input
                  id="lookup-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoFocus
                />
              </Field>

              {editing ? (
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="text-sm font-medium">Ativo</p>
                    <p className="text-muted-foreground text-xs">
                      Inativo deixa de aparecer nas listas de escolha, sem mexer no histórico.
                    </p>
                  </div>
                  <Switch
                    checked={isActive}
                    disabled={editing.isSystem}
                    onCheckedChange={setIsActive}
                  />
                </div>
              ) : null}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeForm}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={archiving !== null}
        onOpenChange={(next) => !next && setArchiving(null)}
        title={`Arquivar “${archiving?.name ?? ""}”?`}
        description={
          archiving && archiving.usageCount > 0
            ? `${archiving.usageCount} registro(s) continuam apontando para este cadastro e mantêm o rótulo. Ele apenas deixa de aparecer em novas escolhas.`
            : "Ele deixa de aparecer nas listas de escolha. Nada do histórico é alterado."
        }
        confirmPhrase={archiving?.name ?? ""}
        confirmLabel="Arquivar"
        pending={isPending}
        onConfirm={archive}
      />
    </>
  );
}
