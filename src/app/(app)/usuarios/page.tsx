import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserDialog } from "@/features/users/components/user-dialog";
import { UserRowActions } from "@/features/users/components/user-row-actions";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission, requirePermission } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { listRoles, listUsers } from "@/server/users/users-service";

export const metadata: Metadata = { title: "Usuários" };

export default async function UsersPage() {
  const currentUser = await requirePermission(PERMISSIONS.USER_VIEW);
  const canManage = hasPermission(currentUser, PERMISSIONS.USER_MANAGE);

  const [users, roles] = await Promise.all([listUsers(), listRoles()]);
  const roleOptions = roles.map((role) => ({
    key: role.key,
    name: role.name,
    description: role.description,
  }));

  return (
    <div>
      <PageHeader
        title="Usuários"
        help="usuarios"
        description="Controle quem acessa o sistema e com quais permissões."
        actions={canManage ? <UserDialog roles={roleOptions} /> : null}
      />

      <Card className="py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Perfis</TableHead>
                <TableHead>Último acesso</TableHead>
                <TableHead>Status</TableHead>
                {canManage ? <TableHead className="w-12" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.userRoles.map((userRole) => (
                        <Badge key={userRole.roleId} variant="secondary">
                          {userRole.role.name}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.isActive ? "default" : "outline"}>
                      {user.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  {canManage ? (
                    <TableCell>
                      <UserRowActions
                        roles={roleOptions}
                        user={{
                          id: user.id,
                          name: user.name,
                          email: user.email,
                          isActive: user.isActive,
                          roleKeys: user.userRoles.map((userRole) => userRole.role.key),
                        }}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
