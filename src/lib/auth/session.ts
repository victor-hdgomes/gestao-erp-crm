import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import { isProduction } from "@/lib/env";
import { forbidden, unauthorized } from "@/lib/errors";
import type { PermissionKey } from "@/lib/auth/permissions";

export const SESSION_COOKIE = "gestao_session";
const SESSION_TTL_DAYS = 7;

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  roles: string[];
  permissions: PermissionKey[];
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ipAddress?: string | null } = {},
): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      userAgent: meta.userAgent ?? null,
      ipAddress: meta.ipAddress ?? null,
    },
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;

  if (token) {
    await prisma.session.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  jar.delete(SESSION_COOKIE);
}

/** Resolves the signed-in user once per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: {
          userRoles: {
            include: {
              role: { include: { rolePermissions: { include: { permission: true } } } },
            },
          },
        },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (!session.user.isActive || session.user.deletedAt) return null;

  const permissions = new Set<string>();
  for (const userRole of session.user.userRoles) {
    for (const rolePermission of userRole.role.rolePermissions) {
      permissions.add(rolePermission.permission.key);
    }
  }

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    roles: session.user.userRoles.map((userRole) => userRole.role.key),
    permissions: Array.from(permissions) as PermissionKey[],
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  return user;
}

export async function requirePermission(permission: PermissionKey): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.permissions.includes(permission)) {
    throw forbidden(`Permissão necessária: ${permission}.`);
  }
  return user;
}

export function hasPermission(user: SessionUser | null, permission: PermissionKey): boolean {
  return Boolean(user?.permissions.includes(permission));
}

export function hasAnyPermission(
  user: SessionUser | null,
  permissions: PermissionKey[],
): boolean {
  return permissions.some((permission) => hasPermission(user, permission));
}
