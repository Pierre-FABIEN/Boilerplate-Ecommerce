-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "invoiceNumber" TEXT;
ALTER TABLE "transactions" ADD COLUMN "subtotalHt" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "transactions" ADD COLUMN "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 5.5;
ALTER TABLE "transactions" ADD COLUMN "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "transactions" ADD COLUMN "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "transactions" ADD COLUMN "promoCode" TEXT;

-- CreateTable
CREATE TABLE "invoice_counters" (
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL,

    CONSTRAINT "invoice_counters_pkey" PRIMARY KEY ("year")
);

-- Backfill sequential numbers for existing invoices
WITH ordered AS (
    SELECT id, ROW_NUMBER() OVER (
        PARTITION BY EXTRACT(YEAR FROM "createdAt")
        ORDER BY "createdAt" ASC
    ) AS n
    FROM "transactions"
)
UPDATE "transactions" AS t
SET "invoiceNumber" = 'FAC-' || EXTRACT(YEAR FROM t."createdAt")::INTEGER || '-' || LPAD(ordered.n::TEXT, 5, '0')
FROM ordered
WHERE t.id = ordered.id
  AND t."invoiceNumber" IS NULL;

INSERT INTO "invoice_counters" ("year", "last")
SELECT EXTRACT(YEAR FROM "createdAt")::INTEGER, COUNT(*)::INTEGER
FROM "transactions"
GROUP BY EXTRACT(YEAR FROM "createdAt")::INTEGER
ON CONFLICT ("year") DO UPDATE SET "last" = EXCLUDED."last";

-- CreateIndex
CREATE UNIQUE INDEX "transactions_invoiceNumber_key" ON "transactions"("invoiceNumber");
