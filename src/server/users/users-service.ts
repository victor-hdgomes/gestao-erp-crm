import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { conflict, notFound, unprocessable } from "@/lib/errors";
import { hashPassword, isStrongEnough, PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { recordAudit } from "@/server/shared/audit";

export const userCreateSchema = z.object({
  name: z.string().trim().min(3, "Informe o nome."),
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  password: z.string().min(PASSWORD_MIN_LENGTH, `Mínimo de ${PASSWORD_MIN_LENGTH} caracteres.`),
  roleKeys: z.array(z.string()).min(1, "Selecione ao menos um perfil."),
});

export const userUpdateSchema = z.object({
  name: z.string().trim().min(3).optional(),
  isActive: z.boolean().optional(),
  roleKeys: z.array(z.string()).min(1).optional(),
  password: z.string().min(PASSWORD_MIN_LENGTH).optional().nullable(),
});

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

export async function listUsers() {
  return prisma.user.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: { userRoles: { include: { role: true } } },
  });
}

export async function listRoles() {
  return prisma.role.findMany({ orderBy: { name: "asc" } });
}

export async function createUser(
  input: UserCreateInput,
  options: { actorId?: string | null } = {},
) {
  if (!isStrongEnough(input.password)) {
    throw unprocessable("A senha precisa ter letras e números.");
  }

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw conflict("Já existe um usuário com este e-mail.");

  const roles = await prisma.role.findMany({ where: { key: { in: input.roleKeys } } });
  if (roles.length === 0) throw notFound("Perfil");

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      userRoles: { create: roles.map((role) => ({ roleId: role.id })) },
    },
  });

  await recordAudit({
    userId: options.actorId ?? null,
    action: "user.create",
    entity: "User",
    entityId: user.id,
    changes: { email: user.email, roles: input.roleKeys },
  });

  return user;
}

export async function updateUser(
  id: string,
  input: UserUpdateInput,
  options: { actorId?: string | null } = {},
) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) throw notFound("Usuário");

  if (input.password && !isStrongEnough(input.password)) {
    throw unprocessable("A senha precisa ter letras e números.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        name: input.name ?? undefined,
        isActive: input.isActive ?? undefined,
        passwordHash: input.password ? await hashPassword(input.password) : undefined,
      },
    });

    if (input.roleKeys) {
      const roles = await tx.role.findMany({ where: { key: { in: input.roleKeys } } });
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({
        data: roles.map((role) => ({ userId: id, roleId: role.id })),
        skipDuplicates: true,
      });
    }

    // Deactivating a user must also end their open sessions.
    if (input.isActive === false || input.password) {
      await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  });

  await recordAudit({
    userId: options.actorId ?? null,
    action: "user.update",
    entity: "User",
    entityId: id,
    changes: { name: input.name, isActive: input.isActive, roles: input.roleKeys },
  });
}
