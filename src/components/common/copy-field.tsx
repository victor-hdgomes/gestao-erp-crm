"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CopyFieldProps = {
  label: string;
  value: string | null | undefined;
  /** Text actually copied, when it differs from what is displayed. */
  copyValue?: string | null;
  className?: string;
};

export function CopyField({ label, value, copyValue, className }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);
  const display = value && value.length > 0 ? value : "—";
  const payload = copyValue ?? value ?? "";
  const canCopy = payload.length > 0;

  async function handleCopy() {
    if (!canCopy) return;
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      toast.success(`${label} copiado.`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Não foi possível copiar. Copie manualmente.");
    }
  }

  return (
    <div className={cn("group flex items-start justify-between gap-2 py-1.5", className)}>
      <div className="min-w-0 space-y-0.5">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="truncate text-sm font-medium">{display}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Copiar ${label}`}
        disabled={!canCopy}
        onClick={handleCopy}
        className="size-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  );
}
