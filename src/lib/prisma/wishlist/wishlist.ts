/**
 * Accès Prisma à la liste d'envies.
 *
 * PRODUCT-PLUGIN : module activable, voir `StoreSettings.wishlistEnabled`
 * (`$lib/server/storeSettings.ts`) — chaque route appelante vérifie déjà le
 * flag avant d'arriver ici ; ce fichier ne le revérifie pas lui-même.
 */
import { prisma } from '$lib/server';
import { toNumber } from '$lib/server/decimal';
import { mapProductPrice } from '$lib/prisma/order/mapOrder';

export async function isInWishlist(userId: string, productId: string): Promise<boolean> {
	const item = await prisma.wishlistItem.findUnique({
		where: { userId_productId: { userId, productId } },
		select: { id: true }
	});
	return item !== null;
}

/** Ajoute ou retire le produit de la liste, et renvoie le nouvel état. */
export async function toggleWishlistItem(userId: string, productId: string): Promise<boolean> {
	const existing = await prisma.wishlistItem.findUnique({
		where: { userId_productId: { userId, productId } },
		select: { id: true }
	});

	if (existing) {
		await prisma.wishlistItem.delete({ where: { id: existing.id } });
		return false;
	}

	// Baseline pour `$lib/server/jobs/wishlistPriceAlert.ts` : le prix/l'état
	// vente flash au moment de l'ajout, pour ne détecter que ce qui change
	// *après* — pas de fausse alerte sur l'état déjà visible en s'inscrivant.
	const product = await prisma.product.findUnique({
		where: { id: productId },
		select: { price: true, flashSaleEndsAt: true }
	});
	await prisma.wishlistItem.create({
		data: {
			userId,
			productId,
			lastNotifiedPrice: product?.price ?? null,
			lastNotifiedFlashSaleEndsAt: product?.flashSaleEndsAt ?? null
		}
	});
	return true;
}

export async function listWishlistForUser(userId: string) {
	const items = await prisma.wishlistItem.findMany({
		where: { userId },
		include: { product: true },
		orderBy: { createdAt: 'desc' }
	});
	return items.map((item) => mapProductPrice(item.product));
}

/**
 * Wishlists contenant ce produit — lues par le job d'alerte prix/vente
 * flash (`$lib/server/jobs/wishlistPriceAlert.ts`), jamais par la vitrine.
 */
export async function listWishlistItemsForProduct(productId: string) {
	const items = await prisma.wishlistItem.findMany({
		where: { productId },
		select: {
			id: true,
			lastNotifiedPrice: true,
			lastNotifiedFlashSaleEndsAt: true,
			user: { select: { email: true } }
		}
	});
	return items.map((item) => ({ ...item, lastNotifiedPrice: toNumber(item.lastNotifiedPrice) }));
}

/** Marque l'alerte envoyée pour cette entrée : nouvelle baseline prix/vente flash. */
export async function markWishlistItemNotified(
	id: string,
	data: { price: number; flashSaleEndsAt: Date | null }
): Promise<void> {
	await prisma.wishlistItem.update({
		where: { id },
		data: { lastNotifiedPrice: data.price, lastNotifiedFlashSaleEndsAt: data.flashSaleEndsAt }
	});
}
