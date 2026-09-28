/**
 * Relance avis produit post-livraison — scan périodique (comme
 * `cleanup.ts`/`cartRecovery.ts`), déclenché par le cron/QStash Schedule
 * (`scripts/register-review-reminder-schedule.mjs`, route
 * `/api/jobs/review-reminder`), jamais event-triggered : rien n'enfile ce
 * job après une action utilisateur.
 *
 * L'`OrderStatusHistory` n'est peuplé qu'en seed, jamais en production
 * (aucun code applicatif n'y écrit) : impossible de s'appuyer dessus pour
 * dater le passage en `SHIPPED`. Le webhook Sendcloud
 * (`src/routes/api/webhooks/sendcloud/+server.ts`) ne fait passer une
 * commande de `PAID` à `SHIPPED` qu'une seule fois — `Order.updatedAt` sert
 * donc de date de référence fiable, même trick que `cartRecovery.ts` avec
 * les commandes `PENDING`.
 *
 * Un seul rappel par commande (`reviewReminderSentAt`), jamais réinitialisé
 * — contrairement aux deux paliers de `cartReminder1/2SentAt`.
 * `StoreSettings.reviewReminderEnabled` est vérifié ICI, comme
 * `cartRecoveryEnabled` : ce job n'a pas d'autre déclencheur que le cron.
 */
import { prisma } from '$lib/server';
import { withLock } from '$lib/server/lock';
import { sendMail } from '$lib/server/smtp-mail';
import { log } from '$lib/server/log';
import { withDuration } from '$lib/server/metrics';
import { getStoreFeatureFlags } from '$lib/server/storeSettings';
import { resolveAppUrlOrDefault } from '$lib/server/app-url';

const REVIEW_REMINDER_DELAY_DAYS = 7;

export interface ReviewReminderResult {
	enabled: boolean;
	sent: number;
	durationMs: number;
}

function productReviewUrl(slug: string): string {
	return `${resolveAppUrlOrDefault()}/products/${slug}#reviews`;
}

async function sendReminder(orderId: string): Promise<boolean> {
	const lockKey = `review-reminder:${orderId}`;
	const sent = await withLock(lockKey, 60, async () => {
		const order = await prisma.order.findUnique({
			where: { id: orderId },
			select: {
				id: true,
				status: true,
				reviewReminderSentAt: true,
				user: { select: { id: true, email: true } },
				items: {
					select: { product: { select: { name: true, slug: true } } }
				}
			}
		});
		if (!order || order.status !== 'SHIPPED') return false;
		if (order.reviewReminderSentAt) return false;
		if (!order.user || order.items.length === 0) return false;

		const products = order.items.map((item) => item.product);
		const links = products
			.map((product) => `- ${product.name} : ${productReviewUrl(product.slug)}`)
			.join('\n');
		const linksHtml = products
			.map(
				(product) =>
					`<li>${product.name} — <a href="${productReviewUrl(product.slug)}">laisser un avis</a></li>`
			)
			.join('');

		await sendMail({
			to: order.user.email,
			subject: 'Que pensez-vous de votre commande ?',
			text: `Bonjour, votre commande vous a été livrée. Prenez un instant pour noter vos achats :\n${links}`,
			html: `<p>Bonjour,</p><p>Votre commande vous a été livrée. Prenez un instant pour noter vos achats :</p><ul>${linksHtml}</ul>`
		});

		await prisma.order.update({
			where: { id: order.id },
			data: { reviewReminderSentAt: new Date() }
		});

		log('INFO', 'review-reminder', 'Relance avis envoyée', {
			orderId: order.id,
			userId: order.user.id,
			products: products.length
		});
		return true;
	});
	return sent ?? false;
}

export async function runReviewReminderJob(): Promise<ReviewReminderResult> {
	return withDuration('job.review-reminder', async () => {
		const startedAt = Date.now();
		const { reviewReminderEnabled } = await getStoreFeatureFlags();
		if (!reviewReminderEnabled) {
			return { enabled: false, sent: 0, durationMs: Date.now() - startedAt };
		}

		const before = new Date(Date.now() - REVIEW_REMINDER_DELAY_DAYS * 24 * 60 * 60 * 1000);

		try {
			const candidates = await prisma.order.findMany({
				where: {
					status: 'SHIPPED',
					updatedAt: { lte: before },
					reviewReminderSentAt: null,
					items: { some: {} }
				},
				select: { id: true }
			});

			let sent = 0;
			// En parallèle (comme `stockAlerts.ts`) : chaque candidate a son propre
			// lock (`review-reminder:<orderId>`), le pool de connexions Prisma
			// borne déjà la concurrence réelle côté DB.
			const results = await Promise.allSettled(
				candidates.map((candidate) => sendReminder(candidate.id))
			);
			for (const [index, result] of results.entries()) {
				if (result.status === 'fulfilled') {
					if (result.value) sent++;
				} else {
					log('ERROR', 'review-reminder', 'Échec de la relance pour une commande', {
						orderId: candidates[index].id,
						error: result.reason
					});
				}
			}

			const result: ReviewReminderResult = {
				enabled: true,
				sent,
				durationMs: Date.now() - startedAt
			};
			console.log('[review-reminder] relances envoyées', result);
			return result;
		} catch (error) {
			console.error('[review-reminder] échec de la relance', {
				durationMs: Date.now() - startedAt,
				error
			});
			throw error;
		}
	});
}
