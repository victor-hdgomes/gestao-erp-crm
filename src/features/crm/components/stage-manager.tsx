"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createStageAction,
  moveStageAction,
  removeStageAction,
  updateStageAction,
} from "@/server/crm/crm-actions";

export type StageRow = {
  id: string;
  name: string;
  color: string | null;
  isFinal: boolean;
  cardCount: number;
};

const DEFAULT_COLOR = "#64748b";

export function StageManager({
  stages,
  canManage,
}: {
  stages: StageRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<StageRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<StageRow | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [isFinal, setIsFinal] = useState(false);
  const [isPending, startTransition] = useTransition();

  function openCreate() {
    setName("");
    setColor(DEFAULT_COLOR);
    setIsFinal(false);
    setEditing(null);
    setCreating(true);
  }

  function openEdit(stage: StageRow) {
    setName(stage.name);
    setColor(stage.color ?? DEFAULT_COLOR);
    setIsFinal(stage.isFinal);
    setCreating(false);
    setEditing(stage);
  }

  function closeForm() {
    setCreating(false);
    setEditing(null);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const payload = { name: name.trim(), color, isFinal };
    if (payload.name.length < 2) {
      toast.error("Informe um nome para a etapa.");
      return;
    }

    startTransition(async () => {
      const result = editing
        ? await updateStageAction(editing.id, payload)
        : await createStageAction(payload);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(editing ? "Etapa atualizada." : "Etapa criada.");
      closeForm();
      router.refresh();
    });
  }

  function reorder(stage: StageRow, direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveStageAction(stage.id, direction);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  function openRemove(stage: StageRow) {
    // O destino já vem sugerido: quase sempre é a etapa vizinha mesmo.
    const fallback = stages.find((item) => item.id !== stage.id);
    setTargetId(fallback?.id ?? null);
    setRemoving(stage);
  }

  function confirmRemove() {
    if (!removing || !targetId) return;
    const stage = removing;
    startTransition(async () => {
      const result = await removeStageAction(stage.id, targetId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.data.movedCards > 0
          ? `"${stage.name}" saiu do quadro e ${result.data.movedCards} card(s) foram movidos.`
          : `"${stage.name}" saiu do quadro.`,
      );
      setRemoving(null);
      router.refresh();
    });
  }

  const targets = removing ? stages.filter((stage) => stage.id !== removing.id) : [];
  const targetName = targets.find((stage) => stage.id === targetId)?.name ?? "";

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>Etapas do CRM</CardTitle>
              <CardDescription>
                As colunas do Kanban, na ordem em que aparecem no quadro.
              </CardDescription>
            </div>
            {canManage ? (
              <Button variant="outline" onClick={openCreate}>
                <Plus className="size-4" />
                Nova etapa
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead className="text-right">Cards</TableHead>
                {canManage ? <TableHead className="w-40" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {stages.map((stage, index) => (
                <TableRow key={stage.id}>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {index + 1}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span
                        className="size-3 shrink-0 rounded-full"
                        style={{ backgroundColor: stage.color ?? DEFAULT_COLOR }}
                        aria-hidden
                      />
                      <span className="font-medium">{stage.name}</span>
                      {stage.isFinal ? <Badge variant="secondary">Final</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{stage.cardCount}</TableCell>
                  {canManage ? (
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Subir ${stage.name}`}
                          disabled={index === 0 || isPending}
                          onClick={() => reorder(stage, "up")}
                        >
                          <ArrowUp className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Descer ${stage.name}`}
                          disabled={index === stages.length - 1 || isPending}
                          onClick={() => reorder(stage, "down")}
                        >
                          <ArrowDown className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Editar ${stage.name}`}
                          onClick={() => openEdit(stage)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remover ${stage.name}`}
                          disabled={stages.length <= 1}
                          onClick={() => openRemove(stage)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={creating || editing !== null} onOpenChange={(next) => !next && closeForm()}>
        <DialogContent>
          <form onSubmit={submit} className="contents">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar etapa" : "Nova etapa"}</DialogTitle>
              <DialogDescription>
                Uma etapa é uma coluna do quadro. A nova entra no fim e pode ser reordenada.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <Field label="Nome" htmlFor="stage-name" required>
                <Input
                  id="stage-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Cancelados"
                  autoFocus
                />
              </Field>

              <Field label="Cor" htmlFor="stage-color" hint="Marca a coluna no quadro.">
                <div className="flex items-center gap-2">
                  <Input
                    id="stage-color"
                    type="color"
                    value={color}
                    onChange={(event) => setColor(event.target.value)}
                    className="h-9 w-16 p-1"
                  />
                  <span className="text-muted-foreground font-mono text-xs">{color}</span>
                </div>
              </Field>

              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Etapa final</p>
                  <p className="text-muted-foreground text-xs">
                    Quem chega aqui é dado como concluído: o card fecha e o serviço também.
                  </p>
                </div>
                <Switch checked={isFinal} onCheckedChange={setIsFinal} />
              </div>
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

      <Dialog open={removing !== null} onOpenChange={(next) => !next && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover “{removing?.name ?? ""}”?</DialogTitle>
            <DialogDescription>
              {removing && removing.cardCount > 0
                ? `A coluna sai do quadro e os ${removing.cardCount} card(s) dela precisam de um novo lugar.`
                : "A coluna não tem cards e sai do quadro."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Field label="Mover os cards para" required>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger className="w-full">
                  <SelectValue>{targetName || "Escolher etapa"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {targets.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <p className="text-muted-foreground text-xs">
              A etapa deixa de aparecer no quadro, mas continua legível no histórico dos cards
              que passaram por ela. A movimentação entra no histórico como qualquer outra.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRemoving(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!targetId || isPending}
              onClick={confirmRemove}
            >
              {isPending ? "Removendo..." : "Remover etapa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
