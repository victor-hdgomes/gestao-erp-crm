"use client";

import { useId, useState, type ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Accents and case should not stand between the user and a deliberate action. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

type ConfirmActionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  /**
   * What the user has to type to unlock the button — a code or a name they can
   * read on the screen. Typing it is the pause that keeps an accidental click
   * from doing something that cannot be undone.
   */
  confirmPhrase: string;
  confirmPhraseHint?: string;
  confirmLabel: string;
  /** Shown as an extra field and handed back to the caller. */
  reasonLabel?: string;
  reasonRequired?: boolean;
  pending?: boolean;
  onConfirm: (reason: string) => void;
};

export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmPhrase,
  confirmPhraseHint,
  confirmLabel,
  reasonLabel,
  reasonRequired = false,
  pending = false,
  onConfirm,
}: ConfirmActionDialogProps) {
  const fieldId = useId();
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");

  // Every opening starts from a blank slate: adjusting during render instead of in
  // an effect keeps it to a single pass.
  const [lastOpen, setLastOpen] = useState(open);
  if (lastOpen !== open) {
    setLastOpen(open);
    setTyped("");
    setReason("");
  }

  const phraseMatches = normalize(typed) === normalize(confirmPhrase);
  const reasonOk = !reasonRequired || reason.trim().length >= 3;
  const canConfirm = phraseMatches && reasonOk && !pending;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          {reasonLabel ? (
            <div className="space-y-1.5">
              <Label htmlFor={`${fieldId}-reason`}>
                {reasonLabel}
                {reasonRequired ? <span className="text-destructive"> *</span> : null}
              </Label>
              <Input
                id={`${fieldId}-reason`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Registrado na auditoria"
              />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-phrase`}>
              Para confirmar, digite{" "}
              <span className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
                {confirmPhrase}
              </span>
            </Label>
            <Input
              id={`${fieldId}-phrase`}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={typed.length > 0 && !phraseMatches}
              placeholder={confirmPhrase}
            />
            <p className="text-muted-foreground text-xs">
              {confirmPhraseHint ?? "Esta ação fica registrada e não se desfaz sozinha."}
            </p>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!canConfirm}
            onClick={() => {
              if (!canConfirm) return;
              onConfirm(reason.trim());
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
