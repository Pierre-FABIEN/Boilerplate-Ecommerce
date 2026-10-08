-- Migration manuelle (générée via `prisma migrate diff --from-url ... --to-schema-datamodel ...`
-- plutôt que `prisma migrate dev`, qui proposait un reset complet du schéma
-- "public" à cause d'une dérive préexistante et sans rapport sur les index
-- de `transactions` (createdAt/orderId/userId, déjà retirés du schéma
-- Prisma actuel au profit d'index composites — non reproduite ici).
--
-- Champs monétaires `Float` → `Decimal(10,2)` (voir RESTE_A_FAIRE.md §A.2.1
-- pour l'inventaire complet et la justification).

-- AlterTable
ALTER TABLE "gift_cards" ALTER COLUMN "initialValue" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "balance" SET DATA TYPE DECIMAL(10,2);

-- AlterTable
ALTER TABLE "order_items" ALTER COLUMN "price" SET DATA TYPE DECIMAL(10,2);

-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "tax" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "total" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "discountAmount" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "giftCardAmount" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "shippingCost" SET DATA TYPE DECIMAL(10,2);

-- AlterTable
ALTER TABLE "product_variants" ALTER COLUMN "price" SET DATA TYPE DECIMAL(10,2);

-- AlterTable
ALTER TABLE "products" ALTER COLUMN "price" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "compareAtPrice" SET DATA TYPE DECIMAL(10,2);

-- AlterTable
ALTER TABLE "promo_codes" ALTER COLUMN "value" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "minAmount" SET DATA TYPE DECIMAL(10,2);

-- AlterTable
ALTER TABLE "transactions" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "shippingCost" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "subtotalHt" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "taxAmount" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "discountAmount" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "disputeAmount" SET DATA TYPE DECIMAL(10,2);

-- AlterTable
ALTER TABLE "wishlist_items" ALTER COLUMN "lastNotifiedPrice" SET DATA TYPE DECIMAL(10,2);
