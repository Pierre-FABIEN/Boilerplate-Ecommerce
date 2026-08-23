/**
 * Tunnel de paiement.
 *
 * COMMERCE-PLUGIN : login obligatoire, la commande doit appartenir au visiteur,
 * les frais de port client non nuls sont refusés (pas de revalidation Sendcloud
 * dans ce lot). PROMO-PLUGIN : `validatePromo` / `incrementUsage` restent ici
 * pour que le checkout compile ; ce n'est pas le périmètre du module.
 */
import { zod } from 'sveltekit-superforms/adapters';
import { superValidate } from 'sveltekit-superforms';
import Stripe from 'stripe';
import dotenv from 'dotenv';

import { error, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

import { getOrderById, updateOrder } from '$lib/prisma/order/prendingOrder';
import { getUserAddresses } from '$lib/prisma/addresses/addresses';
import { OrderSchema } from '$lib/schema/order/order';
import { validatePromo, incrementUsage } from '$lib/prisma/promo/promo';
import { assertOrderOwnedBy, resolveTrustedShippingCost } from '$lib/commerce/checkout';
import { CartForbiddenError, InvalidShippingError } from '$lib/commerce/errors';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

export const load = (async ({ locals }) => {
	// AUTH-PLUGIN ▼ le paiement est réservé aux comptes : la commande et les
	// adresses sont rattachées à `User`. Rendre le tunnel anonyme suppose de
	// revoir le modèle de données (voir docs/auth/retrait.md).
	const userId = locals.user?.id;
	if (!userId) {
		throw redirect(302, '/auth/login');
	}
	// AUTH-PLUGIN ▲
	const IOrderSchema = await superValidate(zod(OrderSchema));
	const addresses = await getUserAddresses(userId);

	return {
		addresses,
		IOrderSchema
	};
}) satisfies PageServerLoad;

export const actions: Actions = {
	checkout: async ({ request, locals }) => {
		const userId = locals.user?.id;
		if (!userId) {
			throw redirect(302, '/auth/login');
		}

		const formData = await request.formData();
		const form = await superValidate(formData, zod(OrderSchema));

		const {
			orderId,
			addressId,
			shippingOption,
			shippingCost,
			promoCode,
			servicePointId,
			servicePointPostNumber,
			servicePointLatitude,
			servicePointLongitude,
			servicePointType,
			servicePointExtraRefCab,
			servicePointExtraShopRef
		} = form.data;

		if (!orderId || !addressId) {
			error(400, 'Veuillez sélectionner une adresse.');
		}

		try {
			await assertOrderOwnedBy(orderId, userId);
		} catch (err) {
			if (err instanceof CartForbiddenError) {
				error(403, err.message);
			}
			throw err;
		}

		const order = await getOrderById(orderId);
		if (!order) {
			error(404, 'Commande introuvable');
		}

		const hasCustomItems = order.items.some((item) => item.custom.length > 0);

		let trustedShippingCost: number;
		try {
			trustedShippingCost = resolveTrustedShippingCost({
				hasCustomItems,
				shippingOption,
				shippingCost
			});
		} catch (err) {
			if (err instanceof InvalidShippingError) {
				error(400, err.message);
			}
			throw err;
		}

		const finalShippingOption = hasCustomItems ? 'no_shipping' : shippingOption || 'no_shipping';
		const finalShippingCost = String(trustedShippingCost);

		const tvaRate = 0.055;
		const productTotalTTC = parseFloat(
			order.items
				.reduce((sum, item) => sum + item.product.price * (1 + tvaRate) * item.quantity, 0)
				.toFixed(2)
		);

		// PROMO-PLUGIN ▼ hors périmètre commerce ; conservé pour que le tunnel compile.
		const promoResult = await validatePromo(promoCode, productTotalTTC);
		const appliedDiscount = promoResult.valid ? promoResult.discountAmount : 0;
		const appliedPromoCode = promoResult.valid ? promoResult.promo?.code ?? null : null;
		// PROMO-PLUGIN ▲

		const discountFactor =
			appliedDiscount > 0 && productTotalTTC > 0
				? (productTotalTTC - appliedDiscount) / productTotalTTC
				: 1;

		const updatedOrder = await updateOrder(
			orderId,
			addressId,
			finalShippingOption,
			finalShippingCost,
			servicePointId,
			servicePointPostNumber,
			servicePointLatitude,
			servicePointLongitude,
			servicePointType,
			servicePointExtraRefCab,
			servicePointExtraShopRef,
			appliedPromoCode,
			appliedDiscount
		);

		const lineItems = order.items.map((item) => {
			const ttcPrice = item.product.price * (1 + tvaRate);
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
					product_data: {
						name: 'Frais de port'
					},
					unit_amount: Math.round(shippingCostFloat * 100)
				},
				quantity: 1
			});
		}

		const session = await stripe.checkout.sessions.create({
			payment_method_types: ['card'],
			line_items: lineItems,
			mode: 'payment',
			success_url: `${request.headers.get('origin')}/checkout/success`,
			cancel_url: `${request.headers.get('origin')}/auth`,
			metadata: {
				order_id: orderId,
				shipping_option: finalShippingOption,
				shipping_cost: (updatedOrder.shippingCost || 0).toString(),
				promo_code: appliedPromoCode || '',
				discount_amount: appliedDiscount.toString()
			},
			payment_intent_data: {
				metadata: {
					user_id: userId,
					order_id: orderId
				}
			}
		});

		if (promoResult.valid && promoResult.promo) {
			try {
				await incrementUsage(promoResult.promo.id);
			} catch (err) {
				console.error('Erreur incrementUsage code promo:', err);
			}
		}

		throw redirect(303, session.url || '/');
	}
};
