import { describe, expect, it } from "vitest";

import { leonaCustomerSchema } from "@/server/integrations/leona-handlers";

/**
 * O nome que chega pelo webhook e o do perfil do WhatsApp. Em 11/11 um
 * pagamento de R$ 58,50 se perdeu inteiro porque o perfil do cliente se chama
 * "DR": o cadastro exigia tres letras, o fluxo morreu no primeiro no e a
 * pessoa pagou sem venda, sem lancamento e sem mensagem de confirmacao.
 */
describe("cadastro do cliente vindo da Leona", () => {
  const base = {
    phone: "14998550509",
    externalId: "leona:14998550509",
    source: "Leona Flow",
    status: "ACTIVE" as const,
  };

  it("aceita o nome curto do perfil do WhatsApp", () => {
    expect(leonaCustomerSchema.parse({ ...base, name: "DR" }).name).toBe("DR");
    expect(leonaCustomerSchema.parse({ ...base, name: "Zé" }).name).toBe("Zé");
  });

  it("cai no telefone quando o perfil nao tem nome", () => {
    expect(leonaCustomerSchema.parse({ ...base, name: "" }).name).toBe("14998550509");
    expect(leonaCustomerSchema.parse({ ...base, name: "   " }).name).toBe("14998550509");
    expect(leonaCustomerSchema.parse(base).name).toBe("14998550509");
  });

  it("continua recusando telefone invalido", () => {
    expect(() => leonaCustomerSchema.parse({ ...base, phone: "123", name: "DR" })).toThrow();
  });
});
