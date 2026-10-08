/**
 * Mappers `Decimal` → `number` pour `Order`/`OrderItem`/`Product`/`ProductVariant`,
 * partagés par tout code qui lit ces modèles via Prisma (pas seulement
 * `prendingOrder.ts`) — ex. le webhook Stripe (`src/routes/api/webhooks/+server.ts`)
 * qui requête `Order` directement dans sa propre transaction Prisma. Convertir
 * dès la lecture, jamais en aval (cf. RESTE_A_FAIRE.md §A.2.1).
 */
import type { Prisma } from '@prisma/client';
import { toNumber } from '$lib/server/decimal';
import { mapProductPrice, mapVariantPrice } from '$lib/prisma/products/mapProduct';

export { mapProductPrice, mapVariantPrice };

export function mapOrderFields<
	T extends {
		subtotal: Prisma.Decimal;
		tax: Prisma.Decimal;
		total: Prisma.Decimal;
		discountAmount: Prisma.Decimal;
		giftCardAmount: Prisma.Decimal;
		shippingCost: Prisma.Decimal | null;
	}
>(order: T) {
	return {
		...order,
		subtotal: toNumber(order.subtotal),
		tax: toNumber(order.tax),
		total: toNumber(order.total),
		discountAmount: toNumber(order.discountAmount),
		giftCardAmount: toNumber(order.giftCardAmount),
		shippingCost: toNumber(order.shippingCost)
	};
}

export function mapOrderItemWithProductAndVariant<
	T extends {
		price: Prisma.Decimal;
		product: { price: Prisma.Decimal; compareAtPrice: Prisma.Decimal | null };
		variant: { price: Prisma.Decimal | null } | null;
	}
>(item: T) {
	return {
		...item,
		price: toNumber(item.price),
		product: mapProductPrice(item.product),
		variant: item.variant ? mapVariantPrice(item.variant) : item.variant
	};
}

export function mapOrderItemWithProduct<
	T extends {
		price: Prisma.Decimal;
		product: { price: Prisma.Decimal; compareAtPrice: Prisma.Decimal | null };
	}
>(item: T) {
	return { ...item, price: toNumber(item.price), product: mapProductPrice(item.product) };
}
