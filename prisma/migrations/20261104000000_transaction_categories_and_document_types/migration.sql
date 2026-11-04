-- Categorias de receita e despesa na mesma tabela, e tipos de documento saindo
-- do enum para uma tabela. Escrita à mão: as duas mudanças renomeiam e migram
-- dados existentes, que um drop/create apagaria.

-- ---------------------------------------------------------------------------
-- Categorias
-- ---------------------------------------------------------------------------

CREATE TYPE "TransactionCategoryKind" AS ENUM ('INCOME', 'EXPENSE');

ALTER TABLE "expense_categories" RENAME TO "transaction_categories";
ALTER INDEX "expense_categories_pkey" RENAME TO "transaction_categories_pkey";
ALTER INDEX "expense_categories_key_key" RENAME TO "transaction_categories_key_key";

-- O que já existia é despesa: era a única coisa que a tabela sabia guardar.
ALTER TABLE "transaction_categories"
  ADD COLUMN "kind" "TransactionCategoryKind" NOT NULL DEFAULT 'EXPENSE',
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "transaction_categories_kind_is_active_idx"
  ON "transaction_categories"("kind", "is_active");

ALTER TABLE "transactions" RENAME COLUMN "expense_category_id" TO "category_id";
ALTER TABLE "transactions"
  RENAME CONSTRAINT "transactions_expense_category_id_fkey" TO "transactions_category_id_fkey";

-- ---------------------------------------------------------------------------
-- Tipos de documento
-- ---------------------------------------------------------------------------

CREATE TABLE "document_types" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_types_key_key" ON "document_types"("key");
CREATE INDEX "document_types_is_active_idx" ON "document_types"("is_active");

-- Ids fixos para o UPDATE abaixo poder apontar para eles sem consulta.
INSERT INTO "document_types" ("id", "key", "name", "is_system") VALUES
  ('doctype_drive_folder', 'drive_folder', 'Pasta do Drive', true),
  ('doctype_contract',     'contract',     'Contrato',       true),
  ('doctype_receipt',      'receipt',      'Comprovante',    true),
  ('doctype_other',        'other',        'Outro',          true);

ALTER TABLE "documents" ADD COLUMN "type_id" TEXT;

UPDATE "documents" SET "type_id" = CASE "kind"
  WHEN 'DRIVE_FOLDER' THEN 'doctype_drive_folder'
  WHEN 'CONTRACT'     THEN 'doctype_contract'
  WHEN 'RECEIPT'      THEN 'doctype_receipt'
  ELSE 'doctype_other'
END;

ALTER TABLE "documents" DROP COLUMN "kind";
DROP TYPE "DocumentKind";

ALTER TABLE "documents" ADD CONSTRAINT "documents_type_id_fkey"
  FOREIGN KEY ("type_id") REFERENCES "document_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
