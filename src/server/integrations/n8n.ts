import "server-only";

import { readCredential } from "@/server/integrations/credentials-service";

/**
 * n8n is complementary: no core flow may depend on it being reachable.
 */
export async function testN8nConnection(): Promise<{ ok: boolean; message: string }> {
  const baseUrl = await readCredential("N8N", "baseUrl");
  if (!baseUrl) return { ok: false, message: "URL da instância não configurada." };

  const apiKey = await readCredential("N8N", "apiKey");

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/rest/login`, {
      headers: apiKey ? { "X-N8N-API-KEY": apiKey } : undefined,
      cache: "no-store",
    });

    return response.status < 500
      ? { ok: true, message: `Instância respondeu ${response.status}.` }
      : { ok: false, message: `Instância respondeu ${response.status}.` };
  } catch {
    return { ok: false, message: "Não foi possível alcançar a instância do n8n." };
  }
}
