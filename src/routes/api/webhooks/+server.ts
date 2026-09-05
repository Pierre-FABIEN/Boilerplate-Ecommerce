import { json } from '@sveltejs/kit';
import Stripe from 'stripe';
import { prisma } from '$lib/server/index';
import dotenv from 'dotenv';
import { getUserIdByOrderId } from '$lib/prisma/order/prendingOrder';
import { nextInvoiceNumber } from '$lib/server/invoice/number';
import { snapshotInvoiceTotals } from '$lib/server/invoice/totals';
import { withLock } from '$lib/server/lock';
import { enqueuePostPaymentJob } from '$lib/server/qstash';
import { deduceWeightBracket, fallbackShippingMethod } from '$lib/server/jobs/post-payment';

/**
 * Webhook Stripe.
 *
 * COMMERCE-PLUGIN : crée la `Transaction` et passe la commande en `PAID`.
 * SENDCLOUD : facture + commande + étiquette partent en job asynchrone après
 * la transaction (`$lib/server/qstash.ts` → `$lib/server/jobs/post-payment.ts`),
 * pour ne jamais faire traîner la réponse à Stripe derrière un appel externe lent.
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
		// console.log('✅ Webhook verified and received:', event);
	} catch (err: any) {
		console.error('⚠️ Webhook signature verification failed.', err.message);
		return json({ error: 'Webhook signature verification failed.' }, { status: 400 });
	}

	// Handle the event
	switch (event.type) {
		case 'checkout.session.completed': {
			const session = event.data.object as Stripe.Checkout.Session;
			// console.log('✅ Checkout session completed:', session);
			// Verrou distribué : Stripe peut livrer le même webhook deux fois en
			// parallèle, ce qui laisserait passer les deux appels au travers du
			// `findUnique` de `handleCheckoutSession` avant que l'un des deux
			// n'ait eu le temps d'écrire la transaction.
			await withLock(`stripe:checkout:${session.id}`, 30, () => handleCheckoutSession(session));
			break;
		}

		case 'payment_intent.succeeded': {
			const paymentIntent = event.data.object;
			// console.log('✅ Payment intent succeeded:', paymentIntent);
			break;
		}

		case 'charge.succeeded': {
			const charge = event.data.object;
			// console.log('✅ Charge succeeded:', charge);
			break;
		}

		default:
			console.warn(`⚠️ Unhandled event type: ${event.type}`);
	}
	return json({ received: true }, { status: 200 });
}

/**
 * Gère la fin d'une session de paiement
 * 1) On enregistre la transaction en base (dans une transaction courte)
 * 2) On appelle Sendcloud hors transaction
 */
async function handleCheckoutSession(session: Stripe.Checkout.Session) {
	console.log('\n🚀 === DÉBUT TRAITEMENT WEBHOOK CHECKOUT ===');
	console.log('📋 Session Stripe reçue:', {
		id: session.id,
		amount_total: session.amount_total,
		currency: session.currency,
		payment_status: session.payment_status,
		customer_details: session.customer_details,
		metadata: session.metadata
	});

	const orderId = session.metadata?.order_id;
	if (!orderId) {
		console.error('❌ Order ID manquant dans les métadonnées de la session');
		return;
	}
	console.log('🆔 Order ID extrait:', orderId);

	// Récupération de l'utilisateur lié à la commande
	console.log("👤 Récupération de l'utilisateur pour la commande...");
	const user = await getUserIdByOrderId(orderId);
	if (!user || !user.userId) {
		console.error('❌ Utilisateur introuvable pour la commande:', orderId);
		return;
	}
	console.log('✅ Utilisateur trouvé:', { userId: user.userId });

	const userId = user.userId;

	const already = await prisma.transaction.findUnique({
		where: { stripePaymentId: session.id }
	});
	if (already) {
		console.log('ℹ️ Transaction déjà enregistrée:', already.id);
		return already;
	}

	let createdTransaction;

	try {
		console.log('💾 Début de la transaction Prisma...');
		// (1) ENREGISTREMENT EN DB via une transaction Prisma courte — aucun
		// appel Sendcloud ici : un timeout réseau empêcherait la facture d'exister.
		createdTransaction = await prisma.$transaction(async (prismaTx) => {
			console.log('🔍 Récupération de la commande depuis la base...');
			// Récupère la commande
			const order = await prismaTx.order.findUnique({
				where: { id: orderId },
				include: {
					user: true,
					address: true,
					items: { include: { product: true, custom: true } }
				}
			});

			if (!order) {
				console.error('❌ Commande introuvable:', orderId);
				throw new Error(`⚠️ Order ${orderId} not found`);
			}
			if (!order.address) {
				console.error('❌ Adresse manquante pour la commande:', orderId);
				throw new Error(`⚠️ Order ${orderId} has no associated address`);
			}

			console.log('✅ Commande récupérée:', {
				id: order.id,
				userId: order.userId,
				shippingOption: order.shippingOption,
				shippingCost: order.shippingCost,
				itemsCount: order.items.length,
				address: {
					city: order.address.city,
					zip: order.address.zip,
					country: order.address.country
				}
			});

			const weightBracket = deduceWeightBracket(order);
			// Dimensions de secours uniquement : aucun fetch Sendcloud ici.
			const shippingMethodData = fallbackShippingMethod(order.shippingOption || '', weightBracket);

			const invoiceNumber = await nextInvoiceNumber(prismaTx);
			const invoiceTotals = snapshotInvoiceTotals({
				lines: order.items.map((item: { price: number; quantity: number }) => ({
					price: item.price,
					quantity: item.quantity
				})),
				shippingCost: parseFloat(order.shippingCost?.toString() ?? '0'),
				discountAmount: order.discountAmount ?? 0,
				paidTotal: (session.amount_total ?? 0) / 100
			});

			// Préparation des données de la transaction
			const transactionData = {
				// Liens Stripe
				stripePaymentId: session.id,
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
				package_weight: shippingMethodData?.weight ?? weightBracket, // Utilise le bracket de poids si null
				package_weight_unit: shippingMethodData?.weightUnit ?? 'kg',
				package_volume:
					shippingMethodData?.volume ??
					(weightBracket <= 3 ? 9000 : weightBracket <= 6 ? 24000 : 45000), // Volume calculé si null
				package_volume_unit: shippingMethodData?.volumeUnit ?? 'cm3',

				// Adresse
				address_first_name: order.address.first_name,
				address_last_name: order.address.last_name,
				address_phone: order.address.phone,
				address_company: order.address.company,
				address_street_number: order.address.street_number,
				address_street: order.address.street,
				address_city: order.address.city,
				address_county: order.address.county,
				address_state: order.address.state,
				address_stateLetter: order.address.stateLetter,
				address_state_code: order.address.state_code,
				address_zip: order.address.zip,
				address_country: order.address.country,
				address_country_code: order.address.country_code,
				address_ISO_3166_1_alpha_3: order.address.ISO_3166_1_alpha_3,
				address_type: order.address.type,

				// 📍 Point Relais
				servicePointId: order.servicePointId ?? null,
				servicePointPostNumber: order.servicePointPostNumber ?? null,
				servicePointLatitude: order.servicePointLatitude ?? null,
				servicePointLongitude: order.servicePointLongitude ?? null,
				servicePointType: order.servicePointType ?? null,
				servicePointExtraRefCab: order.servicePointExtraRefCab ?? null,
				servicePointExtraShopRef: order.servicePointExtraShopRef ?? null,

				// Produits (JSON)
				invoiceNumber,
				subtotalHt: invoiceTotals.subtotalHt,
				taxRate: invoiceTotals.taxRate,
				taxAmount: invoiceTotals.taxAmount,
				discountAmount: invoiceTotals.discountAmount,
				promoCode: order.promoCode ?? null,

				products: order.items.map((item: any) => ({
					id: item.productId,
					name: item.product.name,
					price: item.price,
					quantity: item.quantity,
					description: item.product.description,
					stock: item.product.stock,
					images: item.product.images,
					customizations: item.custom.map((c: any) => ({
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

			console.log('📝 Données de transaction préparées:', {
				stripePaymentId: transactionData.stripePaymentId,
				amount: transactionData.amount,
				currency: transactionData.currency,
				shippingOption: transactionData.shippingOption,
				shippingCost: transactionData.shippingCost,
				shippingMethodId: transactionData.shippingMethodId,
				shippingMethodName: transactionData.shippingMethodName,
				package_dimensions: `${transactionData.package_length}x${transactionData.package_width}x${transactionData.package_height}${transactionData.package_dimension_unit}`,
				package_weight: `${transactionData.package_weight}${transactionData.package_weight_unit}`,
				products_count: transactionData.products.length
			});

			// Crée la transaction dans la BDD
			console.log('💾 Création de la transaction en base...');
			const newTx = await prismaTx.transaction.create({
				data: transactionData
			});

			await prismaTx.order.update({
				where: { id: orderId },
				data: { status: 'PAID' }
			});

			console.log('✅ Transaction créée avec succès:', {
				id: newTx.id,
				stripePaymentId: newTx.stripePaymentId,
				amount: newTx.amount,
				status: newTx.status
			});

			return newTx;
		});
	} catch (error) {
		console.error(`❌ Échec de la création de la transaction pour la commande ${orderId}:`, error);
		return; // on arrête ici si l'enregistrement DB a échoué
	}

	console.log('🎉 Transaction en base créée avec succès:', createdTransaction?.id);

	// Facture + Sendcloud partent en job asynchrone (QStash si configuré,
	// sinon exécution directe équivalente en dev) : voir $lib/server/jobs/post-payment.ts.
	if (createdTransaction) {
		await enqueuePostPaymentJob(createdTransaction.id);
	}

	console.log('🏁 === FIN TRAITEMENT WEBHOOK CHECKOUT ===\n');
}
