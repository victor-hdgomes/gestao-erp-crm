"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/common/field";
import { MaskedInput } from "@/components/common/masked-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createCustomerAction,
  updateCustomerAction,
} from "@/server/customers/customers-actions";

export type CustomerFormValues = {
  id?: string;
  name: string;
  document: string;
  phone: string;
  email: string;
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  driveFolderUrl: string;
  notes: string;
  status: "LEAD" | "ACTIVE" | "INACTIVE" | "BLOCKED";
};

const EMPTY: CustomerFormValues = {
  name: "",
  document: "",
  phone: "",
  email: "",
  zipCode: "",
  street: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  state: "",
  driveFolderUrl: "",
  notes: "",
  status: "ACTIVE",
};

const STATUS_LABEL: Record<CustomerFormValues["status"], string> = {
  LEAD: "Lead",
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  BLOCKED: "Bloqueado",
};

type CustomerDialogProps = {
  customer?: CustomerFormValues;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function CustomerDialog({
  customer,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: CustomerDialogProps) {
  const router = useRouter();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  const [values, setValues] = useState<CustomerFormValues>(customer ?? EMPTY);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});

    startTransition(async () => {
      const payload = {
        ...values,
        document: values.document || null,
        phone: values.phone || null,
        email: values.email || null,
        zipCode: values.zipCode || null,
        street: values.street || null,
        number: values.number || null,
        complement: values.complement || null,
        district: values.district || null,
        city: values.city || null,
        state: values.state || null,
        driveFolderUrl: values.driveFolderUrl || null,
        notes: values.notes || null,
      };

      const result = customer?.id
        ? await updateCustomerAction(customer.id, payload)
        : await createCustomerAction(payload);

      if (!result.success) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }

      toast.success(customer?.id ? "Cliente atualizado." : "Cliente cadastrado.");
      setOpen(false);
      if (!customer?.id) setValues(EMPTY);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setValues(customer ?? EMPTY);
      }}
    >
      {isControlled ? null : (
        <DialogTrigger
          render={
            (trigger as React.ReactElement) ?? (
              <Button>
                <Plus className="size-4" />
                Novo cliente
              </Button>
            )
          }
        />
      )}
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-2xl">
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>{customer?.id ? "Editar cliente" : "Novo cliente"}</DialogTitle>
            <DialogDescription>
              O CPF é validado e não pode se repetir entre clientes.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="-mx-1 min-h-0 px-1">
            <div className="grid gap-4 pb-1">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nome completo" htmlFor="name" required error={errors.name}>
                  <Input
                    id="name"
                    value={values.name}
                    onChange={(event) => set("name", event.target.value)}
                  />
                </Field>

                <Field label="CPF" htmlFor="document" error={errors.document}>
                  <MaskedInput
                    id="document"
                    mask="cpf"
                    value={values.document}
                    onValueChange={(value) => set("document", value)}
                    placeholder="000.000.000-00"
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Telefone" htmlFor="phone" error={errors.phone}>
                  <MaskedInput
                    id="phone"
                    mask="phone"
                    value={values.phone}
                    onValueChange={(value) => set("phone", value)}
                    placeholder="(11) 90000-0000"
                  />
                </Field>

                <Field label="E-mail" htmlFor="email" error={errors.email}>
                  <Input
                    id="email"
                    type="email"
                    value={values.email}
                    onChange={(event) => set("email", event.target.value)}
                  />
                </Field>

                <Field label="Status" error={errors.status}>
                  <Select
                    value={values.status}
                    onValueChange={(value) =>
                      set("status", value as CustomerFormValues["status"])
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>{STATUS_LABEL[values.status]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-4">
                <Field label="CEP" htmlFor="zipCode" error={errors.zipCode}>
                  <MaskedInput
                    id="zipCode"
                    mask="zip"
                    value={values.zipCode}
                    onValueChange={(value) => set("zipCode", value)}
                  />
                </Field>

                <Field
                  label="Logradouro"
                  htmlFor="street"
                  error={errors.street}
                  className="sm:col-span-2"
                >
                  <Input
                    id="street"
                    value={values.street}
                    onChange={(event) => set("street", event.target.value)}
                  />
                </Field>

                <Field label="Número" htmlFor="number" error={errors.number}>
                  <Input
                    id="number"
                    value={values.number}
                    onChange={(event) => set("number", event.target.value)}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-4">
                <Field label="Complemento" htmlFor="complement" error={errors.complement}>
                  <Input
                    id="complement"
                    value={values.complement}
                    onChange={(event) => set("complement", event.target.value)}
                  />
                </Field>

                <Field label="Bairro" htmlFor="district" error={errors.district}>
                  <Input
                    id="district"
                    value={values.district}
                    onChange={(event) => set("district", event.target.value)}
                  />
                </Field>

                <Field label="Cidade" htmlFor="city" error={errors.city}>
                  <Input
                    id="city"
                    value={values.city}
                    onChange={(event) => set("city", event.target.value)}
                  />
                </Field>

                <Field label="UF" htmlFor="state" error={errors.state}>
                  <Input
                    id="state"
                    maxLength={2}
                    value={values.state}
                    onChange={(event) => set("state", event.target.value.toUpperCase())}
                  />
                </Field>
              </div>

              <Field
                label="Pasta no Google Drive"
                htmlFor="driveFolderUrl"
                error={errors.driveFolderUrl}
                hint="Cole o link da pasta do cliente. O sistema só guarda e abre o link."
              >
                <Input
                  id="driveFolderUrl"
                  value={values.driveFolderUrl}
                  onChange={(event) => set("driveFolderUrl", event.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..."
                />
              </Field>

              <Field label="Observações" htmlFor="notes" error={errors.notes}>
                <Textarea
                  id="notes"
                  rows={3}
                  value={values.notes}
                  onChange={(event) => set("notes", event.target.value)}
                />
              </Field>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
