import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FieldProps = {
  label: string;
  htmlFor?: string;
  error?: string | string[] | null;
  /** Not a blocker: something the user should see before saving anyway. */
  warning?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
};

export function Field({
  label,
  htmlFor,
  error,
  warning,
  hint,
  required,
  className,
  children,
}: FieldProps) {
  const message = Array.isArray(error) ? error[0] : error;

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-destructive ml-0.5">*</span> : null}
      </Label>
      {children}
      {message ? (
        <p className="text-destructive text-xs">{message}</p>
      ) : warning ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">{warning}</p>
      ) : hint ? (
        <p className="text-muted-foreground text-xs">{hint}</p>
      ) : null}
    </div>
  );
}
