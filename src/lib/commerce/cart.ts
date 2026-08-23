// -----------------------------------------------------------------------------
// Panier serveur.
//
// Point d'entrée des écritures panier : propriétaire, commande PENDING, prix
// catalogue. Les DAO Prisma (`updateOrderItems`) restent le détail de
// persistance. Retirer le module, pour ce fichier-là, se résume à ne plus
// appeler `saveCartForUser` depuis `/api/save-cart`.
// -----------------------------------------------------------------------------

import { prisma } from '$lib/server';
import { updateOrderItems } from '$lib/prisma/order/prendingOrder';
import { CartForbiddenError } from './errors';

export type PublicCartItem = {
	id: string;
	product: {
		id: string;
		name: string;
		price: number;
		images: string;
		stock: number;
	};
	quantity: number;
	price: number;
	custom?: Array<{ id: string; image: string; userMessage: string }>;
};

export type PublicCart = {
	id: string;
	userId: string;
	subtotal: number;
	tax: number;
	shippingCost: number;
	items: PublicCartItem[];
};

/** Projection sûre pour hydrater le store client. */
export function toPublicCart(order: {
	id: string;
	userId: string;
	subtotal: number;
	tax: number;
	shippingCost?: number | null;
	items?: Array<{
		id: string;
		quantity: number;
		price: number;
		custom?: Array<{ id: string; image: string; userMessage: string }>;
		product?: {
			id: string;
			name: string;
			price: number;
			images: string[] | string;
			stock: number;
		} | null;
	}>;
}): PublicCart {
	return {
		id: order.id,
		userId: order.userId,
		subtotal: order.subtotal,
		tax: order.tax,
		shippingCost: order.shippingCost ?? 0,
		items: (order.items ?? []).map((item) => {
			const images = item.product?.images;
			const image =
				typeof images === 'string' ? images : Array.isArray(images) ? (images[0] ?? '') : '';
			return {
				id: item.id,
				product: {
					id: item.product?.id ?? '',
					name: item.product?.name ?? '',
					price: item.product?.price ?? item.price,
					images: image,
					stock: item.product?.stock ?? 0
				},
				quantity: item.quantity,
				price: item.price,
				custom: item.custom
			};
		})
	};
}

/**
 * Persiste le panier d'un utilisateur connecté.
 *
 * Refuse une commande d'un autre compte, une commande déjà payée, et un id
 * absent. Les prix sont revalidés dans `updateOrderItems`.
 */
export async function saveCartForUser(
	userId: string,
	orderId: string,
	items: unknown[]
) {
	const order = await prisma.order.findUnique({
		where: { id: orderId },
		select: { id: true, userId: true, status: true }
	});

	if (!order || order.userId !== userId || order.status !== 'PENDING') {
		throw new CartForbiddenError();
	}

	return updateOrderItems(orderId, items);
}
