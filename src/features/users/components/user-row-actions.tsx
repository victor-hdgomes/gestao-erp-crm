"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  UserDialog,
  type RoleOption,
  type UserFormValues,
} from "@/features/users/components/user-dialog";

export function UserRowActions({
  roles,
  user,
}: {
  roles: RoleOption[];
  user: UserFormValues;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Editar ${user.name}`}
        onClick={() => setOpen(true)}
      >
        <Pencil className="size-4" />
      </Button>
      <UserDialog roles={roles} user={user} open={open} onOpenChange={setOpen} />
    </>
  );
}
