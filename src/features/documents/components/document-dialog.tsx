"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/common/field";
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
import { CustomerPicker } from "@/features/customers/components/customer-picker";
import type { CustomerOption } from "@/server/customers/customers-actions";
import { createDocumentAction } from "@/server/documents/documents-actions";

const KIND_LABEL: Record<string, string> = {
  DRIVE_FOLDER: "Pasta do Drive",
  CONTRACT: "Contrato",
  RECEIPT: "Comprovante",
  OTHER: "Outro",
};

export function DocumentDialog({ recentCustomers }: { recentCustomers: CustomerOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [customer, setCustomer] = useState<CustomerOption | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState("OTHER");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});

    startTransition(async () => {
      const result = await createDocumentAction({
        customerId: customer?.id ?? null,
        title,
        url,
        kind,
        notes: null,
      });

      if (!result.success) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }

      toast.success("Documento registrado.");
      setOpen(false);
      setTitle("");
      setUrl("");
      setCustomer(null);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <Plus className="size-4" />
            Novo link
          </Button>
        }
      />
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto] ">
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>Novo documento</DialogTitle>
            <DialogDescription>
              Os arquivos ficam no Google Drive. Aqui guardamos apenas o link.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="-mx-1 min-h-0 px-1">
              <div className="grid gap-4 pb-1">
              <Field label="Cliente">
                <CustomerPicker
                  value={customer}
                  onChange={setCustomer}
                  initialOptions={recentCustomers}
                />
              </Field>

              <Field label="Título" htmlFor="title" required error={errors.title}>
                <Input
                  id="title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Contrato assinado"
                />
              </Field>

              <Field label="URL" htmlFor="url" required error={errors.url}>
                <Input
                  id="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://drive.google.com/..."
                />
              </Field>

              <Field label="Tipo">
                <Select value={kind} onValueChange={(value) => setKind(value ?? "OTHER")}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{KIND_LABEL[kind]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(KIND_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
