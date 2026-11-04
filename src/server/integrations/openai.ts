import "server-only";

import { readCredential } from "@/server/integrations/credentials-service";

/**
 * The AI features are optional: nothing in the ERP depends on this being set.
 */
export async function isOpenAiEnabled(): Promise<boolean> {
  return Boolean(await readCredential("OPENAI", "apiKey"));
}

export async function testOpenAiConnection(): Promise<{ ok: boolean; message: string }> {
  const apiKey = await readCredential("OPENAI", "apiKey");
  if (!apiKey) return { ok: false, message: "API Key não configurada." };

  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });

    if (!response.ok) {
      return { ok: false, message: `OpenAI respondeu ${response.status}.` };
    }
    return { ok: true, message: "Credencial válida." };
  } catch {
    return { ok: false, message: "Não foi possível alcançar a OpenAI." };
  }
}
