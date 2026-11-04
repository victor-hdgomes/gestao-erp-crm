"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ActionResult } from "@/server/shared/action-result";

export type LookupOption = { id: string; name: string };

type CreatableSelectProps = {
  value: string | null;
  onValueChange: (id: string | null) => void;
  options: LookupOption[];
  /** Shown when nothing is selected. */
  placeholder: string;
  /** When set, an explicit "no selection" entry is offered with this label. */
  emptyLabel?: string;
  createLabel: string;
  createPlaceholder: string;
  onCreate: (name: string) => Promise<ActionResult<LookupOption>>;
  disabled?: boolean;
  id?: string;
};

const CREATE_VALUE = "__create__";
const EMPTY_VALUE = "__empty__";

/**
 * A select that can also create the thing it selects, so a missing category or
 * payment method never forces the user to abandon the form they are filling.
 */
export function CreatableSelect({
  value,
  onValueChange,
  options,
  placeholder,
  emptyLabel,
  createLabel,
  createPlaceholder,
  onCreate,
  disabled,
  id,
}: CreatableSelectProps) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  // Keeps a freshly created option visible before the server revalidation lands.
  const [created, setCreated] = useState<LookupOption[]>([]);
  const [isPending, startTransition] = useTransition();

  const all = [...options, ...created.filter((item) => !options.some((o) => o.id === item.id))];
  const selected = all.find((option) => option.id === value) ?? null;

  function submitDraft() {
    const name = draft.trim();
    if (name.length < 2) {
      toast.error("Informe ao menos 2 caracteres.");
      return;
    }

    startTransition(async () => {
      const result = await onCreate(name);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      setCreated((current) => [...current, result.data]);
      onValueChange(result.data.id);
      setDraft("");
      setCreating(false);
      toast.success(`"${result.data.name}" cadastrado.`);
    });
  }

  if (creating) {
    return (
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          id={id}
          value={draft}
          disabled={isPending}
          placeholder={createPlaceholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter must not submit the surrounding form, only this inline create.
            if (event.key === "Enter") {
              event.preventDefault();
              submitDraft();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setCreating(false);
              setDraft("");
            }
          }}
        />
        <Button
          type="button"
          size="icon"
          aria-label="Confirmar cadastro"
          disabled={isPending}
          onClick={submitDraft}
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Cancelar cadastro"
          disabled={isPending}
          onClick={() => {
            setCreating(false);
            setDraft("");
          }}
        >
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <Select
      value={value ?? EMPTY_VALUE}
      onValueChange={(next) => {
        if (next === CREATE_VALUE) {
          setCreating(true);
          return;
        }
        onValueChange(next === EMPTY_VALUE ? null : next);
      }}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue>{selected?.name ?? emptyLabel ?? placeholder}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {emptyLabel ? <SelectItem value={EMPTY_VALUE}>{emptyLabel}</SelectItem> : null}
        {all.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.name}
          </SelectItem>
        ))}
        <SelectSeparator />
        <SelectItem value={CREATE_VALUE}>
          <Plus className="size-4" />
          {createLabel}
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
