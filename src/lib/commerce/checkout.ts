// -----------------------------------------------------------------------------
// Gardes + session Stripe du checkout.
//
// COMMERCE-PLUGIN : l'action `?/checkout` passe par ici avant Stripe. Le promo
// n'est pas ce module (PROMO-PLUGIN) : `createCheckoutSession` reçoit un
// rabais déjà calculé, elle ne connaît pas `validatePromo`/`incrementUsage`.
// Sendcloud n'est pas rappelé : un coût de port non nul venu du client est
// refusé (`resolveTrustedShippingCost`).
// -----------------------------------------------------------------------------

import type Stripe from 'stripe';
import { prisma } from '$lib/server';
import { stripe } from '$lib/server/stripe';
import { updateOrder, type getOrderById } from '$lib/prisma/order/prendingOrder';
import { CartForbiddenError, InvalidShippingError } from './errors';

type OrderWithItems = NonNullable<Awaited<ReturnType<typeof getOrderById>>>;

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

/** TVA fixe du catalogue (5,5 %) : mêmes lignes que la facture (`snapshotInvoiceTotals`). */
export const TVA_RATE = 0.055;

/**
 * Construit et crée la session Stripe Checkout d'une commande.
 *
 * Écrit d'abord l'adresse/transport/promo sur la commande (`updateOrder`), les
 * montants Stripe étant dérivés du `shippingCost` qui en ressort — pas de la
 * valeur brute reçue du client. `discountAmount` est déjà validé par
 * l'appelant (PROMO-PLUGIN) ; cette fonction ne fait qu'appliquer le facteur
 * de remise aux lignes.
 */
export async function createCheckoutSession(params: {
	order: OrderWithItems;
	userId: string;
	origin: string;
	addressId: string;
	shippingOption: string;
	trustedShippingCost: number;
	hasCustomItems: boolean;
	promoCode: string | null;
	discountAmount: number;
	servicePoint: {
		id?: string;
		postNumber?: string;
		latitude?: string;
		longitude?: string;
		type?: string | null;
		extraRefCab?: string;
		extraShopRef?: string;
	};
}): Promise<Stripe.Checkout.Session> {
	const { order, userId, origin, addressId, hasCustomItems, promoCode, discountAmount, servicePoint } = params;
	const finalShippingOption = hasCustomItems ? 'no_shipping' : params.shippingOption || 'no_shipping';

	const productTotalTTC = parseFloat(
		order.items
			.reduce((sum, item) => sum + item.product.price * (1 + TVA_RATE) * item.quantity, 0)
			.toFixed(2)
	);
	const discountFactor =
		discountAmount > 0 && productTotalTTC > 0 ? (productTotalTTC - discountAmount) / productTotalTTC : 1;

	const updatedOrder = await updateOrder(
		order.id,
		addressId,
		finalShippingOption,
		String(params.trustedShippingCost),
		servicePoint.id,
		servicePoint.postNumber,
		servicePoint.latitude,
		servicePoint.longitude,
		servicePoint.type,
		servicePoint.extraRefCab,
		servicePoint.extraShopRef,
		promoCode,
		discountAmount
	);

	const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = order.items.map((item) => {
		const ttcPrice = item.product.price * (1 + TVA_RATE);
		const discountedUnitAmount = Math.round(ttcPrice * 100 * discountFactor);
		return {
			price_data: {
				currency: 'eur',
				product_data: { name: item.product.name },
				unit_amount: discountedUnitAmount
			},
			quantity: item.quantity
		};
	});

	const shippingCostFloat = parseFloat((updatedOrder.shippingCost || 0).toString());
	if (shippingCostFloat > 0 && !hasCustomItems) {
		lineItems.push({
			price_data: {
				currency: 'eur',
				product_data: { name: 'Frais de port' },
				unit_amount: Math.round(shippingCostFloat * 100)
			},
			quantity: 1
		});
	}

	return stripe.checkout.sessions.create({
		payment_method_types: ['card'],
		line_items: lineItems,
		mode: 'payment',
		success_url: `${origin}/checkout/success`,
		cancel_url: `${origin}/auth`,
		metadata: {
			order_id: order.id,
			shipping_option: finalShippingOption,
			shipping_cost: (updatedOrder.shippingCost || 0).toString(),
			promo_code: promoCode || '',
			discount_amount: discountAmount.toString()
		},
		payment_intent_data: {
			metadata: {
				user_id: userId,
				order_id: order.id
			}
		}
	});
}
