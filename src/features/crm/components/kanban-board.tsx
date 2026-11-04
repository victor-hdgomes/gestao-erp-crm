"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AlertTriangle, CalendarClock, GripVertical } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCpf, formatCurrency, formatDate, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { moveCardAction } from "@/server/crm/crm-actions";
import type { KanbanCard, KanbanColumn } from "@/server/crm/crm-service";

type KanbanBoardProps = {
  columns: KanbanColumn[];
  canManage: boolean;
  onOpenCard: (cardId: string) => void;
};

export function KanbanBoard({ columns, canManage, onOpenCard }: KanbanBoardProps) {
  const [board, setBoard] = useState(columns);
  const [syncedColumns, setSyncedColumns] = useState(columns);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // The server re-renders the board after every move; adopt it during render
  // instead of in an effect, which would cause a second pass.
  if (syncedColumns !== columns) {
    setSyncedColumns(columns);
    setBoard(columns);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const draggingCard = useMemo(() => {
    if (!draggingId) return null;
    for (const column of board) {
      const card = column.cards.find((item) => item.id === draggingId);
      if (card) return card;
    }
    return null;
  }, [board, draggingId]);

  function handleDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    setDraggingId(null);
    const cardId = String(event.active.id);
    const toStageId = event.over ? String(event.over.id) : null;
    if (!toStageId) return;

    const fromColumn = board.find((column) =>
      column.cards.some((card) => card.id === cardId),
    );
    if (!fromColumn || fromColumn.id === toStageId) return;

    const card = fromColumn.cards.find((item) => item.id === cardId)!;
    const previous = board;

    // Optimistic: the card moves now, and we roll back if the server says no.
    setBoard((current) =>
      current.map((column) => {
        if (column.id === fromColumn.id) {
          return { ...column, cards: column.cards.filter((item) => item.id !== cardId) };
        }
        if (column.id === toStageId) {
          return { ...column, cards: [...column.cards, card] };
        }
        return column;
      }),
    );

    const result = await moveCardAction({ cardId, toStageId });
    if (!result.success) {
      setBoard(previous);
      toast.error(result.error);
      return;
    }
    toast.success("Card movido.");
  }

  return (
    <DndContext
      // A fixed id keeps dnd-kit's generated aria ids identical on the server and
      // on the client, which is what the board needs to hydrate cleanly.
      id="crm-kanban"
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggingId(null)}
    >
      <ScrollArea className="w-full pb-4">
        <div className="flex gap-4">
          {board.map((column) => (
            <KanbanColumnView
              key={column.id}
              column={column}
              canManage={canManage}
              onOpenCard={onOpenCard}
            />
          ))}
        </div>
      </ScrollArea>

      <DragOverlay>
        {draggingCard ? (
          <KanbanCardView card={draggingCard} canManage={false} onOpenCard={() => {}} overlay />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumnView({
  column,
  canManage,
  onOpenCard,
}: {
  column: KanbanColumn;
  canManage: boolean;
  onOpenCard: (cardId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div className="w-80 shrink-0">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: column.color ?? "var(--muted-foreground)" }}
            aria-hidden
          />
          <h2 className="truncate text-sm font-medium">{column.name}</h2>
          <Badge variant="secondary">{column.totals.count}</Badge>
        </div>
      </div>

      <p className="text-muted-foreground mb-2 px-1 text-xs tabular-nums">
        {formatCurrency(column.totals.contracted)} contratado ·{" "}
        {formatCurrency(column.totals.pending)} pendente
      </p>

      <div
        ref={setNodeRef}
        className={cn(
          "bg-muted/40 min-h-[200px] space-y-2 rounded-lg border p-2 transition-colors",
          isOver && "border-primary bg-primary/5",
        )}
      >
        {column.cards.length === 0 ? (
          <p className="text-muted-foreground px-2 py-6 text-center text-xs">
            Nenhum cliente nesta etapa.
          </p>
        ) : (
          column.cards.map((card) => (
            <KanbanCardView
              key={card.id}
              card={card}
              canManage={canManage}
              onOpenCard={onOpenCard}
            />
          ))
        )}
      </div>
    </div>
  );
}

function KanbanCardView({
  card,
  canManage,
  onOpenCard,
  overlay = false,
}: {
  card: KanbanCard;
  canManage: boolean;
  onOpenCard: (cardId: string) => void;
  overlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    disabled: !canManage || overlay,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const overdue = (card.contract?.overdueCount ?? 0) > 0;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "gap-0 py-0 shadow-sm transition-opacity",
        isDragging && "opacity-40",
        overlay && "rotate-1 shadow-lg",
      )}
    >
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start gap-2">
          {canManage && !overlay ? (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground mt-0.5 cursor-grab touch-none"
              aria-label="Arrastar card"
              {...listeners}
              {...attributes}
            >
              <GripVertical className="size-4" />
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => onOpenCard(card.id)}
            className="min-w-0 flex-1 text-left"
          >
            <p className="truncate text-sm font-medium">{card.customer.name}</p>
            <p className="text-muted-foreground truncate text-xs tabular-nums">
              {formatCpf(card.customer.document)} · {formatPhone(card.customer.phone)}
            </p>
          </button>

          {overdue ? (
            <span className="text-destructive" title="Parcela vencida">
              <AlertTriangle className="size-4" />
            </span>
          ) : null}
        </div>

        {card.contract ? (
          <div className="grid grid-cols-3 gap-1 border-t pt-2 text-xs">
            <div>
              <p className="text-muted-foreground">Contratado</p>
              <p className="font-medium tabular-nums">
                {formatCurrency(card.contract.total)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Recebido</p>
              <p className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatCurrency(card.contract.received)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Pendente</p>
              <p
                className={cn(
                  "font-medium tabular-nums",
                  Number(card.contract.pending) > 0 && "text-amber-600 dark:text-amber-400",
                )}
              >
                {formatCurrency(card.contract.pending)}
              </p>
            </div>
          </div>
        ) : null}

        {card.contract?.nextDueDate ? (
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <CalendarClock className="size-3.5" />
            Próxima cobrança em {formatDate(card.contract.nextDueDate)}
            {card.contract.nextDueAmount
              ? ` · ${formatCurrency(card.contract.nextDueAmount)}`
              : ""}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
