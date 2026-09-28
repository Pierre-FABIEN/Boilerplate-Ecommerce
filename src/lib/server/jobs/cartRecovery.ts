/**
 * Relance des paniers abandonnés — scan périodique (comme `cleanup.ts`), PAS
 * un job event-triggered façon `enqueueXJob` : ici personne n'enfile quoi que
 * ce soit après une action utilisateur, c'est le cron/QStash Schedule
 * (`scripts/register-cart-recovery-schedule.mjs`, route
 * `/api/jobs/cart-recovery`) qui rappelle régulièrement pour détecter les
 * `Order` `PENDING` à relancer.
 *
 * COMMERCE-PLUGIN : deux paliers indépendants, chacun avec son propre
 * horodatage d'envoi (`Order.cartReminder1SentAt`/`cartReminder2SentAt`) pour
 * ne jamais relancer deux fois le même palier sur la même commande. Le palier
 * 2 ne dépend pas d'avoir reçu le palier 1 (si le module a été activé entre
 * les deux, une commande de 24h+ doit quand même recevoir le palier 2).
 *
 * Le code promo envoyé est à usage unique (`usageLimit: 1`) et expire après
 * `PROMO_EXPIRY_DAYS` jours — largement avant `ABANDONED_ORDER_DAYS` (30j,
 * voir `cleanup.ts`) qui purge la commande elle-même : la relance ne doit
 * jamais courir après une commande déjà purgée.
 *
 * `StoreSettings.cartRecoveryEnabled` est vérifié ICI (pas par un appelant
 * webhook comme pour `loyalty.ts`) : ce job n'a pas d'autre déclencheur que
 * le cron, donc rien d'autre ne garde le flag en amont.
 */
import { randomBytes } from 'crypto';
import { prisma } from '$lib/server';
import { withLock } from '$lib/server/lock';
import { sendMail } from '$lib/server/smtp-mail';
import { log } from '$lib/server/log';
import { withDuration } from '$lib/server/metrics';
import { getStoreFeatureFlags } from '$lib/server/storeSettings';
import { resolveAppUrlOrDefault } from '$lib/server/app-url';

const REMINDER_1_HOURS = 1;
const REMINDER_2_HOURS = 24;
const PROMO_EXPIRY_DAYS = 7;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans caractères ambigus (0/O, 1/I/L)

export interface CartRecoveryResult {
	enabled: boolean;
	reminder1Sent: number;
	reminder2Sent: number;
	durationMs: number;
}

function randomSegment(length: number): string {
	const bytes = randomBytes(length);
	let segment = '';
	for (let i = 0; i < length; i++) {
		segment += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
	}
	return segment;
}

/** `RELANCE-XXXX-XXXX`, retire une collision improbable en retentant. */
async function generateUniqueRecoveryCode(): Promise<string> {
	for (let attempt = 0; attempt < 5; attempt++) {
		const code = `RELANCE-${randomSegment(4)}-${randomSegment(4)}`;
		const existing = await prisma.promoCode.findUnique({ where: { code } });
		if (!existing) return code;
	}
	throw new Error('Impossible de générer un code de relance unique après 5 tentatives.');
}

function checkoutUrl(): string {
	// Le panier PENDING de l'utilisateur est réattaché automatiquement à
	// chaque requête (`findPendingOrder` dans `hooks.server.ts`) : pas besoin
	// d'un lien/token spécial, `/checkout` suffit.
	return `${resolveAppUrlOrDefault()}/checkout`;
}

async function sendReminder(
	orderId: string,
	stage: 1 | 2,
	discountPercent: number
): Promise<boolean> {
	const lockKey = `cart-recovery:${orderId}:${stage}`;
	const sent = await withLock(lockKey, 60, async () => {
		const order = await prisma.order.findUnique({
			where: { id: orderId },
			select: {
				id: true,
				status: true,
				cartReminder1SentAt: true,
				cartReminder2SentAt: true,
				user: { select: { id: true, email: true, username: true } }
			}
		});
		if (!order || order.status !== 'PENDING') return false;
		const alreadySent = stage === 1 ? order.cartReminder1SentAt : order.cartReminder2SentAt;
		if (alreadySent) return false;
		if (!order.user) return false;

		const code = await generateUniqueRecoveryCode();
		const expiresAt = new Date(Date.now() + PROMO_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
		await prisma.promoCode.create({
			data: {
				code,
				type: 'PERCENTAGE',
				value: discountPercent,
				usageLimit: 1,
				expiresAt,
				active: true
			}
		});

		await sendMail({
			to: order.user.email,
			subject: 'Votre panier vous attend toujours 🛍️',
			text: `Bonjour, votre panier est toujours prêt. Profitez de ${discountPercent}% de réduction avec le code ${code} (valable ${PROMO_EXPIRY_DAYS} jours) en reprenant votre commande sur ${checkoutUrl()}.`,
			html: `<p>Bonjour,</p><p>Votre panier est toujours prêt. Profitez de <strong>${discountPercent}%</strong> de réduction avec le code <strong>${code}</strong> (valable ${PROMO_EXPIRY_DAYS} jours) en reprenant votre commande sur <a href="${checkoutUrl()}">${checkoutUrl()}</a>.</p>`
		});

		await prisma.order.update({
			where: { id: order.id },
			data: stage === 1 ? { cartReminder1SentAt: new Date() } : { cartReminder2SentAt: new Date() }
		});

		log('INFO', 'cart-recovery', `Relance panier envoyée (palier ${stage})`, {
			orderId: order.id,
			userId: order.user.id,
			discountPercent
		});
		return true;
	});
	return sent ?? false;
}

export async function runCartRecoveryJob(): Promise<CartRecoveryResult> {
	return withDuration('job.cart-recovery', async () => {
		const startedAt = Date.now();
		const { cartRecoveryEnabled } = await getStoreFeatureFlags();
		if (!cartRecoveryEnabled) {
			return {
				enabled: false,
				reminder1Sent: 0,
				reminder2Sent: 0,
				durationMs: Date.now() - startedAt
			};
		}

		const now = Date.now();
		const reminder1Before = new Date(now - REMINDER_1_HOURS * 60 * 60 * 1000);
		const reminder2Before = new Date(now - REMINDER_2_HOURS * 60 * 60 * 1000);

		try {
			const reminder1Candidates = await prisma.order.findMany({
				where: {
					status: 'PENDING',
					updatedAt: { lte: reminder1Before },
					cartReminder1SentAt: null,
					items: { some: {} }
				},
				select: { id: true }
			});

			let reminder1Sent = 0;
			// En parallèle (comme `stockAlerts.ts`) : chaque candidate a son propre
			// lock (`cart-recovery:<orderId>:1`), le pool de connexions Prisma borne
			// déjà la concurrence réelle côté DB.
			const reminder1Results = await Promise.allSettled(
				reminder1Candidates.map((candidate) => sendReminder(candidate.id, 1, 10))
			);
			for (const [index, result] of reminder1Results.entries()) {
				if (result.status === 'fulfilled') {
					if (result.value) reminder1Sent++;
				} else {
					log('ERROR', 'cart-recovery', 'Échec de la relance (palier 1) pour une commande', {
						orderId: reminder1Candidates[index].id,
						error: result.reason
					});
				}
			}

			// Requêté après le palier 1 (pas en parallèle) : une commande tout juste
			// relancée au palier 1 ne doit pas être comptée deux fois si elle est
			// aussi éligible au palier 2 dans la même exécution.
			const reminder2Candidates = await prisma.order.findMany({
				where: {
					status: 'PENDING',
					updatedAt: { lte: reminder2Before },
					cartReminder2SentAt: null,
					items: { some: {} }
				},
				select: { id: true }
			});

			let reminder2Sent = 0;
			const reminder2Results = await Promise.allSettled(
				reminder2Candidates.map((candidate) => sendReminder(candidate.id, 2, 15))
			);
			for (const [index, result] of reminder2Results.entries()) {
				if (result.status === 'fulfilled') {
					if (result.value) reminder2Sent++;
				} else {
					log('ERROR', 'cart-recovery', 'Échec de la relance (palier 2) pour une commande', {
						orderId: reminder2Candidates[index].id,
						error: result.reason
					});
				}
			}

			const result: CartRecoveryResult = {
				enabled: true,
				reminder1Sent,
				reminder2Sent,
				durationMs: Date.now() - startedAt
			};
			console.log('[cart-recovery] relances envoyées', result);
			return result;
		} catch (error) {
			console.error('[cart-recovery] échec de la relance', {
				durationMs: Date.now() - startedAt,
				error
			});
			throw error;
		}
	});
}
