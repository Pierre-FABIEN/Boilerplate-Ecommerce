import { prisma } from '$lib/server';
import { withLock } from '$lib/server/lock';
import { sendInvoiceEmail } from '$lib/server/invoice/email';
import { createSendcloudOrder } from '$lib/sendcloud/order';
import { createSendcloudLabel } from '$lib/sendcloud/label';

/**
 * Travail post-paiement : facture + Sendcloud, sorti du chemin synchrone du
 * webhook Stripe (`src/routes/api/webhooks/+server.ts`). Appelé soit
 * directement (repli sans QStash, `$lib/server/qstash.ts`), soit depuis
 * `src/routes/api/jobs/post-payment/+server.ts` via QStash — d'où le
 * rechargement de tout depuis la base par id : un job ne doit pas fermer sur
 * des objets en mémoire d'une requête HTTP déjà terminée.
 */

/** SENDCLOUD : pas d'appel réseau en e2e (`PUBLIC_ENV=test`) ni sans clés. */
export function shouldCallSendcloud(): boolean {
	if (process.env.PUBLIC_ENV === 'test') return false;
	const pub = process.env.SENDCLOUD_PUBLIC_KEY ?? '';
	const sec = process.env.SENDCLOUD_SECRET_KEY ?? '';
	return pub.length > 0 && sec.length > 0;
}

export function fallbackShippingMethod(shippingOption: string, weightBracket: number) {
	return {
		id: 9999,
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
}

export function deduceWeightBracket(order: any): number {
	if (!order || !order.items || !Array.isArray(order.items)) {
		console.warn("⚠️ Impossible de calculer le poids : 'order.items' est invalide.");
		return 3; // Valeur par défaut pour éviter que tout crashe
	}

	const totalWeight = order.items.reduce((acc: number, item: any) => {
		const productWeight = item.product?.weight ?? 0.124; // Poids par défaut si non défini
		const customExtra = item.custom?.length > 0 ? 0.666 : 0; // Poids supplémentaire si custom
		return acc + productWeight * item.quantity + customExtra;
	}, 0);

	if (totalWeight <= 3) return 3;
	if (totalWeight <= 6) return 6;
	return 9;
}

/**
 * Récupère l'objet { id, name } directement depuis Sendcloud en utilisant
 * l'API des méthodes d'expédition.
 */
export async function getShippingMethodData(
	shippingOption: string,
	weightBracket: number,
	order: any
) {
	if (!shouldCallSendcloud()) {
		return fallbackShippingMethod(shippingOption, weightBracket);
	}

	console.log(`\n🔍 === RECHERCHE MÉTHODE D'EXPÉDITION DYNAMIQUE ===`);
	console.log(`📋 Paramètres:`, { shippingOption, weightBracket });

	console.log("🚀 Récupération des méthodes d'expédition depuis Sendcloud...");

	try {
		const methodsResponse = await fetch('https://panel.sendcloud.sc/api/v2/shipping_methods', {
			method: 'GET',
			headers: {
				Authorization: `Basic ${Buffer.from(`${process.env.SENDCLOUD_PUBLIC_KEY || ''}:${process.env.SENDCLOUD_SECRET_KEY || ''}`).toString('base64')}`,
				'Content-Type': 'application/json'
			}
		});

		if (!methodsResponse.ok) {
			throw new Error(`Sendcloud Methods API error: ${methodsResponse.status}`);
		}

		const methodsData = await methodsResponse.json();
		console.log("📥 Méthodes d'expédition reçues:", methodsData.shipping_methods?.length || 0);

		console.log('🔍 Recherche de la méthode correspondante au code:', shippingOption);

		const baseCode = shippingOption.split('/')[0];
		console.log('🔍 Code de base extrait:', baseCode);

		let matchingMethod = null;
		if (methodsData.shipping_methods && Array.isArray(methodsData.shipping_methods)) {
			console.log(
				'📋 Exemples de méthodes disponibles:',
				methodsData.shipping_methods
					.slice(0, 3)
					.map((m: { id?: unknown; name?: unknown; carrier?: unknown }) => ({
						id: m.id,
						name: m.name,
						carrier: m.carrier
					}))
			);

			matchingMethod = methodsData.shipping_methods.find((method: any) => {
				const methodName = method.name?.toLowerCase() || '';
				const methodCarrier = method.carrier?.toLowerCase() || '';
				const optionCode = shippingOption.toLowerCase();
				const baseCodeLower = baseCode.toLowerCase();

				if (methodCarrier && baseCodeLower.includes(methodCarrier)) {
					return true;
				}

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

			console.log("🎯 Méthode d'expédition dynamique créée avec ID Sendcloud:", dynamicMethod);
			return dynamicMethod;
		}

		console.log('❌ Aucune méthode correspondante trouvée');
		console.log(
			'📋 Méthodes disponibles:',
			methodsData.shipping_methods?.map((m: any) => ({
				id: m.id,
				name: m.name,
				carrier: m.carrier
			})) || []
		);

		console.log('⚠️ Utilisation de la méthode de fallback');
		return fallbackShippingMethod(shippingOption, weightBracket);
	} catch (error) {
		console.error(`❌ Erreur lors de la récupération des méthodes d'expédition:`, error);

		console.log('⚠️ Utilisation de la méthode de fallback après erreur');
		return fallbackShippingMethod(shippingOption, weightBracket);
	} finally {
		console.log("🏁 === FIN RECHERCHE MÉTHODE D'EXPÉDITION DYNAMIQUE ===\n");
	}
}

/**
 * Facture + Sendcloud pour une transaction payée. Sous verrou distribué
 * (`post-payment:<id>`) : QStash peut relivrer le même message après un
 * échec partiel, et la commande/étiquette Sendcloud ont un coût réel — pas
 * question d'en recréer une seconde en double sur retry.
 *
 * Contrairement aux anciens `try/catch` qui avalaient toute erreur (un échec
 * Sendcloud/SMTP n'était donc jamais retenté), les erreurs remontent ici :
 * c'est ce qui déclenche le retry QStash côté appelant HTTP.
 */
export async function runPostPaymentJob(transactionId: string): Promise<void> {
	await withLock(`post-payment:${transactionId}`, 60, async () => {
		let transaction = await prisma.transaction.findUnique({ where: { id: transactionId } });
		if (!transaction) {
			console.error(`❌ Transaction introuvable pour le job post-paiement: ${transactionId}`);
			return;
		}

		if (transaction.status !== 'paid') {
			console.log(
				'⚠️ Statut de paiement non "paid", job post-paiement ignoré. Statut:',
				transaction.status
			);
			return;
		}

		await sendInvoiceEmail(transaction);

		if (!shouldCallSendcloud()) {
			console.log('📦 Sendcloud ignoré (PUBLIC_ENV=test ou clés absentes)');
			return;
		}

		console.log('📦 Début des appels Sendcloud...');

		const orderForShipping = transaction.orderId
			? await prisma.order.findUnique({
					where: { id: transaction.orderId },
					include: { items: { include: { product: true, custom: true } } }
				})
			: null;
		const weightBracket = deduceWeightBracket(orderForShipping);
		const shippingMethodData = await getShippingMethodData(
			transaction.shippingOption || '',
			weightBracket,
			orderForShipping
		);

		if (shippingMethodData?.id && shippingMethodData.id !== transaction.shippingMethodId) {
			transaction = await prisma.transaction.update({
				where: { id: transaction.id },
				data: {
					shippingMethodId: shippingMethodData.id,
					shippingMethodName: shippingMethodData.name,
					package_length: shippingMethodData.length,
					package_width: shippingMethodData.width,
					package_height: shippingMethodData.height,
					package_dimension_unit: shippingMethodData.unit,
					package_weight: shippingMethodData.weight,
					package_weight_unit: shippingMethodData.weightUnit,
					package_volume: shippingMethodData.volume,
					package_volume_unit: shippingMethodData.volumeUnit
				}
			});
		}

		if (!transaction.sendcloudOrderCreatedAt) {
			console.log('🔄 Création de la commande Sendcloud...');
			await createSendcloudOrder(transaction);
			transaction = await prisma.transaction.update({
				where: { id: transaction.id },
				data: { sendcloudOrderCreatedAt: new Date() }
			});
			console.log('✅ Commande Sendcloud créée avec succès');
		} else {
			console.log('ℹ️ Commande Sendcloud déjà créée, appel ignoré');
		}

		if (!transaction.sendcloudParcelId) {
			console.log("🏷️ Création de l'étiquette Sendcloud...");
			await createSendcloudLabel(transaction);
			console.log('✅ Étiquette Sendcloud créée avec succès');
		} else {
			console.log("ℹ️ Étiquette Sendcloud déjà créée, appel ignoré");
		}
	});
}
