/**
 * Mappers `Decimal` → `number` pour `Product`/`ProductVariant`, partagés par
 * tout code qui lit ces modèles via Prisma (cf. RESTE_A_FAIRE.md §A.2.1).
 */
import type { Prisma } from '@prisma/client';
import { toNumber } from '$lib/server/decimal';

export function mapProductPrice<
	T extends { price: Prisma.Decimal; compareAtPrice: Prisma.Decimal | null }
>(product: T) {
	return {
		...product,
		price: toNumber(product.price),
		compareAtPrice: toNumber(product.compareAtPrice)
	};
}

export function mapVariantPrice<T extends { price: Prisma.Decimal | null }>(variant: T) {
	return { ...variant, price: toNumber(variant.price) };
}
