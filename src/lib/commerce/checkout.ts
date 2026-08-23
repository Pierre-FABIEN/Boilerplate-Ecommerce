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
 * `no_shipping` et les commandes custom sont à 0. Sinon un montant fini entre
 * 0 et 200 € est accepté (devis Sendcloud affiché au client). Une revalidation
 * Sendcloud côté serveur reste le durcissement suivant.
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
	if (!Number.isFinite(requested) || requested < 0 || requested > 200) {
		throw new InvalidShippingError();
	}

	return Math.round(requested * 100) / 100;
}

export async function markOrderPaid(orderId: string) {
	return prisma.order.update({
		where: { id: orderId },
		data: { status: 'PAID' }
	});
}
