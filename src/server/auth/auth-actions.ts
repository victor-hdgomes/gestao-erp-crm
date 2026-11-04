"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { recordAudit } from "@/server/shared/audit";

const loginSchema = z.object({
  email: z.string().email("Informe um e-mail válido."),
  password: z.string().min(1, "Informe a senha."),
});

export type LoginState = { error: string | null };

export async function loginAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });

  // Same message for unknown e-mail and wrong password: no account enumeration.
  const invalid = { error: "E-mail ou senha incorretos." };
  if (!user || !user.isActive || user.deletedAt) return invalid;

  const matches = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!matches) return invalid;

  const headerList = await headers();
  await createSession(user.id, {
    userAgent: headerList.get("user-agent"),
    ipAddress: headerList.get("x-forwarded-for"),
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  await recordAudit({
    userId: user.id,
    action: "auth.login",
    entity: "User",
    entityId: user.id,
  });

  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
