import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/server/shared/audit";

const TOKEN_PREFIX = "lf";

export type IssuedApiKey = {
  id: string;
  name: string;
  prefix: string;
  /** Returned exactly once, at creation time. */
  token: string;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueApiKey(
  params: { name: string; provider?: string; scopes?: string[] },
  options: { actorId?: string | null } = {},
): Promise<IssuedApiKey> {
  const prefix = `${TOKEN_PREFIX}_${randomBytes(4).toString("hex")}`;
  const secret = randomBytes(32).toString("base64url");
  const token = `${prefix}.${secret}`;

  const apiKey = await prisma.apiKey.create({
    data: {
      name: params.name,
      provider: params.provider ?? "LEONA_FLOW",
      prefix,
      tokenHash: hashToken(token),
      scopes: params.scopes ?? [],
    },
  });

  await recordAudit({
    userId: options.actorId ?? null,
    action: "integration.apiKey.issue",
    entity: "ApiKey",
    entityId: apiKey.id,
    changes: { name: params.name, prefix },
  });

  return { id: apiKey.id, name: apiKey.name, prefix, token };
}

export async function revokeApiKey(
  id: string,
  options: { actorId?: string | null } = {},
): Promise<void> {
  await prisma.apiKey.update({
    where: { id },
    data: { isActive: false, revokedAt: new Date() },
  });

  await recordAudit({
    userId: options.actorId ?? null,
    action: "integration.apiKey.revoke",
    entity: "ApiKey",
    entityId: id,
  });
}

export async function listApiKeys() {
  return prisma.apiKey.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      provider: true,
      prefix: true,
      scopes: true,
      isActive: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
}

export type AuthenticatedApiKey = { id: string; name: string; provider: string; scopes: string[] };

/** Constant-time check of an `Authorization: Bearer <token>` header. */
export async function authenticateApiKey(
  authorizationHeader: string | null,
): Promise<AuthenticatedApiKey | null> {
  if (!authorizationHeader?.startsWith("Bearer ")) return null;

  const token = authorizationHeader.slice("Bearer ".length).trim();
  const [prefix] = token.split(".");
  if (!prefix) return null;

  const candidate = await prisma.apiKey.findUnique({ where: { prefix } });
  if (!candidate || !candidate.isActive || candidate.revokedAt) return null;

  const expected = Buffer.from(candidate.tokenHash, "hex");
  const provided = Buffer.from(hashToken(token), "hex");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;

  await prisma.apiKey.update({
    where: { id: candidate.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    id: candidate.id,
    name: candidate.name,
    provider: candidate.provider,
    scopes: candidate.scopes,
  };
}
