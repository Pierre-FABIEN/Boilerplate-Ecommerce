/**
 * Tunnel de paiement.
 *
 * COMMERCE-PLUGIN : login obligatoire, la commande doit appartenir au visiteur,
 * les frais de port Sendcloud (0–200 €) sont acceptés pour créer la session
 * Stripe. PROMO-PLUGIN : `validatePromo` reste ici pour que le checkout
 * compile ; ce n'est pas le périmètre du module (`incrementUsage` est
 * appelé côté webhook, après confirmation du paiement).
 */
import { zod } from 'sveltekit-superforms/adapters';
import { superValidate } from 'sveltekit-superforms';

import { error, redirect, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

import { getOrderById } from '$lib/prisma/order/prendingOrder';
import { getUserAddresses } from '$lib/prisma/addresses/addresses';
import { OrderSchema } from '$lib/schema/order/order';
import { validatePromo } from '$lib/prisma/promo/promo';
import { validateGiftCard } from '$lib/prisma/giftCards/giftCards';
import {
	isReferralDiscountEligible,
	REFERRAL_REFEREE_DISCOUNT_PERCENT
} from '$lib/prisma/referral/referral';
import { computeBundleDiscount, BUNDLE_DISCOUNT_PERCENT } from '$lib/prisma/bundles/bundles';
import { getStoreFeatureFlags } from '$lib/server/storeSettings';
import { computeFraudScore } from '$lib/server/fraud';
import { log } from '$lib/server/log';
import { prisma } from '$lib/server';
import {
	assertOrderOwnedBy,
	createCheckoutSession,
	resolveTrustedShippingCost
} from '$lib/commerce/checkout';
import { getVatRate } from '$lib/server/vat';
import { getDeliveryEstimate } from '$lib/server/delivery';
import { CartForbiddenError, InvalidShippingError } from '$lib/commerce/errors';

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
	const { giftCardsEnabled, referralEnabled, frequentlyBoughtTogetherEnabled } =
		await getStoreFeatureFlags();
	const referralDiscountEligible = referralEnabled
		? await isReferralDiscountEligible(userId)
		: false;

	// BUNDLE-PLUGIN ▼ aperçu uniquement (bandeau d'info) : la remise réelle est
	// recalculée dans l'action `checkout`, jamais lue d'ici.
	let bundleDiscountEligible = false;
	if (frequentlyBoughtTogetherEnabled) {
		// Déjà chargée par `pendingOrderHandle` (hooks.server.ts) pour cette
		// même requête : pas besoin d'un second `findPendingOrder`.
		const pendingOrder = locals.pendingOrder;
		const productIds = pendingOrder?.items.map((item) => item.productId) ?? [];
		const vatRate = await getVatRate();
		const productTotalTTC = (pendingOrder?.items ?? []).reduce(
			(sum, item) => sum + item.price * (1 + vatRate) * item.quantity,
			0
		);
		bundleDiscountEligible = (await computeBundleDiscount(productIds, productTotalTTC)) > 0;
	}
	// BUNDLE-PLUGIN ▲

	const deliveryEstimate = await getDeliveryEstimate();

	return {
		addresses,
		IOrderSchema,
		giftCardsEnabled,
		referralDiscountEligible,
		referralDiscountPercent: REFERRAL_REFEREE_DISCOUNT_PERCENT,
		bundleDiscountEligible,
		bundleDiscountPercent: BUNDLE_DISCOUNT_PERCENT,
		deliveryEstimate
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
			shippingAddressId,
			billingAddressId,
			shippingOption,
			shippingCost,
			promoCode,
			giftCardCode,
			servicePointId,
			servicePointPostNumber,
			servicePointLatitude,
			servicePointLongitude,
			servicePointType,
			servicePointExtraRefCab,
			servicePointExtraShopRef
		} = form.data;

		if (!orderId || !shippingAddressId || !billingAddressId) {
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

		// Les deux ids d'adresse viennent du formulaire : sans ce contrôle, un
		// compte authentifié pourrait faire livrer et facturer sa commande à
		// l'adresse d'un tiers, puis la lire dans sa propre facture.
		const addressIds = [...new Set([shippingAddressId, billingAddressId])];
		const ownedAddressCount = await prisma.address.count({
			where: { id: { in: addressIds }, userId }
		});
		if (ownedAddressCount !== addressIds.length) {
			error(403, 'Adresse invalide.');
		}

		// Après la vérification de propriété (autorisation), jamais avant : ce
		// n'est qu'une règle métier/légale, pas une frontière de sécurité.
		if (formData.get('cgvAccepted') !== 'on') {
			error(400, 'Veuillez accepter les conditions générales de vente.');
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

		// PROMO-PLUGIN ▼ hors périmètre commerce ; conservé pour que le tunnel compile.
		const vatRate = await getVatRate();
		// Même base que la session Stripe (`createCheckoutSession`) : `item.price`
		// porte la surcharge de prix de la variante, pas `item.product.price`.
		const productTotalTTC = parseFloat(
			order.items
				.reduce((sum, item) => sum + item.price * (1 + vatRate) * item.quantity, 0)
				.toFixed(2)
		);
		const promoResult = await validatePromo(promoCode, productTotalTTC);
		const promoDiscount = promoResult.valid ? promoResult.discountAmount : 0;
		const appliedPromoCode = promoResult.valid ? (promoResult.promo?.code ?? null) : null;
		// PROMO-PLUGIN ▲

		// Carte cadeau : plafonnée par ce qu'il reste à payer une fois la remise
		// promo ci-dessus déduite. Comme pour `validatePromo`, seul ce calcul
		// serveur fait foi — jamais un montant envoyé par le client.
		const {
			giftCardsEnabled,
			referralEnabled,
			frequentlyBoughtTogetherEnabled,
			fraudDetectionEnabled,
			fraudBlockingEnabled
		} = await getStoreFeatureFlags();
		const remainderAfterPromo = Math.max(0, productTotalTTC - promoDiscount);

		// BUNDLE-PLUGIN ▼ même garde que promo/parrainage : recalculée ici depuis
		// l'historique réel des commandes, jamais une valeur transmise par le client.
		const bundleDiscount = frequentlyBoughtTogetherEnabled
			? await computeBundleDiscount(
					order.items.map((item) => item.productId),
					remainderAfterPromo
				)
			: 0;
		const remainderAfterBundle = Math.max(0, remainderAfterPromo - bundleDiscount);
		// BUNDLE-PLUGIN ▲

		// Parrainage : remise automatique sur la première commande payée d'un
		// compte parrainé — recalculée ici, jamais déduite d'une valeur envoyée par
		// le client (même logique que promo/carte cadeau).
		const referralEligible = referralEnabled && (await isReferralDiscountEligible(userId));
		const referralDiscount = referralEligible
			? parseFloat((remainderAfterBundle * REFERRAL_REFEREE_DISCOUNT_PERCENT).toFixed(2))
			: 0;

		const giftCardResult = giftCardsEnabled
			? await validateGiftCard(giftCardCode, Math.max(0, remainderAfterBundle - referralDiscount))
			: { valid: false, amount: 0, giftCard: null };
		const appliedGiftCardAmount = giftCardResult.valid ? giftCardResult.amount : 0;
		const appliedGiftCardCode = giftCardResult.valid
			? (giftCardResult.giftCard?.code ?? null)
			: null;

		const appliedDiscount = parseFloat(
			(promoDiscount + bundleDiscount + referralDiscount + appliedGiftCardAmount).toFixed(2)
		);

		// COMMERCE-PLUGIN : réutilise le client Stripe existant (`savedPaymentsEnabled`)
		// s'il en existe déjà un pour ce compte — n'en crée jamais un ici.
		const currentUser = await prisma.user.findUnique({
			where: { id: userId },
			select: { stripeCustomerId: true, email: true }
		});

		// Détection de fraude (`StoreSettings.fraudDetectionEnabled`) : calculée
		// ici, juste avant la session Stripe, jamais après — un score élevé
		// n'ouvre jamais de session quand `fraudBlockingEnabled` est aussi actif
		// (voir `$lib/server/fraud.ts` et docs/commerce/README.md pour le choix
		// « avant paiement » plutôt qu'une capture Stripe différée).
		if (fraudDetectionEnabled) {
			const risk = await computeFraudScore({
				userId,
				userEmail: currentUser?.email ?? '',
				shippingAddressId,
				billingAddressId
			});
			await prisma.order.update({
				where: { id: orderId },
				data: { riskScore: risk.score, riskLevel: risk.level, riskFactors: risk.factors }
			});

			if (fraudBlockingEnabled && risk.level === 'high') {
				await prisma.fraudBlock.create({
					data: {
						userId,
						orderId,
						email: currentUser?.email ?? '',
						riskScore: risk.score,
						riskLevel: risk.level,
						riskFactors: risk.factors
					}
				});
				log('WARN', 'fraud', 'Commande bloquée avant paiement', {
					userId,
					orderId,
					score: risk.score,
					factors: risk.factors
				});
				// Message générique : jamais le détail des facteurs déclenchés, même
				// logique anti-oracle que `guestTrackingLimiter` (docs/commerce/README.md).
				error(
					403,
					'Cette commande ne peut pas être finalisée pour le moment. Contactez le support si besoin.'
				);
			}
		}

		const session = await createCheckoutSession({
			order,
			userId,
			origin: request.headers.get('origin') ?? '',
			shippingAddressId,
			billingAddressId,
			shippingOption: hasCustomItems ? 'no_shipping' : shippingOption || 'no_shipping',
			trustedShippingCost,
			hasCustomItems,
			promoCode: appliedPromoCode,
			discountAmount: appliedDiscount,
			giftCardCode: appliedGiftCardCode,
			giftCardAmount: appliedGiftCardAmount,
			stripeCustomerId: currentUser?.stripeCustomerId,
			servicePoint: {
				id: servicePointId,
				postNumber: servicePointPostNumber,
				latitude: servicePointLatitude,
				longitude: servicePointLongitude,
				type: servicePointType,
				extraRefCab: servicePointExtraRefCab,
				extraShopRef: servicePointExtraShopRef
			}
		});

		// Usage promo et solde carte cadeau sont désormais consommés dans le
		// webhook `checkout.session.completed` (paiement confirmé), pas ici :
		// un panier abandonné/refusé sur la page Stripe ne coûte plus rien au
		// client (même correction que le stock produit, voir handleCheckoutSession).
		throw redirect(303, session.url || '/');
	}
};
