/**
 * Notification de réassort, sortie du chemin synchrone de l'édition admin
 * (même mécanique que `referral.ts`/`loyalty.ts`, mais déclenchée par
 * `updateProductById`, seul point d'écriture du stock dans ce dépôt, pas par
 * le webhook Stripe) : dès qu'un produit repasse au-dessus de 0 en stock,
 * chaque compte encore en attente (`StockAlert.notifiedAt` null) reçoit un
 * e-mail, une seule fois par passage en rupture — un compte qui se
 * réinscrit après une nouvelle rupture peut être notifié à nouveau
 * (`toggleStockAlertSubscription` remet `notifiedAt` à `null`).
 * `StoreSettings.stockAlertsEnabled` est vérifié par l'appelant avant
 * d'enfiler ce job, pas ici.
 */
import { prisma } from '$lib/server';
import { withLock } from '$lib/server/lock';
import { sendMail } from '$lib/server/smtp-mail';
import { log } from '$lib/server/log';
import { withDuration } from '$lib/server/metrics';
import { resolveAppUrlOrDefault } from '$lib/server/app-url';
import {
	listPendingStockAlerts,
	markStockAlertsNotified
} from '$lib/prisma/stockAlerts/stockAlerts';

export async function runStockAlertsJob(productId: string): Promise<void> {
	await withDuration('job.stock-alerts', () =>
		withLock(`stock-alerts:${productId}`, 30, async () => {
			const product = await prisma.product.findUnique({
				where: { id: productId },
				select: { id: true, name: true, slug: true, stock: true }
			});
			if (!product) {
				log('WARN', 'stock-alerts', `Produit introuvable: ${productId}`);
				return;
			}
			if (product.stock <= 0) {
				log('WARN', 'stock-alerts', `Stock encore à 0, notification ignorée: ${productId}`);
				return;
			}

			const pending = await listPendingStockAlerts(productId);
			if (pending.length === 0) return;

			const productUrl = `${resolveAppUrlOrDefault()}/products/${product.slug}`;
			const results = await Promise.allSettled(
				pending.map((alert) =>
					sendMail({
						to: alert.user.email,
						subject: `« ${product.name} » est de nouveau en stock`,
						text: `Bonne nouvelle : « ${product.name} » est de nouveau disponible. Commandez-le avant une nouvelle rupture : ${productUrl}`,
						html: `<p>Bonne nouvelle : <strong>${product.name}</strong> est de nouveau disponible.</p><p><a href="${productUrl}">Commander maintenant</a></p>`
					})
				)
			);

			const sentIds = pending
				.filter((_, index) => results[index].status === 'fulfilled')
				.map((alert) => alert.id);
			await markStockAlertsNotified(sentIds);

			log('INFO', 'stock-alerts', 'Réassort notifié', {
				productId,
				sent: sentIds.length,
				failed: pending.length - sentIds.length
			});
		})
	);
}
