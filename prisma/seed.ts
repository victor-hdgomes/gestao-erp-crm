import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  ALL_PERMISSIONS,
  ROLE_DEFINITIONS,
  ROLE_KEYS,
} from "../src/lib/auth/permissions";
import { moveCard } from "../src/server/crm/crm-service";
import { createDocument } from "../src/server/documents/documents-service";
import { createTransaction } from "../src/server/finance/transactions";
import { createSale } from "../src/server/sales/sales-service";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const CRM_STAGES = [
  { name: "Atualização da Receita Federal", color: "#64748b" },
  { name: "Emissão de termos de exclusão de consultas", color: "#0ea5e9" },
  { name: "Cadastro Positivo + Open Finance", color: "#6366f1" },
  { name: "Cadastro Positivo — Equifax", color: "#a855f7" },
  { name: "Atualização viral Serasa", color: "#f59e0b" },
  { name: "Finalização e relatório final", color: "#16a34a", isFinal: true },
];

const PAYMENT_METHODS = [
  { key: "pix", name: "Pix" },
  { key: "credit_card", name: "Cartão de crédito" },
  { key: "debit_card", name: "Cartão de débito" },
  { key: "boleto", name: "Boleto" },
  { key: "cash", name: "Dinheiro" },
  { key: "transfer", name: "Transferência" },
];

const EXPENSE_CATEGORIES = [
  { key: "paid_traffic", name: "Tráfego pago", isSystem: true },
  { key: "consultations", name: "Consultas", isSystem: true },
  { key: "operational", name: "Operacional", isSystem: true },
  { key: "others", name: "Outros", isSystem: true },
];

async function seedPermissionsAndRoles() {
  for (const key of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      create: { key, description: key },
      update: {},
    });
  }

  for (const [roleKey, definition] of Object.entries(ROLE_DEFINITIONS)) {
    const role = await prisma.role.upsert({
      where: { key: roleKey },
      create: {
        key: roleKey,
        name: definition.name,
        description: definition.description,
        isSystem: true,
      },
      update: { name: definition.name, description: definition.description },
    });

    const permissions = await prisma.permission.findMany({
      where: { key: { in: definition.permissions } },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: role.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });
  }
}

async function seedUsers(withDemo: boolean) {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@local.test";
  const password = process.env.SEED_ADMIN_PASSWORD;

  // The default password is published in the README, so production has to bring
  // its own or the first administrator would be a known door.
  if (!withDemo && !password) {
    throw new Error(
      "Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD antes de rodar o seed fora do modo demo.",
    );
  }

  const passwordHash = await bcrypt.hash(password ?? "Admin@123456", 12);

  const admin = await prisma.user.upsert({
    where: { email },
    create: { name: "Administrador", email, passwordHash },
    update: { passwordHash, isActive: true },
  });

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { key: ROLE_KEYS.ADMIN } });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    create: { userId: admin.id, roleId: adminRole.id },
    update: {},
  });

  // Sample logins exist to show the permission levels; a real install gets its
  // users created by hand, with their own passwords.
  const extras = withDemo
    ? [
        { name: "Financeiro Demo", email: "financeiro@local.test", roleKey: ROLE_KEYS.FINANCE },
        { name: "Operacional Demo", email: "operacional@local.test", roleKey: ROLE_KEYS.OPERATIONS },
      ]
    : [];

  for (const extra of extras) {
    const user = await prisma.user.upsert({
      where: { email: extra.email },
      create: { name: extra.name, email: extra.email, passwordHash },
      update: {},
    });
    const role = await prisma.role.findUniqueOrThrow({ where: { key: extra.roleKey } });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id },
      update: {},
    });
  }

  return admin;
}

async function seedBaseData() {
  for (const method of PAYMENT_METHODS) {
    await prisma.paymentMethod.upsert({
      where: { key: method.key },
      create: method,
      update: { name: method.name },
    });
  }

  for (const category of EXPENSE_CATEGORIES) {
    await prisma.expenseCategory.upsert({
      where: { key: category.key },
      create: category,
      update: { name: category.name },
    });
  }

  for (const [index, stage] of CRM_STAGES.entries()) {
    const existing = await prisma.crmStage.findFirst({ where: { position: index + 1 } });
    if (existing) {
      await prisma.crmStage.update({
        where: { id: existing.id },
        data: { name: stage.name, color: stage.color, isFinal: stage.isFinal ?? false },
      });
      continue;
    }
    await prisma.crmStage.create({
      data: {
        name: stage.name,
        position: index + 1,
        color: stage.color,
        isFinal: stage.isFinal ?? false,
      },
    });
  }
}

async function seedCatalog() {
  const consultation = await upsertProduct({
    name: "Consulta de crédito",
    description: "Consulta de score e situação cadastral do CPF.",
    category: "Consultas",
    kind: "CONSULTATION",
    defaultPrice: "117.00",
    defaultCost: "25.00",
    createsCrmCard: false,
  });

  const regularization = await upsertProduct({
    name: "Serviço de regularização",
    description: "Processo completo de regularização cadastral e financeira.",
    category: "Regularização",
    kind: "SERVICE",
    defaultPrice: "1400.00",
    defaultCost: "0.00",
    createsCrmCard: true,
  });

  const custom = await upsertProduct({
    name: "Regularização personalizada",
    description: "Regularização com escopo ampliado e valor negociado.",
    category: "Regularização",
    kind: "SERVICE",
    defaultPrice: "5400.00",
    defaultCost: "0.00",
    createsCrmCard: true,
  });

  return { consultation, regularization, custom };
}

async function upsertProduct(input: {
  name: string;
  description: string;
  category: string;
  kind: "CONSULTATION" | "SERVICE" | "OTHER";
  defaultPrice: string;
  defaultCost: string;
  createsCrmCard: boolean;
}) {
  const existing = await prisma.productService.findFirst({ where: { name: input.name } });
  if (existing) {
    return prisma.productService.update({ where: { id: existing.id }, data: input });
  }
  return prisma.productService.create({ data: input });
}

type Catalog = Awaited<ReturnType<typeof seedCatalog>>;

/** Fictional people only. Never seed real personal data. */
const DEMO_CUSTOMERS = [
  { name: "Ana Clara Souza", document: "52998224725", phone: "11988887777", city: "São Paulo", state: "SP" },
  { name: "Bruno Henrique Lima", document: "15350946056", phone: "21977776666", city: "Rio de Janeiro", state: "RJ" },
  { name: "Carla Mendes Rocha", document: "11144477735", phone: "31966665555", city: "Belo Horizonte", state: "MG" },
  { name: "Diego Araújo Nunes", document: "39053344705", phone: "41955554444", city: "Curitiba", state: "PR" },
  { name: "Elaine Castro Vieira", document: "24681357928", phone: "51944443333", city: "Porto Alegre", state: "RS" },
  { name: "Fábio Rezende Alves", document: "86420975310", phone: "62933332222", city: "Goiânia", state: "GO" },
  { name: "Gabriela Nunes Prado", document: "13579246828", phone: "71922221111", city: "Salvador", state: "BA" },
];

/**
 * The demo operation is built through the real services, so every number on the
 * screens comes from the same rules the application enforces in production.
 * Each customer is one payment story the team runs into for real.
 */
async function seedDemoOperation(adminId: string, catalog: Catalog) {
  if ((await prisma.sale.count()) > 0) {
    console.log("Dados de demonstração já existem, pulando.");
    return;
  }

  const stages = await prisma.crmStage.findMany({ orderBy: { position: "asc" } });
  const pix = await prisma.paymentMethod.findUniqueOrThrow({ where: { key: "pix" } });
  const creditCard = await prisma.paymentMethod.findUniqueOrThrow({
    where: { key: "credit_card" },
  });
  const boleto = await prisma.paymentMethod.findUniqueOrThrow({ where: { key: "boleto" } });

  const people = await Promise.all(
    DEMO_CUSTOMERS.map((customer) =>
      prisma.customer.create({
        data: {
          ...customer,
          status: "ACTIVE",
          driveFolderUrl: "https://drive.google.com/drive/folders/exemplo",
        },
      }),
    ),
  );
  const [ana, bruno, carla, diego, elaine, fabio, gabriela] = people;

  /** Registers a receipt that settles the contract's oldest open installments. */
  async function receive(params: {
    customerId: string;
    contractId: string;
    amount: string;
    when: Date;
    description: string;
    paymentMethodId: string;
  }) {
    return createTransaction(
      {
        type: "INCOME",
        description: params.description,
        customerId: params.customerId,
        paymentMethodId: params.paymentMethodId,
        expectedAmount: params.amount,
        settledAmount: params.amount,
        dueDate: params.when,
        settledAt: params.when,
        competenceDate: params.when,
        origin: "MANUAL",
        allocations: [],
      },
      { actorId: adminId, autoAllocateContractId: params.contractId },
    );
  }

  async function spend(params: {
    description: string;
    categoryKey: string;
    amount: string;
    when: Date;
    paymentMethodId: string;
  }) {
    const category = await prisma.expenseCategory.findUniqueOrThrow({
      where: { key: params.categoryKey },
    });

    return createTransaction(
      {
        type: "EXPENSE",
        description: params.description,
        expenseCategoryId: category.id,
        paymentMethodId: params.paymentMethodId,
        expectedAmount: params.amount,
        settledAmount: params.amount,
        dueDate: params.when,
        settledAt: params.when,
        competenceDate: params.when,
        origin: "MANUAL",
        allocations: [],
      },
      { actorId: adminId },
    );
  }

  /** Walks the customer's card up to the given stage, leaving a real history. */
  async function advanceCard(customerId: string, stageIndex: number, note: string) {
    const card = await prisma.crmCard.findFirst({
      where: { customerId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    if (!card) return;

    for (let index = 1; index <= stageIndex; index += 1) {
      await moveCard(
        card.id,
        { toStageId: stages[index].id, note: index === stageIndex ? note : null },
        { actorId: adminId, actorLabel: "Seed" },
      );
    }
  }

  // 1) Ana — pagou a entrada e a parcela do meio, falta a última.
  const anaSale = await createSale(
    {
      customerId: ana.id,
      soldAt: daysAgo(70),
      discount: "0",
      notes: "Cliente indicada por parceiro.",
      items: [
        { productId: catalog.custom.id, quantity: 1, unitPrice: "5400.00", unitCost: "0", discount: "0" },
      ],
      contract: {
        title: "Regularização personalizada — Ana Clara",
        startDate: daysAgo(70),
        documentUrl: "https://drive.google.com/file/d/contrato-ana-clara",
        installments: [
          { label: "Entrada", dueDate: daysAgo(70), amount: "2700.00", paymentMethodId: pix.id, notes: null },
          { label: "Parcela 2", dueDate: daysAgo(40), amount: "1350.00", paymentMethodId: pix.id, notes: null },
          { label: "Finalização", dueDate: daysFromNow(20), amount: "1350.00", paymentMethodId: pix.id, notes: null },
        ],
      },
    },
    { actorId: adminId, actorLabel: "Seed" },
  );
  const anaContract = anaSale.contracts[0];

  await receive({
    customerId: ana.id,
    contractId: anaContract.id,
    amount: "2700.00",
    when: daysAgo(70),
    description: `Entrada — ${anaContract.code}`,
    paymentMethodId: pix.id,
  });
  await receive({
    customerId: ana.id,
    contractId: anaContract.id,
    amount: "1350.00",
    when: daysAgo(39),
    description: `Parcela 2 — ${anaContract.code}`,
    paymentMethodId: pix.id,
  });
  await advanceCard(ana.id, 3, "Cadastro Positivo concluído, aguardando Equifax.");

  // 2) Bruno — contrato novo, ainda não pagou nada.
  const brunoSale = await createSale(
    {
      customerId: bruno.id,
      soldAt: daysAgo(6),
      discount: "0",
      notes: null,
      items: [
        { productId: catalog.regularization.id, quantity: 1, unitPrice: "1400.00", unitCost: "0", discount: "0" },
      ],
      contract: {
        title: "Serviço de regularização — Bruno",
        startDate: daysAgo(6),
        installments: [
          { label: "Entrada", dueDate: daysFromNow(4), amount: "700.00", paymentMethodId: boleto.id, notes: null },
          { label: "Finalização", dueDate: daysFromNow(34), amount: "700.00", paymentMethodId: boleto.id, notes: null },
        ],
      },
    },
    { actorId: adminId, actorLabel: "Seed" },
  );

  // 3) Carla — inadimplente: duas parcelas vencidas, nada recebido.
  const carlaSale = await createSale(
    {
      customerId: carla.id,
      soldAt: daysAgo(100),
      discount: "400.00",
      notes: "Desconto de R$ 400 aprovado na negociação.",
      items: [
        { productId: catalog.custom.id, quantity: 1, unitPrice: "5400.00", unitCost: "0", discount: "0" },
      ],
      contract: {
        title: "Regularização personalizada — Carla",
        startDate: daysAgo(100),
        installments: [
          { label: "Entrada", dueDate: daysAgo(100), amount: "2000.00", paymentMethodId: boleto.id, notes: null },
          { label: "Parcela 2", dueDate: daysAgo(40), amount: "1500.00", paymentMethodId: boleto.id, notes: null },
          { label: "Finalização", dueDate: daysFromNow(20), amount: "1500.00", paymentMethodId: boleto.id, notes: null },
        ],
      },
    },
    { actorId: adminId, actorLabel: "Seed" },
  );
  await advanceCard(carla.id, 1, "Serviço pausado até a regularização do pagamento.");

  // 4) Diego — pagou tudo à vista no fechamento; contrato quitado.
  const diegoSale = await createSale(
    {
      customerId: diego.id,
      soldAt: daysAgo(25),
      discount: "0",
      notes: null,
      items: [
        { productId: catalog.regularization.id, quantity: 1, unitPrice: "1400.00", unitCost: "0", discount: "0" },
      ],
      contract: {
        title: "Serviço de regularização — Diego",
        startDate: daysAgo(25),
        documentUrl: "https://drive.google.com/file/d/contrato-diego",
        installments: [
          { label: "Pagamento único", dueDate: daysAgo(25), amount: "1400.00", paymentMethodId: creditCard.id, notes: null },
        ],
      },
    },
    { actorId: adminId, actorLabel: "Seed" },
  );
  await receive({
    customerId: diego.id,
    contractId: diegoSale.contracts[0].id,
    amount: "1400.00",
    when: daysAgo(25),
    description: `Pagamento à vista — ${diegoSale.contracts[0].code}`,
    paymentMethodId: creditCard.id,
  });
  await advanceCard(diego.id, 5, "Relatório final entregue ao cliente.");

  // 5) Elaine — um pagamento só, que quitou duas parcelas e deixou a terceira pela metade.
  const elaineSale = await createSale(
    {
      customerId: elaine.id,
      soldAt: daysAgo(50),
      discount: "0",
      notes: null,
      items: [
        { productId: catalog.custom.id, quantity: 1, unitPrice: "3600.00", unitCost: "0", discount: "0" },
      ],
      contract: {
        title: "Regularização personalizada — Elaine",
        startDate: daysAgo(50),
        installments: [
          { label: "Parcela 1", dueDate: daysAgo(50), amount: "900.00", paymentMethodId: pix.id, notes: null },
          { label: "Parcela 2", dueDate: daysAgo(20), amount: "900.00", paymentMethodId: pix.id, notes: null },
          { label: "Parcela 3", dueDate: daysFromNow(10), amount: "900.00", paymentMethodId: pix.id, notes: null },
          { label: "Parcela 4", dueDate: daysFromNow(40), amount: "900.00", paymentMethodId: pix.id, notes: null },
        ],
      },
    },
    { actorId: adminId, actorLabel: "Seed" },
  );
  await receive({
    customerId: elaine.id,
    contractId: elaineSale.contracts[0].id,
    amount: "2250.00",
    when: daysAgo(18),
    description: `Pagamento de duas parcelas e meia — ${elaineSale.contracts[0].code}`,
    paymentMethodId: pix.id,
  });
  await advanceCard(elaine.id, 2, "Termos de exclusão enviados.");

  // 6) Fábio — só consulta avulsa: sem contrato e sem card no CRM.
  const fabioSale = await createSale(
    {
      customerId: fabio.id,
      soldAt: daysAgo(3),
      discount: "0",
      notes: "Consulta avulsa paga no Pix.",
      items: [
        { productId: catalog.consultation.id, quantity: 1, unitPrice: "117.00", unitCost: "25.00", discount: "0" },
      ],
    },
    { actorId: adminId, actorLabel: "Seed" },
  );
  await createTransaction(
    {
      type: "INCOME",
      description: "Consulta de crédito — Fábio Rezende Alves",
      customerId: fabio.id,
      paymentMethodId: pix.id,
      expectedAmount: "117.00",
      settledAmount: "117.00",
      dueDate: daysAgo(3),
      settledAt: daysAgo(3),
      competenceDate: daysAgo(3),
      origin: "MANUAL",
      allocations: [],
    },
    { actorId: adminId, autoAllocateSaleId: fabioSale.id },
  );

  // 7) Gabriela — consulta que virou serviço: duas vendas para a mesma pessoa.
  const gabrielaConsultation = await createSale(
    {
      customerId: gabriela.id,
      soldAt: daysAgo(30),
      discount: "0",
      notes: null,
      items: [
        { productId: catalog.consultation.id, quantity: 1, unitPrice: "117.00", unitCost: "25.00", discount: "0" },
      ],
    },
    { actorId: adminId, actorLabel: "Seed" },
  );
  await createTransaction(
    {
      type: "INCOME",
      description: "Consulta de crédito — Gabriela Nunes Prado",
      customerId: gabriela.id,
      paymentMethodId: pix.id,
      expectedAmount: "117.00",
      settledAmount: "117.00",
      dueDate: daysAgo(30),
      settledAt: daysAgo(30),
      competenceDate: daysAgo(30),
      origin: "MANUAL",
      allocations: [],
    },
    { actorId: adminId, autoAllocateSaleId: gabrielaConsultation.id },
  );

  const gabrielaSale = await createSale(
    {
      customerId: gabriela.id,
      soldAt: daysAgo(12),
      discount: "117.00",
      notes: "Valor da consulta abatido do serviço.",
      items: [
        { productId: catalog.regularization.id, quantity: 1, unitPrice: "1400.00", unitCost: "0", discount: "0" },
      ],
      contract: {
        title: "Serviço de regularização — Gabriela",
        startDate: daysAgo(12),
        installments: [
          { label: "Entrada", dueDate: daysAgo(12), amount: "641.50", paymentMethodId: pix.id, notes: null },
          { label: "Finalização", dueDate: daysFromNow(18), amount: "641.50", paymentMethodId: pix.id, notes: null },
        ],
      },
    },
    { actorId: adminId, actorLabel: "Seed" },
  );
  await receive({
    customerId: gabriela.id,
    contractId: gabrielaSale.contracts[0].id,
    amount: "641.50",
    when: daysAgo(12),
    description: `Entrada — ${gabrielaSale.contracts[0].code}`,
    paymentMethodId: pix.id,
  });
  await advanceCard(gabriela.id, 1, "Documentos recebidos.");

  // Documentos avulsos, além dos contratos assinados criados junto com as vendas.
  await createDocument(
    {
      customerId: carla.id,
      contractId: carlaSale.contracts[0].id,
      title: "Proposta comercial assinada",
      url: "https://drive.google.com/file/d/proposta-carla",
      kind: "CONTRACT",
      notes: null,
    },
    { actorId: adminId },
  );
  await createDocument(
    {
      customerId: bruno.id,
      contractId: brunoSale.contracts[0].id,
      title: "Comprovante de residência",
      url: "https://drive.google.com/file/d/residencia-bruno",
      kind: "OTHER",
      notes: null,
    },
    { actorId: adminId },
  );

  // Despesas do período, para o dashboard mostrar resultado e não só faturamento.
  await spend({
    description: "Tráfego pago — campanha do mês passado",
    categoryKey: "paid_traffic",
    amount: "1200.00",
    when: daysAgo(35),
    paymentMethodId: creditCard.id,
  });
  await spend({
    description: "Tráfego pago — campanha deste mês",
    categoryKey: "paid_traffic",
    amount: "950.00",
    when: daysAgo(8),
    paymentMethodId: creditCard.id,
  });
  await spend({
    description: "Custo das consultas do mês",
    categoryKey: "consultations",
    amount: "250.00",
    when: daysAgo(5),
    paymentMethodId: pix.id,
  });
  await spend({
    description: "Assinaturas e ferramentas",
    categoryKey: "operational",
    amount: "389.90",
    when: daysAgo(4),
    paymentMethodId: creditCard.id,
  });
  await spend({
    description: "Contador",
    categoryKey: "operational",
    amount: "600.00",
    when: daysAgo(2),
    paymentMethodId: pix.id,
  });
}


function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(12, 0, 0, 0);
  return date;
}

function daysFromNow(days: number): Date {
  return daysAgo(-days);
}

/**
 * Fictional customers, sales and transactions are a teaching aid, not data. They
 * only run when asked for, so a production seed cannot smuggle them in: set
 * SEED_DEMO=true to force them, SEED_DEMO=false to refuse them, and outside
 * NODE_ENV=production they come along by default.
 */
function wantsDemoData(): boolean {
  if (process.env.SEED_DEMO === "true") return true;
  if (process.env.SEED_DEMO === "false") return false;
  return process.env.NODE_ENV !== "production";
}

async function main() {
  const withDemo = wantsDemoData();

  console.log("Seeding permissions and roles...");
  await seedPermissionsAndRoles();

  console.log("Seeding users...");
  const admin = await seedUsers(withDemo);

  console.log("Seeding payment methods, expense categories and CRM stages...");
  await seedBaseData();

  console.log("Seeding catalog...");
  const catalog = await seedCatalog();

  if (withDemo) {
    console.log("Seeding demo operation...");
    await seedDemoOperation(admin.id, catalog);
  } else {
    console.log("Demo data skipped (SEED_DEMO=false ou NODE_ENV=production).");
  }

  console.log("Seed concluído.");
  console.log(`Admin: ${process.env.SEED_ADMIN_EMAIL ?? "admin@local.test"}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
