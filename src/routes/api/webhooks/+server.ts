import { json } from '@sveltejs/kit';
import Stripe from 'stripe';
import { prisma } from '$lib/server/index';
import dotenv from 'dotenv';
import { getUserIdByOrderId } from '$lib/prisma/order/prendingOrder';
import { incrementUsage } from '$lib/prisma/promo/promo';
import { decrementGiftCardBalance } from '$lib/prisma/giftCards/giftCards';
import { nextInvoiceNumber } from '$lib/server/invoice/number';
import { snapshotInvoiceTotals } from '$lib/server/invoice/totals';
import { getVatRate } from '$lib/server/vat';
import { withLock } from '$lib/server/lock';
import {
	enqueuePostPaymentJob,
	enqueueInvoiceEmailJob,
	enqueueLoyaltyCheckJob,
	enqueueReferralRewardJob
} from '$lib/server/qstash';
import { derivePackageEstimate, fallbackShippingMethod } from '$lib/server/jobs/post-payment';
import { getStoreFeatureFlags } from '$lib/server/storeSettings';
import { log } from '$lib/server/log';
import { notifyDispute } from '$lib/server/disputeAlert';
import { bumpCacheVersion } from '$lib/server/cache';
import { mapTransaction } from '$lib/prisma/transaction/mapTransaction';
import { mapOrderFields, mapOrderItemWithProduct } from '$lib/prisma/order/mapOrder';

/**
 * Webhook Stripe.
 *
 * COMMERCE-PLUGIN : crée la `Transaction` et passe la commande en `PAID`.
 * Facture (SMTP) et SENDCLOUD (commande + étiquette) partent chacun dans leur
 * propre job asynchrone après la transaction (`$lib/server/qstash.ts` →
 * `$lib/server/jobs/invoice-email.ts` / `jobs/post-payment.ts`), pour ne
 * jamais faire traîner la réponse à Stripe derrière un appel externe lent, et
 * pour qu'un ralentissement de l'un n'affecte pas l'autre.
 * Le store panier client n'est pas réinitialisé ici (no-op hors navigateur) :
 * `/checkout/success` s'en charge.
 */

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

export async function POST({ request }: { request: Request }) {
	const sig = request.headers.get('stripe-signature');
	const body = await request.text(); // Récupère le corps brut

	let event: Stripe.Event;

	try {
		event = stripe.webhooks.constructEvent(
			body,
			sig || '',
			process.env.STRIPE_WEBHOOK_SECRET || ''
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		log('ERROR', 'webhook:stripe', '⚠️ Webhook signature verification failed.', message);
		return json({ error: 'Webhook signature verification failed.' }, { status: 400 });
	}

	// Handle the event
	switch (event.type) {
		case 'checkout.session.completed': {
			const session = event.data.object as Stripe.Checkout.Session;
			// Verrou distribué : Stripe peut livrer le même webhook deux fois en
			// parallèle, ce qui laisserait passer les deux appels au travers du
			// `findUnique` de `handleCheckoutSession` avant que l'un des deux
			// n'ait eu le temps d'écrire la transaction.
			await withLock(`stripe:checkout:${session.id}`, 30, () => handleCheckoutSession(session));
			break;
		}

		case 'payment_intent.succeeded':
		case 'charge.succeeded':
			break;

		case 'charge.dispute.created': {
			const dispute = event.data.object as Stripe.Dispute;
			await handleChargeDisputeCreated(dispute);
			break;
		}

		case 'charge.dispute.closed': {
			const dispute = event.data.object as Stripe.Dispute;
			await handleChargeDisputeClosed(dispute);
			break;
		}

		default:
			log('WARN', 'webhook:stripe', `⚠️ Unhandled event type: ${event.type}`);
	}
	return json({ received: true }, { status: 200 });
}

/**
 * Retrouve la transaction visée par un litige via le PaymentIntent brut du
 * dispute (`dispute.payment_intent`) — jamais via un appel Stripe
 * supplémentaire, `stripePaymentIntentId` est déjà posé au paiement.
 */
async function findTransactionForDispute(dispute: Stripe.Dispute) {
	const paymentIntentId =
		typeof dispute.payment_intent === 'string'
			? dispute.payment_intent
			: dispute.payment_intent?.id;
	if (!paymentIntentId) {
		log('WARN', 'webhook:stripe', '⚠️ Litige sans PaymentIntent, ignoré', {
			disputeId: dispute.id
		});
		return null;
	}
	const transaction = await prisma.transaction.findUnique({
		where: { stripePaymentIntentId: paymentIntentId }
	});
	if (!transaction) {
		log('WARN', 'webhook:stripe', '⚠️ Aucune transaction pour ce PaymentIntent', {
			disputeId: dispute.id,
			paymentIntentId
		});
		return null;
	}
	return mapTransaction(transaction);
}

async function handleChargeDisputeCreated(dispute: Stripe.Dispute) {
	const transaction = await findTransactionForDispute(dispute);
	if (!transaction) return;
	// Retry du même évènement webhook : déjà tracé, pas de double alerte.
	if (transaction.disputeId === dispute.id) {
		log('DEBUG', 'webhook:stripe', 'ℹ️ Litige déjà enregistré, retry ignoré', {
			disputeId: dispute.id
		});
		return;
	}

	const updated = await prisma.transaction.update({
		where: { id: transaction.id },
		data: {
			disputeId: dispute.id,
			disputeStatus: dispute.status,
			disputeReason: dispute.reason,
			disputeAmount: dispute.amount / 100,
			disputeOpenedAt: new Date(dispute.created * 1000)
		}
	});

	await notifyDispute(mapTransaction(updated), 'created');
}

async function handleChargeDisputeClosed(dispute: Stripe.Dispute) {
	const transaction = await findTransactionForDispute(dispute);
	if (!transaction) return;
	if (transaction.disputeClosedAt) {
		log('DEBUG', 'webhook:stripe', 'ℹ️ Litige déjà clos, retry ignoré', {
			disputeId: dispute.id
		});
		return;
	}

	const updated = await prisma.transaction.update({
		where: { id: transaction.id },
		data: {
			disputeStatus: dispute.status,
			disputeClosedAt: new Date()
		}
	});

	await notifyDispute(mapTransaction(updated), 'closed');
}

/**
 * Gère la fin d'une session de paiement
 * 1) On enregistre la transaction en base (dans une transaction courte)
 * 2) On appelle Sendcloud hors transaction
 */
async function handleCheckoutSession(session: Stripe.Checkout.Session) {
	log('DEBUG', 'webhook:stripe', '=== DÉBUT TRAITEMENT WEBHOOK CHECKOUT ===');
	// Pas de `customer_details` (nom/email/téléphone/adresse) dans les logs :
	// ils partent vers un système tiers (Vercel) qui n'a pas à recevoir de PII.
	log('DEBUG', 'webhook:stripe', 'Session Stripe reçue:', {
		id: session.id,
		amount_total: session.amount_total,
		currency: session.currency,
		payment_status: session.payment_status,
		metadata: session.metadata
	});

	const orderId = session.metadata?.order_id;
	if (!orderId) {
		log('ERROR', 'webhook:stripe', '❌ Order ID manquant dans les métadonnées de la session');
		return;
	}

	const user = await getUserIdByOrderId(orderId);
	if (!user || !user.userId) {
		log('ERROR', 'webhook:stripe', '❌ Utilisateur introuvable pour la commande:', orderId);
		return;
	}

	const userId = user.userId;

	const already = await prisma.transaction.findUnique({
		where: { stripePaymentId: session.id }
	});
	if (already) {
		log('DEBUG', 'webhook:stripe', 'ℹ️ Transaction déjà enregistrée:', already.id);
		return mapTransaction(already);
	}

	let createdTransaction;
	// Lu avant la transaction courte ci-dessous : un appel `StoreSettings`
	// de plus dans la transaction n'apporterait rien, le taux ne dépend
	// d'aucune donnée écrite par cette même transaction.
	const vatRate = await getVatRate();

	try {
		// (1) ENREGISTREMENT EN DB via une transaction Prisma courte — aucun
		// appel Sendcloud ici : un timeout réseau empêcherait la facture d'exister.
		createdTransaction = await prisma.$transaction(async (prismaTx) => {
			// Récupère la commande
			const rawOrder = await prismaTx.order.findUnique({
				where: { id: orderId },
				include: {
					user: true,
					shippingAddress: true,
					billingAddress: true,
					items: { include: { product: true, custom: true } }
				}
			});

			if (!rawOrder) {
				throw new Error(`⚠️ Order ${orderId} not found`);
			}
			if (!rawOrder.shippingAddress) {
				throw new Error(`⚠️ Order ${orderId} has no associated shipping address`);
			}
			if (!rawOrder.billingAddress) {
				throw new Error(`⚠️ Order ${orderId} has no associated billing address`);
			}
			const { shippingAddress, billingAddress } = rawOrder;
			const order = {
				...mapOrderFields(rawOrder),
				items: rawOrder.items.map(mapOrderItemWithProduct),
				shippingAddress,
				billingAddress
			};
			// (jamais les deux, `Cart.svelte` ne borne la quantité que sur
			// `variant.stock` une fois une variante choisie). `decrement` est
			// atomique (protège contre une double livraison webhook malgré le
			// `withLock` au-dessus). Pas de vérification de stock disponible ici
			// (pas de réservation posée au checkout) : une vente concurrente sur
			// le dernier exemplaire peut donc faire passer le stock sous 0, à
			// traiter comme une rupture le temps du réassort, pas bloqué ici.
			for (const item of order.items) {
				if (item.variantId) {
					await prismaTx.productVariant.update({
						where: { id: item.variantId },
						data: { stock: { decrement: item.quantity } }
					});
				} else {
					await prismaTx.product.update({
						where: { id: item.productId },
						data: { stock: { decrement: item.quantity } }
					});
				}
			}

			// Consomme le code promo / la carte cadeau ici, pas au clic « Payer »
			// (`checkout/+page.server.ts`) : un panier abandonné ou un paiement
			// refusé sur Stripe ne coûte plus rien au client — même correction
			// que le stock ci-dessus.
			if (order.promoCode) {
				const promo = await prismaTx.promoCode.findUnique({ where: { code: order.promoCode } });
				if (promo) {
					await incrementUsage(prismaTx, promo.id);
				}
			}
			if (order.giftCardCode && order.giftCardAmount > 0) {
				const giftCard = await prismaTx.giftCard.findUnique({
					where: { code: order.giftCardCode }
				});
				if (giftCard) {
					await decrementGiftCardBalance(prismaTx, giftCard.id, order.giftCardAmount);
				}
			}

			const packageEstimate = derivePackageEstimate(order);
			// Dimensions de secours uniquement : aucun fetch Sendcloud ici.
			const shippingMethodData = fallbackShippingMethod(
				order.shippingOption || '',
				packageEstimate
			);

			const invoiceNumber = await nextInvoiceNumber(prismaTx);
			const invoiceTotals = snapshotInvoiceTotals({
				lines: order.items.map((item: { price: number; quantity: number }) => ({
					price: item.price,
					quantity: item.quantity
				})),
				vatRatePercent: vatRate * 100,
				shippingCost: parseFloat(order.shippingCost?.toString() ?? '0'),
				discountAmount: order.discountAmount ?? 0,
				paidTotal: (session.amount_total ?? 0) / 100
			});

			// Préparation des données de la transaction
			const transactionData = {
				// Liens Stripe
				stripePaymentId: session.id,
				// Id brut, déjà présent dans le payload (pas d'expand) : sert à
				// rattacher un futur litige (`charge.dispute.*`) sans appel API.
				stripePaymentIntentId:
					typeof session.payment_intent === 'string'
						? session.payment_intent
						: (session.payment_intent?.id ?? null),
				amount: (session.amount_total ?? 0) / 100,
				currency: session.currency ?? 'eur',
				customer_details_email: session.customer_details?.email || '',
				customer_details_name: session.customer_details?.name || '',
				customer_details_phone: session.customer_details?.phone || '',
				status: session.payment_status || 'unknown',
				orderId: orderId,
				createdAt: session.created ? new Date(session.created * 1000) : new Date(),

				// Infos transport
				shippingOption: order.shippingOption ?? '',
				shippingCost: parseFloat(order.shippingCost?.toString() ?? '0'),

				// Méthode d'expédition
				shippingMethodId: shippingMethodData?.id ?? 9999, // ID par défaut si null
				shippingMethodName: shippingMethodData?.name ?? `Méthode: ${order.shippingOption}`,

				// Dimensions + Poids
				package_length: shippingMethodData?.length ?? 50, // Valeur par défaut si null
				package_width: shippingMethodData?.width ?? 40, // Valeur par défaut si null
				package_height: shippingMethodData?.height ?? 30, // Valeur par défaut si null
				package_dimension_unit: shippingMethodData?.unit ?? 'cm',
				package_weight: shippingMethodData?.weight ?? packageEstimate.weightKg,
				package_weight_unit: shippingMethodData?.weightUnit ?? 'kg',
				package_volume:
					shippingMethodData?.volume ??
					packageEstimate.lengthCm * packageEstimate.widthCm * packageEstimate.heightCm,
				package_volume_unit: shippingMethodData?.volumeUnit ?? 'cm3',

				// Adresse (expédition — Sendcloud / bordereau)
				address_first_name: order.shippingAddress.first_name,
				address_last_name: order.shippingAddress.last_name,
				address_phone: order.shippingAddress.phone,
				address_company: order.shippingAddress.company,
				address_street_number: order.shippingAddress.street_number,
				address_street: order.shippingAddress.street,
				address_city: order.shippingAddress.city,
				address_county: order.shippingAddress.county,
				address_state: order.shippingAddress.state,
				address_stateLetter: order.shippingAddress.stateLetter,
				address_state_code: order.shippingAddress.state_code,
				address_zip: order.shippingAddress.zip,
				address_country: order.shippingAddress.country,
				address_country_code: order.shippingAddress.country_code,
				address_ISO_3166_1_alpha_3: order.shippingAddress.ISO_3166_1_alpha_3,

				// Adresse de facturation (facture PDF)
				billing_first_name: order.billingAddress.first_name,
				billing_last_name: order.billingAddress.last_name,
				billing_phone: order.billingAddress.phone,
				billing_company: order.billingAddress.company,
				billing_street_number: order.billingAddress.street_number,
				billing_street: order.billingAddress.street,
				billing_city: order.billingAddress.city,
				billing_county: order.billingAddress.county,
				billing_state: order.billingAddress.state,
				billing_stateLetter: order.billingAddress.stateLetter,
				billing_state_code: order.billingAddress.state_code,
				billing_zip: order.billingAddress.zip,
				billing_country: order.billingAddress.country,
				billing_country_code: order.billingAddress.country_code,
				billing_ISO_3166_1_alpha_3: order.billingAddress.ISO_3166_1_alpha_3,

				// 📍 Point Relais
				servicePointId: order.servicePointId ?? null,
				servicePointPostNumber: order.servicePointPostNumber ?? null,
				servicePointLatitude: order.servicePointLatitude ?? null,
				servicePointLongitude: order.servicePointLongitude ?? null,
				servicePointType: order.servicePointType ?? null,
				servicePointExtraRefCab: order.servicePointExtraRefCab ?? null,
				servicePointExtraShopRef: order.servicePointExtraShopRef ?? null,

				// Détection de fraude — recopié tel quel depuis `Order` (posé par
				// l'action `checkout`, avant la tentative de paiement), même pattern
				// que les adresses ci-dessus.
				riskScore: order.riskScore ?? null,
				riskLevel: order.riskLevel ?? null,
				riskFactors: order.riskFactors ?? [],

				// Produits (JSON)
				invoiceNumber,
				subtotalHt: invoiceTotals.subtotalHt,
				taxRate: invoiceTotals.taxRate,
				taxAmount: invoiceTotals.taxAmount,
				discountAmount: invoiceTotals.discountAmount,
				promoCode: order.promoCode ?? null,

				products: order.items.map((item) => ({
					id: item.productId,
					name: item.product.name,
					price: item.price,
					quantity: item.quantity,
					description: item.product.description,
					stock: item.product.stock,
					images: item.product.images,
					customizations: item.custom.map((c) => ({
						id: c.id,
						image: c.image,
						userMessage: c.userMessage,
						createdAt: c.createdAt,
						updatedAt: c.updatedAt
					}))
				})),

				// Clés étrangères posées en scalaire : mélanger un `connect` avec le
				// scalaire orderId ne correspond à aucun des deux inputs Prisma.
				userId: userId
			};

			// Crée la transaction dans la BDD
			const newTx = await prismaTx.transaction.create({
				data: transactionData
			});

			await prismaTx.order.update({
				where: { id: orderId },
				data: { status: 'PAID' }
			});

			return mapTransaction(newTx);
		});
	} catch (error) {
		log(
			'ERROR',
			'webhook:stripe',
			`❌ Échec de la création de la transaction pour la commande ${orderId}:`,
			error
		);
		return; // on arrête ici si l'enregistrement DB a échoué
	}

	log('INFO', 'webhook:stripe', 'Transaction créée', {
		transactionId: createdTransaction?.id,
		orderId,
		amount: createdTransaction?.amount
	});

	// Le stock vendu vient de changer (décrément ci-dessus) : invalide le
	// cache catalogue public, même appel que `updateProductById`.
	if (createdTransaction) {
		await bumpCacheVersion('catalog');
	}

	// Facture et Sendcloud partent en deux jobs asynchrones indépendants
	// (QStash si configuré, sinon exécution directe équivalente en dev) : un
	// pic SMTP ou un ralentissement Sendcloud ne doit pas bloquer l'autre.
	// Voir $lib/server/jobs/invoice-email.ts et $lib/server/jobs/post-payment.ts.
	// `allSettled`, pas `all` : la transaction est déjà commitée à ce stade,
	// un rejet d'un job (ex. repli direct en dev sans QStash, débit SMTP
	// atteint) ne doit jamais faire échouer la réponse au webhook Stripe — un
	// job qui échoue via QStash a déjà son propre retry indépendant.
	if (createdTransaction) {
		const jobs = [
			enqueueInvoiceEmailJob(createdTransaction.id),
			enqueuePostPaymentJob(createdTransaction.id)
		];

		// PROMO-PLUGIN : la fidélité n'est vérifiée que si le module est activé
		// (`/admin/settings`) — pas de comptage/envoi inutile sinon.
		const flags = await getStoreFeatureFlags();
		if (flags.loyaltyEnabled && orderId) {
			jobs.push(enqueueLoyaltyCheckJob(orderId));
		}

		// Parrainage : même garde, récompense du parrain sortie du chemin
		// synchrone (module Gift Cards, voir $lib/server/jobs/referral.ts).
		if (flags.referralEnabled && orderId) {
			jobs.push(enqueueReferralRewardJob(orderId));
		}

		const jobResults = await Promise.allSettled(jobs);
		for (const result of jobResults) {
			if (result.status === 'rejected') {
				log('ERROR', 'webhook:stripe', "Échec d'enfilage d'un job post-paiement", result.reason);
			}
		}
	}

	log('DEBUG', 'webhook:stripe', '=== FIN TRAITEMENT WEBHOOK CHECKOUT ===');
}
