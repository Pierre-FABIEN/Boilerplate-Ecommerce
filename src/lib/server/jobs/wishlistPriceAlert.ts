/**
 * Alerte wishlist (baisse de prix / vente flash), sortie du chemin
 * synchrone de l'édition admin (même mécanique que `stockAlerts.ts`),
 * déclenchée par `updateProductById` — seul point d'écriture de
 * `Product.price`/`flashSaleEndsAt` dans ce dépôt — dès qu'une baisse de
 * prix ou une nouvelle vente flash est constatée. Fait converger les
 * modules Wishlist et Vente flash, déjà en place mais qui ne se parlaient
 * pas jusqu'ici.
 *
 * Idempotence par valeur, pas par booléen : `WishlistItem.lastNotifiedPrice`/
 * `lastNotifiedFlashSaleEndsAt` retiennent la dernière valeur déjà notifiée
 * pour CE compte (baseline initialisée au prix/à l'état vente flash du
 * moment de l'ajout, voir `toggleWishlistItem`) — une alerte n'est envoyée
 * que si le prix courant repasse strictement sous cette baseline, ou si la
 * date de fin de vente flash a changé (nouvelle vente flash). Un retry
 * QStash sur la même valeur ne renvoie donc rien, mais une nouvelle baisse
 * ou une nouvelle vente flash redéclenche normalement une alerte.
 * `StoreSettings.wishlistPriceAlertEnabled` est vérifié par l'appelant avant
 * d'enfiler ce job, pas ici (même convention que `stockAlerts.ts`).
 */
import * as Sentry from '@sentry/sveltekit';
import { prisma } from '$lib/server';
import { withLock } from '$lib/server/lock';
import { sendMail } from '$lib/server/smtp-mail';
import { log } from '$lib/server/log';
import { withDuration } from '$lib/server/metrics';
import { resolveAppUrlOrDefault } from '$lib/server/app-url';
import {
	listWishlistItemsForProduct,
	markWishlistItemNotified
} from '$lib/prisma/wishlist/wishlist';

/**
 * L'email est déjà parti quand cette fonction est appelée (§2.2 de l'audit
 * fonctionnel) : un échec du marquage ne doit surtout pas être traité comme
 * un échec ordinaire (qui laisserait renvoyer le même email au prochain
 * passage du job) — on retente d'abord l'écriture, puis on abandonne en
 * dead-letter (log + Sentry) plutôt que de relancer l'erreur, pour ne pas
 * faire échouer tout le job (les autres items de la boucle doivent quand
 * même être traités).
 */
async function persistWishlistNotification(
	itemId: string,
	data: { price: number; flashSaleEndsAt: Date | null },
	attempts = 3
): Promise<boolean> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			await markWishlistItemNotified(itemId, data);
			return true;
		} catch (error) {
			lastError = error;
			log(
				'WARN',
				'wishlist-price-alert',
				`Échec marquage alerte envoyée (tentative ${attempt}/${attempts})`,
				{ itemId, error }
			);
			if (attempt < attempts) {
				await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
			}
		}
	}
	log(
		'ERROR',
		'wishlist-price-alert',
		`Marquage non persisté après ${attempts} tentatives (email déjà envoyé) — item ${itemId}`,
		{ error: lastError }
	);
	Sentry.captureException(lastError, {
		tags: { deadLetter: 'wishlist-price-alert-marker', itemId }
	});
	return false;
}

export async function runWishlistPriceAlertJob(productId: string): Promise<void> {
	await withDuration('job.wishlist-price-alert', () =>
		withLock(`wishlist-price-alert:${productId}`, 30, async () => {
			const product = await prisma.product.findUnique({
				where: { id: productId },
				select: { id: true, name: true, slug: true, price: true, flashSaleEndsAt: true }
			});
			if (!product) {
				log('WARN', 'wishlist-price-alert', `Produit introuvable: ${productId}`);
				return;
			}

			const items = await listWishlistItemsForProduct(productId);
			if (items.length === 0) return;

			const now = new Date();
			const flashSaleActive = product.flashSaleEndsAt !== null && product.flashSaleEndsAt > now;
			const productUrl = `${resolveAppUrlOrDefault()}/products/${product.slug}`;

			let sent = 0;
			for (const item of items) {
				const priceDropped =
					item.lastNotifiedPrice === null || product.price < item.lastNotifiedPrice;
				const flashSaleChanged =
					flashSaleActive &&
					(item.lastNotifiedFlashSaleEndsAt === null ||
						item.lastNotifiedFlashSaleEndsAt.getTime() !== product.flashSaleEndsAt!.getTime());

				if (!priceDropped && !flashSaleChanged) continue;

				const reasons: string[] = [];
				if (priceDropped) reasons.push(`nouveau prix : ${product.price} €`);
				if (flashSaleChanged) reasons.push('vente flash en cours');

				try {
					await sendMail({
						to: item.user.email,
						subject: `« ${product.name} » dans votre liste d'envies : ${flashSaleChanged ? 'vente flash !' : 'baisse de prix'}`,
						text: `« ${product.name} », dans votre liste d'envies : ${reasons.join(', ')}. Voir : ${productUrl}`,
						html: `<p><strong>${product.name}</strong>, dans votre liste d'envies : ${reasons.join(', ')}.</p><p><a href="${productUrl}">Voir le produit</a></p>`
					});
				} catch (error) {
					// Email jamais parti : rien à marquer, un futur passage du job
					// retentera normalement sur la même baseline.
					log('ERROR', 'wishlist-price-alert', 'Échec envoi alerte wishlist', {
						productId,
						itemId: item.id,
						error: error instanceof Error ? error.message : String(error)
					});
					continue;
				}

				const marked = await persistWishlistNotification(item.id, {
					price: product.price,
					flashSaleEndsAt: flashSaleActive ? product.flashSaleEndsAt : null
				});
				if (marked) sent++;
			}

			log('INFO', 'wishlist-price-alert', 'Alertes wishlist envoyées', {
				productId,
				sent,
				total: items.length
			});
		})
	);
}
