import { prisma } from '$lib/server';
import { withLock } from '$lib/server/lock';
import { createSendcloudOrder } from '$lib/sendcloud/order';
import { createSendcloudLabel } from '$lib/sendcloud/label';
import { log } from '$lib/server/log';
import { withCircuitBreaker } from '$lib/server/circuit-breaker';
import { recordJobAttempt, resetJobAttempts } from '$lib/server/job-attempts';
import { withDuration } from '$lib/server/metrics';
import { persistSendcloudMarker, SendcloudMarkerPersistError } from '$lib/server/sendcloud-marker';
import { mapTransaction } from '$lib/prisma/transaction/mapTransaction';
import * as Sentry from '@sentry/sveltekit';
import { Prisma } from '@prisma/client';
import { estimatePackage, type PackageEstimate } from '$lib/commerce/packageEstimate';

/** Au-delà, on arrête de retenter cette transaction (dead-letter) : voir `runPostPaymentJob`. */
const MAX_SENDCLOUD_ATTEMPTS = 5;

/**
 * Travail post-paiement : Sendcloud (commande + étiquette), sorti du chemin
 * synchrone du webhook Stripe (`src/routes/api/webhooks/+server.ts`). La
 * facture part dans son propre job (`$lib/server/jobs/invoice-email.ts`) —
 * les deux sont enqueue en parallèle, sans dépendance de l'un vers l'autre.
 * Appelé soit directement (repli sans QStash, `$lib/server/qstash.ts`), soit
 * depuis `src/routes/api/jobs/post-payment/+server.ts` via QStash — d'où le
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

export function fallbackShippingMethod(shippingOption: string, pkg: PackageEstimate) {
	return {
		id: 9999,
		name: `Méthode: ${shippingOption}`,
		length: pkg.lengthCm,
		width: pkg.widthCm,
		height: pkg.heightCm,
		unit: 'cm',
		weight: pkg.weightKg,
		weightUnit: 'kg',
		volume: pkg.lengthCm * pkg.widthCm * pkg.heightCm,
		volumeUnit: 'cm3'
	};
}

/**
 * Commande + items nécessaires à l'estimation de colis — sous-ensemble des
 * `include` réellement utilisés par les deux appelants (`runPostPaymentJob`
 * ci-dessous et le webhook Stripe synchrone), typé via Prisma plutôt qu'en
 * `any` : les deux appelants peuvent inclure davantage de relations, seule
 * la forme `items.product`/`items.custom` est exploitée ici.
 */
type OrderForPackageEstimate = Prisma.OrderGetPayload<{
	include: { items: { include: { product: true; custom: true } } };
}>;

/**
 * Estimation réelle du colis (poids + dimensions) à partir des produits de la
 * commande — même module que le devis checkout (`packageEstimate.ts`), pour
 * que le colis créé chez Sendcloud corresponde au devis affiché au client.
 */
export function derivePackageEstimate(order: OrderForPackageEstimate | null): PackageEstimate {
	if (!order || !order.items || !Array.isArray(order.items)) {
		log('WARN', 'post-payment', "Impossible d'estimer le colis : 'order.items' est invalide.");
		return estimatePackage([{ quantity: 1 }]);
	}

	return estimatePackage(
		order.items.map((item) => ({
			quantity: item.quantity,
			hasCustom: (item.custom?.length ?? 0) > 0,
			product: item.product
		}))
	);
}

/**
 * Dimensions/poids du colis pour l'étiquette Sendcloud v3.
 *
 * Avant la migration v3, cette fonction appelait `GET /api/v2/shipping_methods`
 * pour résoudre un ID numérique de méthode d'expédition, avec correspondance
 * approximative par sous-chaîne de nom de transporteur (fragile). En v3,
 * `createSendcloudLabel` (`$lib/sendcloud/label.ts`) envoie directement le
 * `shipping_option_code` choisi par le client au checkout
 * (`Transaction.shippingOption`) — plus besoin de résoudre quoi que ce soit
 * ici, ni d'appel réseau supplémentaire. Ne reste que l'estimation locale du
 * colis, déjà dérivée de `packageEstimate.ts`.
 */
export function derivePackageForShipping(shippingOption: string, pkg: PackageEstimate) {
	return fallbackShippingMethod(shippingOption, pkg);
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
	await withDuration('job.post-payment', () =>
		withLock(`post-payment:${transactionId}`, 60, async () => {
			let transaction = await prisma.transaction
				.findUnique({ where: { id: transactionId } })
				.then((t) => (t ? mapTransaction(t) : t));
			if (!transaction) {
				log(
					'ERROR',
					'post-payment',
					`Transaction introuvable pour le job post-paiement: ${transactionId}`
				);
				return;
			}

			if (transaction.status !== 'paid') {
				log(
					'WARN',
					'post-payment',
					'Statut de paiement non "paid", job post-paiement ignoré. Statut:',
					transaction.status
				);
				return;
			}

			if (!shouldCallSendcloud()) {
				log('DEBUG', 'post-payment', 'Sendcloud ignoré (PUBLIC_ENV=test ou clés absentes)');
				return;
			}

			const sendcloudAttemptsKey = `sendcloud:${transactionId}`;

			try {
				const orderForShipping = transaction.orderId
					? await prisma.order.findUnique({
							where: { id: transaction.orderId },
							include: { items: { include: { product: true, custom: true } } }
						})
					: null;
				const packageEstimate = derivePackageEstimate(orderForShipping);
				const shippingMethodData = derivePackageForShipping(
					transaction.shippingOption || '',
					packageEstimate
				);

				if (shippingMethodData?.id && shippingMethodData.id !== transaction.shippingMethodId) {
					const updated = await prisma.transaction.update({
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
					transaction = mapTransaction(updated);
				}

				if (!transaction.sendcloudOrderCreatedAt) {
					const transactionForOrder = transaction;
					await withCircuitBreaker('sendcloud', () => createSendcloudOrder(transactionForOrder));
					const updatedMarker = await persistSendcloudMarker('commande Sendcloud', () =>
						prisma.transaction.update({
							where: { id: transactionForOrder.id },
							data: { sendcloudOrderCreatedAt: new Date() }
						})
					);
					transaction = mapTransaction(updatedMarker);
				} else {
					log('DEBUG', 'post-payment', 'Commande Sendcloud déjà créée, appel ignoré');
				}

				if (!transaction.sendcloudParcelId) {
					const transactionForLabel = transaction;
					await withCircuitBreaker('sendcloud', () => createSendcloudLabel(transactionForLabel));
				} else {
					log('DEBUG', 'post-payment', 'Étiquette Sendcloud déjà créée, appel ignoré');
				}

				await resetJobAttempts(sendcloudAttemptsKey);
				log('INFO', 'post-payment', 'Job post-paiement terminé', { transactionId: transaction.id });
			} catch (error) {
				if (error instanceof SendcloudMarkerPersistError) {
					// L'appel Sendcloud a déjà réussi : retenter le job referait l'appel
					// réseau et doublerait la commande/étiquette. On abandonne sans
					// relancer (pas de retry QStash), la transaction reste identifiable
					// en base pour un retraitement manuel.
					log(
						'ERROR',
						'post-payment',
						`${error.message} — retraitement manuel requis pour la transaction ${transactionId}`
					);
					Sentry.captureException(error, {
						tags: { deadLetter: 'sendcloud-marker', transactionId }
					});
					return;
				}

				// Le disjoncteur (`$lib/server/circuit-breaker.ts`) protège Sendcloud
				// pendant une panne ; ce compteur protège QStash contre un retry sans
				// fin sur LA MÊME transaction une fois le disjoncteur refermé.
				const { attempt, exhausted } = await recordJobAttempt(
					sendcloudAttemptsKey,
					MAX_SENDCLOUD_ATTEMPTS
				);

				if (exhausted) {
					log(
						'ERROR',
						'post-payment',
						`Sendcloud abandonné après ${attempt} tentatives (dead-letter) pour la transaction ${transactionId}`,
						error
					);
					Sentry.captureException(error, {
						tags: { deadLetter: 'sendcloud', transactionId }
					});
					// Ne relance pas l'erreur : QStash arrêterait sinon de retenter, ce qui
					// est justement le but ici — la transaction reste identifiable en base
					// (sendcloudOrderCreatedAt/sendcloudParcelId absents) pour un
					// retraitement manuel ultérieur, sans marteler Sendcloud indéfiniment.
					return;
				}

				log(
					'WARN',
					'post-payment',
					`Échec Sendcloud (tentative ${attempt}/${MAX_SENDCLOUD_ATTEMPTS}), nouvel essai via retry QStash`,
					error
				);
				throw error;
			}
		})
	);
}
