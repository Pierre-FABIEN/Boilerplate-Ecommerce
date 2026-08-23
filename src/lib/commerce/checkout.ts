// -----------------------------------------------------------------------------
// Gardes checkout.
//
// COMMERCE-PLUGIN : l'action `?/checkout` passe par ici avant Stripe. Le promo
// n'est pas ce module (PROMO-PLUGIN). Sendcloud n'est pas rappelé : un coût
// de port non nul venu du client est refusé.
// -----------------------------------------------------------------------------

import { prisma } from '$lib/server';
import { CartForbiddenError, InvalidShippingError } from './errors';

export async function assertOrderOwnedBy(orderId: string, userId: string) {
	const order = await prisma.order.findUnique({
		where: { id: orderId },
		select: { id: true, userId: true, status: true }
	});

	if (!order || order.userId !== userId || order.status !== 'PENDING') {
		throw new CartForbiddenError();
	}

	return order;
}

/**
 * Coût de port accepté par le serveur.
 *
 * Sans revalidation Sendcloud, seuls 0 et `no_shipping` passent. Un montant
 * positif fourni par le navigateur est rejeté.
 */
export function resolveTrustedShippingCost(options: {
	hasCustomItems: boolean;
	shippingOption?: string;
	shippingCost?: string;
}): number {
	if (options.hasCustomItems || !options.shippingOption || options.shippingOption === 'no_shipping') {
		return 0;
	}

	const requested = parseFloat(options.shippingCost || '0');
	if (!Number.isFinite(requested) || requested < 0) {
		throw new InvalidShippingError();
	}
	if (requested > 0) {
		throw new InvalidShippingError();
	}

	return 0;
}

export async function markOrderPaid(orderId: string) {
	return prisma.order.update({
		where: { id: orderId },
		data: { status: 'PAID' }
	});
}
