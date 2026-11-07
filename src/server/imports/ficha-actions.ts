"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/session";
import {
  cpfSchema,
  dateSchema,
  optionalString,
  phoneSchema,
  positiveMoneySchema,
} from "@/lib/schemas/common";
import { createTransaction } from "@/server/finance/transactions";
import { createSale } from "@/server/sales/sales-service";
import { toActionResult, type ActionResult } from "@/server/shared/action-result";

const ACTOR = "Ficha do cliente";

/**
 * O que a tela manda depois que o operador conferiu a leitura da ficha.
 * Tudo aqui ja passou pelos olhos de alguem: o parser propoe, a pessoa
 * confirma, e so entao grava.
 */
const fichaSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do cliente."),
  cpf: cpfSchema.nullable().optional(),
  email: z.union([z.string().email("E-mail inválido."), z.literal("")]).nullable().optional(),
  endereco: optionalString,
  telefone: phoneSchema.nullable().optional(),
  fechamentoEm: dateSchema,
  valorTotal: positiveMoneySchema,
  productId: z.string().min(1, "Escolha o serviço vendido."),
  parcelas: z
    .array(
      z.object({
        label: optionalString,
        dueDate: dateSchema,
        amount: positiveMoneySchema,
      }),
    )
    .min(1, "O plano precisa de ao menos uma parcela."),
  /** Marca a primeira parcela como recebida e lanca a entrada no caixa. */
  entradaRecebida: z.boolean().default(false),
  paymentMethodId: z.string().nullable().optional(),
});

export type ResultadoImportacao = {
  customerId: string;
  clienteCriado: boolean;
  saleId: string;
  saleCode: string;
  contratoCode: string | null;
  transacaoCode: string | null;
};

/**
 * Procura a pessoa antes de criar outra.
 *
 * A ordem e CPF, depois telefone. O telefone importa porque quem chega pelo
 * WhatsApp ja nasceu no sistema sem CPF: sem olhar o numero, a ficha criaria
 * um segundo cadastro da mesma pessoa e a venda ficaria pendurada no cadastro
 * errado.
 */
async function acharOuCriarCliente(input: z.infer<typeof fichaSchema>) {
  const existente =
    (input.cpf ? await prisma.customer.findUnique({ where: { document: input.cpf } }) : null) ??
    (input.telefone
      ? await prisma.customer.findFirst({
          where: { phone: input.telefone, deletedAt: null },
          orderBy: { createdAt: "asc" },
        })
      : null);

  const dados = {
    name: input.nome,
    document: input.cpf ?? undefined,
    phone: input.telefone ?? undefined,
    email: input.email || undefined,
    street: input.endereco ?? undefined,
  };

  if (existente) {
    // Completa o que faltava sem apagar o que ja estava preenchido: quem
    // chegou pelo WhatsApp costuma estar so com nome e telefone.
    await prisma.customer.update({
      where: { id: existente.id },
      data: {
        name: input.nome || existente.name,
        document: existente.document ?? dados.document ?? null,
        phone: existente.phone ?? dados.phone ?? null,
        email: existente.email ?? dados.email ?? null,
        street: existente.street ?? dados.street ?? null,
        status: existente.status === "LEAD" ? "ACTIVE" : existente.status,
      },
    });
    return { id: existente.id, criado: false };
  }

  const criado = await prisma.customer.create({
    data: {
      name: input.nome,
      document: dados.document ?? null,
      phone: dados.phone ?? null,
      email: dados.email ?? null,
      street: dados.street ?? null,
      status: "ACTIVE",
      source: ACTOR,
    },
  });

  return { id: criado.id, criado: true };
}

export async function criarDaFichaAction(
  payload: unknown,
): Promise<ActionResult<ResultadoImportacao>> {
  return toActionResult(async () => {
    const user = await requirePermission(PERMISSIONS.SALE_MANAGE);
    const input = fichaSchema.parse(payload);

    const cliente = await acharOuCriarCliente(input);

    const sale = await createSale(
      {
        customerId: cliente.id,
        soldAt: input.fechamentoEm,
        discount: "0",
        notes: null,
        items: [
          {
            productId: input.productId,
            quantity: 1,
            unitPrice: input.valorTotal,
            unitCost: "0",
            discount: "0",
          },
        ],
        contract: {
          startDate: input.fechamentoEm,
          installments: input.parcelas.map((parcela) => ({
            label: parcela.label ?? null,
            dueDate: parcela.dueDate,
            amount: parcela.amount,
            paymentMethodId: input.paymentMethodId ?? null,
            notes: null,
          })),
        },
      },
      { actorId: user.id, actorLabel: ACTOR },
    );

    const contrato = sale.contracts[0] ?? null;
    const primeira = contrato?.installments[0] ?? null;

    let transacaoCode: string | null = null;

    if (input.entradaRecebida && contrato && primeira) {
      const categoria = await prisma.transactionCategory.findUnique({
        where: { key: "consultation_revenue" },
      });

      const transacao = await createTransaction(
        {
          type: "INCOME",
          description: `${primeira.label ?? "Entrada"} - ${input.nome}`,
          customerId: cliente.id,
          categoryId: categoria?.kind === "INCOME" ? categoria.id : null,
          paymentMethodId: input.paymentMethodId ?? null,
          expectedAmount: primeira.expectedAmount.toString(),
          settledAmount: primeira.expectedAmount.toString(),
          dueDate: primeira.dueDate,
          settledAt: primeira.dueDate,
          competenceDate: primeira.dueDate,
          notes: null,
          origin: ACTOR,
          externalId: null,
          externalProvider: null,
          allocations: [
            {
              targetType: "INSTALLMENT",
              installmentId: primeira.id,
              contractId: contrato.id,
              saleId: sale.id,
              amount: primeira.expectedAmount.toString(),
            },
          ],
        },
        { actorId: user.id, actorLabel: ACTOR },
      );

      transacaoCode = transacao.code;
    }

    revalidatePath("/clientes");
    revalidatePath("/vendas");
    revalidatePath("/contratos");
    revalidatePath("/transacoes");

    return {
      customerId: cliente.id,
      clienteCriado: cliente.criado,
      saleId: sale.id,
      saleCode: sale.code,
      contratoCode: contrato?.code ?? null,
      transacaoCode,
    };
  });
}
