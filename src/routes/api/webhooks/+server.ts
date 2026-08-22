import { json } from '@sveltejs/kit';
import Stripe from 'stripe';
import { prisma } from '$lib/server/index';
import dotenv from 'dotenv';
import { getUserIdByOrderId } from '$lib/prisma/order/prendingOrder';
import { createSendcloudOrder } from '$lib/sendcloud/order';
import { createSendcloudLabel } from '$lib/sendcloud/label';
import { resetCart } from '$lib/store/Data/cartStore';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

function deduceWeightBracket(order: any): number {
	if (!order || !order.items || !Array.isArray(order.items)) {
		console.warn("⚠️ Impossible de calculer le poids : 'order.items' est invalide.");
		return 3; // Valeur par défaut pour éviter que tout crashe
	}

	// Calcul du poids total
	const totalWeight = order.items.reduce((acc: number, item: any) => {
		const productWeight = item.product?.weight ?? 0.124; // Poids par défaut si non défini
		const customExtra = item.custom?.length > 0 ? 0.666 : 0; // Poids supplémentaire si custom
		return acc + productWeight * item.quantity + customExtra;
	}, 0);

	// console.log(`⚖️ Poids total calculé : ${totalWeight.toFixed(2)} kg`);

	// Déterminer le bracket correspondant
	if (totalWeight <= 3) return 3;
	if (totalWeight <= 6) return 6;
	return 9;
}

/**
 * Récupère l'objet { id, name } directement depuis Sendcloud
 * en utilisant l'API des méthodes d'expédition
 */
async function getShippingMethodData(shippingOption: string, weightBracket: number, order: any) {
	console.log(`\n🔍 === RECHERCHE MÉTHODE D'EXPÉDITION DYNAMIQUE ===`);
	console.log(`📋 Paramètres:`, { shippingOption, weightBracket });
	
	console.log('🚀 Récupération des méthodes d\'expédition depuis Sendcloud...');
	
	try {
		// 1. Récupérer toutes les méthodes d'expédition disponibles
		const methodsResponse = await fetch('https://panel.sendcloud.sc/api/v2/shipping_methods', {
			method: 'GET',
			headers: {
				'Authorization': `Basic ${Buffer.from(`${process.env.SENDCLOUD_PUBLIC_KEY || ''}:${process.env.SENDCLOUD_SECRET_KEY || ''}`).toString('base64')}`,
				'Content-Type': 'application/json'
			}
		});

		if (!methodsResponse.ok) {
			throw new Error(`Sendcloud Methods API error: ${methodsResponse.status}`);
		}

		const methodsData = await methodsResponse.json();
		console.log('📥 Méthodes d\'expédition reçues:', methodsData.shipping_methods?.length || 0);

		// 2. Chercher la méthode correspondante au code de shipping option
		console.log('🔍 Recherche de la méthode correspondante au code:', shippingOption);
		
		// Extraire le code de base (ex: "ups:standard" depuis "ups:standard/live_rates,home_address_only")
		const baseCode = shippingOption.split('/')[0];
		console.log('🔍 Code de base extrait:', baseCode);

		// Chercher dans les méthodes d'expédition
		let matchingMethod = null;
		if (methodsData.shipping_methods && Array.isArray(methodsData.shipping_methods)) {
			// Log de quelques méthodes pour debug
			console.log('📋 Exemples de méthodes disponibles:', methodsData.shipping_methods.slice(0, 3).map(m => ({
				id: m.id,
				name: m.name,
				carrier: m.carrier
			})));

			// Chercher par nom ou code de transporteur
			matchingMethod = methodsData.shipping_methods.find((method: any) => {
				// Essayer de faire correspondre par nom ou transporteur
				const methodName = method.name?.toLowerCase() || '';
				const methodCarrier = method.carrier?.toLowerCase() || '';
				const optionCode = shippingOption.toLowerCase();
				const baseCodeLower = baseCode.toLowerCase();

				// Correspondance par transporteur (ex: "ups" dans "ups:standard")
				if (methodCarrier && baseCodeLower.includes(methodCarrier)) {
					return true;
				}

				// Correspondance par nom de méthode
				if (methodName && optionCode.includes(methodName.replace(/\s+/g, ''))) {
					return true;
				}

				return false;
			});
		}

		if (matchingMethod) {
			console.log('✅ Méthode trouvée dans Sendcloud:', {
				id: matchingMethod.id,
				name: matchingMethod.name,
				carrier: matchingMethod.carrier,
				min_weight: matchingMethod.min_weight,
				max_weight: matchingMethod.max_weight
			});
			
			// Créer un objet de méthode d'expédition avec l'ID réel de Sendcloud
			const dynamicMethod = {
				id: matchingMethod.id, // ID réel de Sendcloud !
				name: `${matchingMethod.carrier || 'Unknown'} - ${matchingMethod.name || 'Unknown'}`,
				length: weightBracket <= 3 ? 30 : weightBracket <= 6 ? 40 : 50,
				width: weightBracket <= 3 ? 20 : weightBracket <= 6 ? 30 : 30,
				height: weightBracket <= 3 ? 15 : weightBracket <= 6 ? 20 : 30,
				unit: 'cm',
				weight: weightBracket,
				weightUnit: 'kg',
				volume: weightBracket <= 3 ? 9000 : weightBracket <= 6 ? 24000 : 45000,
				volumeUnit: 'cm3'
			};
			
			console.log('🎯 Méthode d\'expédition dynamique créée avec ID Sendcloud:', dynamicMethod);
			return dynamicMethod;
		} else {
			console.log('❌ Aucune méthode correspondante trouvée');
			console.log('📋 Méthodes disponibles:', methodsData.shipping_methods?.map((m: any) => ({
				id: m.id,
				name: m.name,
				carrier: m.carrier
			})) || []);
			
			// Fallback avec ID temporaire
			const fallbackMethod = {
				id: Date.now(),
				name: `Méthode: ${shippingOption}`,
				length: weightBracket <= 3 ? 30 : weightBracket <= 6 ? 40 : 50,
				width: weightBracket <= 3 ? 20 : weightBracket <= 6 ? 30 : 30,
				height: weightBracket <= 3 ? 15 : weightBracket <= 6 ? 20 : 30,
				unit: 'cm',
				weight: weightBracket,
				weightUnit: 'kg',
				volume: weightBracket <= 3 ? 9000 : weightBracket <= 6 ? 24000 : 45000,
				volumeUnit: 'cm3'
			};
			
			console.log('⚠️ Utilisation de la méthode de fallback:', fallbackMethod);
			return fallbackMethod;
		}
		
	} catch (error) {
		console.error(`❌ Erreur lors de la récupération des méthodes d'expédition:`, error);
		
		// Fallback en cas d'erreur
		const fallbackMethod = {
			id: Date.now(),
			name: `Méthode: ${shippingOption}`,
			length: weightBracket <= 3 ? 30 : weightBracket <= 6 ? 40 : 50,
			width: weightBracket <= 3 ? 20 : weightBracket <= 6 ? 30 : 30,
			height: weightBracket <= 3 ? 15 : weightBracket <= 6 ? 20 : 30,
			unit: 'cm',
			weight: weightBracket,
			weightUnit: 'kg',
			volume: weightBracket <= 3 ? 9000 : weightBracket <= 6 ? 24000 : 45000,
			volumeUnit: 'cm3'
		};
		
		console.log('⚠️ Utilisation de la méthode de fallback après erreur:', fallbackMethod);
		return fallbackMethod;
	} finally {
		console.log('🏁 === FIN RECHERCHE MÉTHODE D\'EXPÉDITION DYNAMIQUE ===\n');
	}
}

/**
 * Génère un ID dynamique basé sur l'option de livraison et le bracket de poids
 */
function generateDynamicId(shippingOption: string, weightBracket: number) {
	// Hash simple pour générer un ID unique
	let hash = 0;
	for (let i = 0; i < shippingOption.length; i++) {
		const char = shippingOption.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash; // Convert to 32bit integer
	}
	return Math.abs(hash) + weightBracket * 1000;
}

export async function POST({ request }: { request: Request }) {
	const sig = request.headers.get('stripe-signature');
	const body = await request.text(); // Récupère le corps brut

	let event: Stripe.Event;

	try {
		event = stripe.webhooks.constructEvent(body, sig || '', process.env.STRIPE_WEBHOOK_SECRET || '');
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
			await handleCheckoutSession(session);
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
	console.log('👤 Récupération de l\'utilisateur pour la commande...');
	const user = await getUserIdByOrderId(orderId);
	if (!user || !user.userId) {
		console.error('❌ Utilisateur introuvable pour la commande:', orderId);
		return;
	}
	console.log('✅ Utilisateur trouvé:', { userId: user.userId });

	const userId = user.userId;

	let createdTransaction;

	try {
		console.log('💾 Début de la transaction Prisma...');
		// (1) ENREGISTREMENT EN DB via une transaction Prisma courte
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

			// Calcul du bracket de poids
			console.log('⚖️ Calcul du bracket de poids...');
			const weightBracket = deduceWeightBracket(order);
			console.log('📦 Bracket de poids calculé:', weightBracket);

			console.log('🔍 Récupération des données de méthode d\'expédition...');
			const shippingMethodData = await getShippingMethodData(order.shippingOption || '', weightBracket, order);
			console.log('📋 Données de méthode d\'expédition:', shippingMethodData);

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
				package_volume: shippingMethodData?.volume ?? (weightBracket <= 3 ? 9000 : weightBracket <= 6 ? 24000 : 45000), // Volume calculé si null
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
				products: order.items.map((item: any) => ({
					id: item.productId,
					name: item.product.name,
					price: item.product.price,
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

			console.log('✅ Transaction créée avec succès:', {
				id: newTx.id,
				stripePaymentId: newTx.stripePaymentId,
				amount: newTx.amount,
				status: newTx.status
			});

			return newTx;
		}, {
			timeout: 30000 // Augmenter le timeout à 30 secondes pour les appels API
		});
	} catch (error) {
		console.error(`❌ Échec de la création de la transaction pour la commande ${orderId}:`, error);
		return; // on arrête ici si l'enregistrement DB a échoué
	}

	console.log('🎉 Transaction en base créée avec succès:', createdTransaction?.id);

	// (2) APPEL A SENDCLOUD en dehors de la transaction
	if (createdTransaction && createdTransaction.status === 'paid') {
		console.log('📦 Début des appels Sendcloud...');
		
		try {
			console.log('🔄 Création de la commande Sendcloud...');
			await createSendcloudOrder(createdTransaction);
			console.log('✅ Commande Sendcloud créée avec succès');
		} catch (error) {
			console.error('❌ Erreur lors de la création de la commande Sendcloud:', error);
		}

		try {
			console.log('🏷️ Création de l\'étiquette Sendcloud...');
			await createSendcloudLabel(createdTransaction);
			console.log('✅ Étiquette Sendcloud créée avec succès');
		} catch (error) {
			console.error('❌ Erreur lors de la création de l\'étiquette Sendcloud:', error);
		}

		try {
			console.log('🛒 Réinitialisation du panier...');
			resetCart();
			console.log('✅ Panier réinitialisé');
		} catch (error) {
			console.error('❌ Erreur lors de la réinitialisation du panier:', error);
		}
	} else {
		console.log('⚠️ Statut de paiement non "paid", pas d\'appel Sendcloud. Statut:', createdTransaction?.status);
	}

	console.log('🏁 === FIN TRAITEMENT WEBHOOK CHECKOUT ===\n');
}