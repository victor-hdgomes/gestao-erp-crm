import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground border-transparent",
  success:
    "bg-emerald-100 text-emerald-800 border-transparent dark:bg-emerald-950 dark:text-emerald-300",
  warning:
    "bg-amber-100 text-amber-900 border-transparent dark:bg-amber-950 dark:text-amber-300",
  danger: "bg-rose-100 text-rose-800 border-transparent dark:bg-rose-950 dark:text-rose-300",
  info: "bg-sky-100 text-sky-800 border-transparent dark:bg-sky-950 dark:text-sky-300",
};

/** Single source of truth for how every domain status is worded and coloured. */
const STATUS_MAP: Record<string, { label: string; tone: StatusTone }> = {
  // Sales
  OPEN: { label: "Aberta", tone: "info" },
  PARTIALLY_PAID: { label: "Parcialmente paga", tone: "warning" },
  PAID: { label: "Paga", tone: "success" },
  CANCELLED: { label: "Cancelada", tone: "neutral" },

  // Installments
  PENDING: { label: "Pendente", tone: "info" },
  OVERDUE: { label: "Vencida", tone: "danger" },

  // Transactions
  PARTIALLY_SETTLED: { label: "Parcialmente recebida", tone: "warning" },
  SETTLED: { label: "Liquidada", tone: "success" },
  REFUNDED: { label: "Estornada", tone: "neutral" },

  // Contracts
  DRAFT: { label: "Rascunho", tone: "neutral" },
  ACTIVE: { label: "Ativo", tone: "info" },
  COMPLETED: { label: "Concluído", tone: "success" },

  // Customers
  LEAD: { label: "Lead", tone: "neutral" },
  INACTIVE: { label: "Inativo", tone: "neutral" },
  BLOCKED: { label: "Bloqueado", tone: "danger" },

  // Services
  NOT_STARTED: { label: "Não iniciado", tone: "neutral" },
  IN_PROGRESS: { label: "Em andamento", tone: "info" },

  // Integration events
  RECEIVED: { label: "Recebido", tone: "info" },
  PROCESSED: { label: "Processado", tone: "success" },
  FAILED: { label: "Falhou", tone: "danger" },
  DUPLICATE: { label: "Duplicado", tone: "warning" },
};

export function statusLabel(status: string): string {
  return STATUS_MAP[status]?.label ?? status;
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const entry = STATUS_MAP[status] ?? { label: status, tone: "neutral" as StatusTone };
  return (
    <Badge variant="outline" className={cn(TONE_CLASS[entry.tone], className)}>
      {entry.label}
    </Badge>
  );
}
