import { zod } from 'sveltekit-superforms/adapters';
import { superValidate } from 'sveltekit-superforms';
import Stripe from 'stripe';
import dotenv from 'dotenv';

import { json, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

import { getOrderById, updateOrder } from '$lib/prisma/order/prendingOrder';
import { getUserAddresses } from '$lib/prisma/addresses/addresses';
import { OrderSchema } from '$lib/schema/order/order';
import { validatePromo, incrementUsage } from '$lib/prisma/promo/promo';

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
	// Préparer la validation Superform
	const IOrderSchema = await superValidate(zod(OrderSchema));
	// Charger les adresses
	const addresses = await getUserAddresses(userId);

	return {
		addresses,
		IOrderSchema
	};
}) satisfies PageServerLoad;

export const actions: Actions = {
	checkout: async ({ request }) => {
		const formData = await request.formData();
		const form = await superValidate(formData, zod(OrderSchema));

		// console.log('Form data validated =>', form);

		// 1) Extract fields
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

		// Basic checks
		if (!orderId || !addressId) {
			return json({ error: 'Veuillez sélectionner une option de livraison.' }, { status: 400 });
		}

		// Vérifier si la commande contient des personnalisations
		const order = await getOrderById(orderId);
		if (!order) {
			return json({ error: 'Commande introuvable' }, { status: 404 });
		}
		
		const hasCustomItems = order.items.some(item => (item as any).custom && (item as any).custom.length > 0);
		
		// Pour les commandes personnalisées, on accepte des valeurs par défaut
		const finalShippingOption = hasCustomItems ? 'no_shipping' : (shippingOption || '');
		const finalShippingCost = hasCustomItems ? '0' : (shippingCost || '0');
		
		// Validation pour les commandes non-personnalisées
		if (!hasCustomItems && (!finalShippingOption || !finalShippingCost)) {
			return json({ error: 'Veuillez sélectionner une option de livraison.' }, { status: 400 });
		}

		const userId = order.userId;

		// 2bis) Validation du code promo côté serveur (source de vérité).
		// La remise s'applique sur le total TTC des produits (hors frais de port).
		const tvaRate = 0.055;
		const productTotalTTC = parseFloat(
			order.items
				.reduce((sum, item) => sum + item.price * (1 + tvaRate) * item.quantity, 0)
				.toFixed(2)
		);

		const promoResult = await validatePromo(promoCode, productTotalTTC);
		const appliedDiscount = promoResult.valid ? promoResult.discountAmount : 0;
		const appliedPromoCode = promoResult.valid ? promoResult.promo?.code ?? null : null;

		// Facteur de remise proportionnel appliqué aux produits uniquement
		const discountFactor =
			appliedDiscount > 0 && productTotalTTC > 0
				? (productTotalTTC - appliedDiscount) / productTotalTTC
				: 1;

		// 3) Update the order in DB with shipping info + remise
		const updatedOrder = await updateOrder(
			orderId,
			addressId,
			finalShippingOption,
			finalShippingCost, // ex: "16.76"
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
			// item.price = 10 => c'est du HT
			const ttcPrice = item.price * (1 + tvaRate); // 10 * 1.055 = 10.55
			// On applique la remise proportionnellement sur le prix unitaire TTC
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

		// 5) Add a single lineItem for shipping if shippingCost > 0
		const shippingCostFloat = parseFloat((updatedOrder.shippingCost || 0).toString());
		if (shippingCostFloat > 0 && !hasCustomItems) {
			lineItems.push({
				price_data: {
					currency: 'eur',
					product_data: {
						name: 'Frais de port'
					},
					unit_amount: Math.round(shippingCostFloat * 100) // shippingCost is TTC => just multiply by 100
				},
				quantity: 1
			});
		}

		// 6) Create the Stripe Checkout Session
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

		// 6bis) Incrémenter le compteur d'utilisation du code promo si appliqué
		if (promoResult.valid && promoResult.promo) {
			try {
				await incrementUsage(promoResult.promo.id);
			} catch (err) {
				console.error('Erreur incrementUsage code promo:', err);
			}
		}

		// 7) Redirect user to Stripe checkout
		throw redirect(303, session.url || '/');
	}
};
