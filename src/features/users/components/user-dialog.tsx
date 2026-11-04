"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createUserAction, updateUserAction } from "@/server/users/users-actions";

export type RoleOption = { key: string; name: string; description: string | null };

export type UserFormValues = {
  id?: string;
  name: string;
  email: string;
  isActive: boolean;
  roleKeys: string[];
};

type UserDialogProps = {
  roles: RoleOption[];
  user?: UserFormValues;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
};

export function UserDialog({
  roles,
  user,
  open: controlledOpen,
  onOpenChange,
  trigger,
}: UserDialogProps) {
  const router = useRouter();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [roleKeys, setRoleKeys] = useState<string[]>(user?.roleKeys ?? []);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  function toggleRole(key: string, checked: boolean) {
    setRoleKeys((current) =>
      checked ? [...new Set([...current, key])] : current.filter((item) => item !== key),
    );
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});

    startTransition(async () => {
      const result = user?.id
        ? await updateUserAction(user.id, {
            name,
            isActive,
            roleKeys,
            password: password || null,
          })
        : await createUserAction({ name, email, password, roleKeys });

      if (!result.success) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }

      toast.success(user?.id ? "Usuário atualizado." : "Usuário criado.");
      setOpen(false);
      setPassword("");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {isControlled ? null : (
        <DialogTrigger
          render={
            (trigger as React.ReactElement) ?? (
              <Button>
                <Plus className="size-4" />
                Novo usuário
              </Button>
            )
          }
        />
      )}
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto] ">
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>{user?.id ? "Editar usuário" : "Novo usuário"}</DialogTitle>
            <DialogDescription>
              As permissões são verificadas no backend, não apenas na interface.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="-mx-1 min-h-0 px-1">
              <div className="grid gap-4 pb-1">
              <Field label="Nome" htmlFor="user-name" required error={errors.name}>
                <Input
                  id="user-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>

              <Field label="E-mail" htmlFor="user-email" required error={errors.email}>
                <Input
                  id="user-email"
                  type="email"
                  value={email}
                  disabled={Boolean(user?.id)}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>

              <Field
                label={user?.id ? "Nova senha (opcional)" : "Senha"}
                htmlFor="user-password"
                required={!user?.id}
                error={errors.password}
                hint="Mínimo de 8 caracteres, com letras e números. Trocar a senha encerra as sessões."
              >
                <Input
                  id="user-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </Field>

              <div className="space-y-2">
                <Label>Perfis de acesso</Label>
                <div className="space-y-2 rounded-md border p-3">
                  {roles.map((role) => (
                    <label key={role.key} className="flex items-start gap-2.5 text-sm">
                      <Checkbox
                        checked={roleKeys.includes(role.key)}
                        onCheckedChange={(checked) => toggleRole(role.key, checked === true)}
                      />
                      <span>
                        <span className="font-medium">{role.name}</span>
                        {role.description ? (
                          <span className="text-muted-foreground block text-xs">
                            {role.description}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  ))}
                </div>
                {errors.roleKeys ? (
                  <p className="text-destructive text-xs">{errors.roleKeys[0]}</p>
                ) : null}
              </div>

              {user?.id ? (
                <div className="flex items-center justify-between gap-4 rounded-md border p-3">
                  <span className="text-sm">Usuário ativo</span>
                  <Switch checked={isActive} onCheckedChange={setIsActive} />
                </div>
              ) : null}
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
