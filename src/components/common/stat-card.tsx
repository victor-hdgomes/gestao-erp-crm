import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type StatTone = "default" | "positive" | "negative" | "warning";

const TONE_CLASS: Record<StatTone, string> = {
  default: "text-foreground",
  positive: "text-emerald-600 dark:text-emerald-400",
  negative: "text-rose-600 dark:text-rose-400",
  warning: "text-amber-600 dark:text-amber-400",
};

type StatCardProps = {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: StatTone;
};

export function StatCard({ label, value, hint, icon: Icon, tone = "default" }: StatCardProps) {
  return (
    <Card className="gap-0 py-4">
      <CardContent className="px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-muted-foreground truncate text-xs font-medium tracking-wide uppercase">
              {label}
            </p>
            <p className={cn("truncate text-2xl font-semibold tabular-nums", TONE_CLASS[tone])}>
              {value}
            </p>
            {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
          </div>
          {Icon ? (
            <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md">
              <Icon className="size-4" />
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
