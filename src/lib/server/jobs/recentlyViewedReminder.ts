/**
 * Relance e-mail « produits consultés, jamais achetés » — scan périodique
 * (comme `cleanup.ts`/`cartRecovery.ts`/`reviewReminder.ts`), déclenché par
 * le cron/QStash Schedule
 * (`scripts/register-recently-viewed-reminder-schedule.mjs`, route
 * `/api/jobs/recently-viewed-reminder`), jamais event-triggered.
 *
 * Ne couvre que les comptes connectés : `ProductView` n'existe que pour un
 * visiteur identifié (voir `$lib/prisma/products/productViews.ts`), aucun
 * suivi anonyme dans ce projet (contrainte du panier invité,
 * `$lib/commerce/guestCart.ts`, 100 % localStorage). L'historique vitrine
 * « Récemment consultés » (`$lib/store/recentlyViewed.ts`) reste inchangé et
 * indépendant de ce job.
 *
 * Un seul e-mail digest par relance (jusqu'à `DIGEST_MAX_PRODUCTS` produits),
 * jamais un e-mail par produit — éviter de spammer un compte qui a consulté
 * plusieurs fiches. `reminderSentAt` posé une seule fois par ligne
 * `ProductView`, jamais réinitialisé — même logique que
 * `Order.reviewReminderSentAt`.
 */
import { prisma } from '$lib/server';
import { withLock } from '$lib/server/lock';
import { sendMail } from '$lib/server/smtp-mail';
import { log } from '$lib/server/log';
import { withDuration } from '$lib/server/metrics';
import { getStoreFeatureFlags } from '$lib/server/storeSettings';
import { resolveAppUrlOrDefault } from '$lib/server/app-url';

const VIEW_REMINDER_DELAY_HOURS = 24;
const DIGEST_MAX_PRODUCTS = 5;

export interface RecentlyViewedReminderResult {
	enabled: boolean;
	sent: number;
	durationMs: number;
}

function productUrl(slug: string): string {
	return `${resolveAppUrlOrDefault()}/products/${slug}`;
}

type Candidate = {
	id: string;
	productId: string;
	product: { name: string; slug: string };
};

/**
 * Produits déjà achetés par ce compte parmi `productIds` — écarte tout
 * `ProductView` correspondant du digest (même filtre `PAID`/`SHIPPED` que
 * `bundles.ts`, `userId` en plus).
 */
async function purchasedProductIds(userId: string, productIds: string[]): Promise<Set<string>> {
	if (productIds.length === 0) return new Set();
	const purchased = await prisma.orderItem.findMany({
		where: {
			productId: { in: productIds },
			order: { userId, status: { in: ['PAID', 'SHIPPED'] } }
		},
		select: { productId: true }
	});
	return new Set(purchased.map((item) => item.productId));
}

async function sendDigest(
	userId: string,
	email: string,
	candidates: Candidate[]
): Promise<boolean> {
	const lockKey = `recently-viewed-reminder:${userId}`;
	const sent = await withLock(lockKey, 60, async () => {
		// Re-vérifié sous verrou : un candidat a pu être acheté ou déjà relancé
		// entre la sélection initiale et l'exécution de ce lot.
		const ids = candidates.map((c) => c.id);
		const stillPending = await prisma.productView.findMany({
			where: { id: { in: ids }, reminderSentAt: null },
			select: { id: true, productId: true }
		});
		if (stillPending.length === 0) return false;

		const stillPendingIds = new Set(stillPending.map((v) => v.id));
		const pendingCandidates = candidates.filter((c) => stillPendingIds.has(c.id));

		const purchased = await purchasedProductIds(
			userId,
			pendingCandidates.map((c) => c.productId)
		);
		const toRemind = pendingCandidates.filter((c) => !purchased.has(c.productId));
		if (toRemind.length === 0) return false;

		const links = toRemind
			.map((c) => `- ${c.product.name} : ${productUrl(c.product.slug)}`)
			.join('\n');
		const linksHtml = toRemind
			.map(
				(c) =>
					`<li>${c.product.name} — <a href="${productUrl(c.product.slug)}">voir le produit</a></li>`
			)
			.join('');

		await sendMail({
			to: email,
			subject: 'Toujours envie de craquer ?',
			text: `Bonjour, vous avez récemment consulté ces produits sans les commander :\n${links}`,
			html: `<p>Bonjour,</p><p>Vous avez récemment consulté ces produits sans les commander :</p><ul>${linksHtml}</ul>`
		});

		await prisma.productView.updateMany({
			where: { id: { in: toRemind.map((c) => c.id) } },
			data: { reminderSentAt: new Date() }
		});

		log('INFO', 'recently-viewed-reminder', 'Relance envoyée', {
			userId,
			products: toRemind.length
		});
		return true;
	});
	return sent ?? false;
}

export async function runRecentlyViewedReminderJob(): Promise<RecentlyViewedReminderResult> {
	return withDuration('job.recently-viewed-reminder', async () => {
		const startedAt = Date.now();
		const { recentlyViewedReminderEnabled } = await getStoreFeatureFlags();
		if (!recentlyViewedReminderEnabled) {
			return { enabled: false, sent: 0, durationMs: Date.now() - startedAt };
		}

		const before = new Date(Date.now() - VIEW_REMINDER_DELAY_HOURS * 60 * 60 * 1000);

		try {
			const views = await prisma.productView.findMany({
				where: { reminderSentAt: null, viewedAt: { lte: before } },
				select: {
					id: true,
					userId: true,
					productId: true,
					viewedAt: true,
					user: { select: { id: true, email: true } },
					product: { select: { name: true, slug: true } }
				},
				orderBy: { viewedAt: 'desc' }
			});

			const byUser = new Map<string, { email: string; candidates: Candidate[] }>();
			for (const view of views) {
				if (!view.user) continue;
				const entry = byUser.get(view.userId) ?? { email: view.user.email, candidates: [] };
				if (entry.candidates.length < DIGEST_MAX_PRODUCTS) {
					entry.candidates.push({ id: view.id, productId: view.productId, product: view.product });
				}
				byUser.set(view.userId, entry);
			}

			let sent = 0;
			const entries = [...byUser.entries()];
			const results = await Promise.allSettled(
				entries.map(([userId, { email, candidates }]) => sendDigest(userId, email, candidates))
			);
			for (const [index, result] of results.entries()) {
				if (result.status === 'fulfilled') {
					if (result.value) sent++;
				} else {
					log('ERROR', 'recently-viewed-reminder', 'Échec de la relance pour un compte', {
						userId: entries[index][0],
						error: result.reason
					});
				}
			}

			const result: RecentlyViewedReminderResult = {
				enabled: true,
				sent,
				durationMs: Date.now() - startedAt
			};
			console.log('[recently-viewed-reminder] relances envoyées', result);
			return result;
		} catch (error) {
			console.error('[recently-viewed-reminder] échec de la relance', {
				durationMs: Date.now() - startedAt,
				error
			});
			throw error;
		}
	});
}
