"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, ChevronsUpDown, Loader2, UserPlus, UserRound } from "lucide-react";
import { toast } from "sonner";

import { MaskedInput } from "@/components/common/masked-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCpf } from "@/lib/format";
import {
  createCustomerAction,
  searchCustomersAction,
  type CustomerOption,
} from "@/server/customers/customers-actions";
import { cn } from "@/lib/utils";

type CustomerPickerProps = {
  value: CustomerOption | null;
  onChange: (customer: CustomerOption | null) => void;
  /** Rendered immediately so the first open already shows something useful. */
  initialOptions?: CustomerOption[];
  disabled?: boolean;
  /** Turn off where the user may not create customers. */
  allowCreate?: boolean;
};

export function CustomerPicker({
  value,
  onChange,
  initialOptions = [],
  disabled,
  allowCreate = true,
}: CustomerPickerProps) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<CustomerOption[]>([]);
  const [creating, setCreating] = useState(false);
  // Customers created from here stay listed until the page revalidates.
  const [justCreated, setJustCreated] = useState<CustomerOption[]>([]);
  const [isPending, startTransition] = useTransition();

  const searching = term.trim().length >= 2;
  const options = searching
    ? results
    : [
        ...justCreated,
        // After the page revalidates the new customer also arrives in the props.
        ...initialOptions.filter((option) => !justCreated.some((c) => c.id === option.id)),
      ];

  useEffect(() => {
    if (!open || !searching) return;

    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await searchCustomersAction(term);
        if (result.success) setResults(result.data);
      });
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, open]);

  function closePicker() {
    setOpen(false);
    setCreating(false);
    setTerm("");
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setCreating(false);
      }}
    >
      <PopoverTrigger
        disabled={disabled}
        render={
          <Button variant="outline" className="w-full justify-between font-normal">
            <span className="flex min-w-0 items-center gap-2">
              <UserRound className="size-4 shrink-0" />
              <span className="truncate">{value?.name ?? "Selecionar cliente"}</span>
            </span>
            <ChevronsUpDown className="size-4 opacity-50" />
          </Button>
        }
      />
      <PopoverContent className="w-(--anchor-width) min-w-72 p-0" align="start">
        {creating ? (
          <QuickCreateCustomer
            defaultName={searching ? term.trim() : ""}
            onCancel={() => setCreating(false)}
            onCreated={(customer) => {
              setJustCreated((current) => [customer, ...current]);
              onChange(customer);
              closePicker();
            }}
          />
        ) : (
          <>
            <div className="border-b p-2">
              <Input
                autoFocus
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Buscar por nome ou CPF"
              />
            </div>
            <ScrollArea className="max-h-64">
              {isPending ? (
                <p className="text-muted-foreground flex items-center gap-2 p-3 text-sm">
                  <Loader2 className="size-3.5 animate-spin" />
                  Buscando...
                </p>
              ) : options.length === 0 ? (
                <p className="text-muted-foreground p-3 text-sm">
                  {searching ? "Nenhum cliente encontrado." : "Digite ao menos 2 caracteres."}
                </p>
              ) : (
                <ul className="p-1">
                  {options.map((option) => (
                    <li key={option.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(option);
                          closePicker();
                        }}
                        className={cn(
                          "hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm",
                          value?.id === option.id && "bg-muted",
                        )}
                      >
                        <Check
                          className={cn(
                            "size-4 shrink-0",
                            value?.id === option.id ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{option.name}</span>
                          <span className="text-muted-foreground block truncate text-xs">
                            {formatCpf(option.document)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
            {allowCreate ? (
              <div className="border-t p-1">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-start font-normal"
                  onClick={() => setCreating(true)}
                >
                  <UserPlus className="size-4" />
                  Cadastrar novo cliente
                </Button>
              </div>
            ) : null}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function QuickCreateCustomer({
  defaultName,
  onCancel,
  onCreated,
}: {
  defaultName: string;
  onCancel: () => void;
  onCreated: (customer: CustomerOption) => void;
}) {
  // A digits-only search term is a CPF, not a name.
  const looksLikeDocument = /^\d[\d.\-\s]*$/.test(defaultName);
  const [name, setName] = useState(looksLikeDocument ? "" : defaultName);
  const [document, setDocument] = useState(
    looksLikeDocument ? defaultName.replace(/\D/g, "") : "",
  );
  const [phone, setPhone] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (name.trim().length < 3) {
      toast.error("Informe o nome completo.");
      return;
    }

    startTransition(async () => {
      const result = await createCustomerAction({
        name: name.trim(),
        document: document || null,
        phone: phone || null,
        status: "LEAD",
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success("Cliente cadastrado.");
      onCreated(result.data);
    });
  }

  return (
    <div
      className="space-y-3 p-3"
      onKeyDown={(event) => {
        // The picker lives inside other forms: Enter creates here, never submits them.
        if (event.key === "Enter") {
          event.preventDefault();
          submit();
        }
      }}
    >
      <p className="text-sm font-medium">Novo cliente</p>

      <div className="space-y-1.5">
        <Label htmlFor="quick-customer-name">Nome completo</Label>
        <Input
          autoFocus
          id="quick-customer-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Maria de Souza"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="quick-customer-document">CPF</Label>
          <MaskedInput
            id="quick-customer-document"
            mask="cpf"
            value={document}
            onValueChange={setDocument}
            placeholder="000.000.000-00"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="quick-customer-phone">Telefone</Label>
          <MaskedInput
            id="quick-customer-phone"
            mask="phone"
            value={phone}
            onValueChange={setPhone}
            placeholder="(00) 00000-0000"
          />
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        O restante do cadastro (endereço, e-mail) pode ser completado na ficha do cliente.
      </p>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="button" size="sm" disabled={isPending} onClick={submit}>
          {isPending ? "Salvando..." : "Cadastrar"}
        </Button>
      </div>
    </div>
  );
}
