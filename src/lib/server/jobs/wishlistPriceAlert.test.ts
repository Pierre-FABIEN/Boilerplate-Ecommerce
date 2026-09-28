import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * §2.2 de l'audit fonctionnel : l'email de baisse de prix partait AVANT le
 * marquage (`WishlistItem.lastNotifiedPrice`), et un échec du marquage était
 * traité exactement comme un échec d'envoi — un futur passage du job
 * renvoyait alors le même email. Ce test prouve qu'un échec du marquage
 * (après un envoi réussi) ne fait pas planter le job (les autres items sont
 * quand même traités) et ne relance jamais `sendMail` pour ce même item dans
 * la même exécution.
 */

const sendMail = vi.fn().mockResolvedValue(undefined);
vi.mock('$lib/server/smtp-mail', () => ({ sendMail }));

const markWishlistItemNotified = vi.fn();
const listWishlistItemsForProduct = vi.fn();
vi.mock('$lib/prisma/wishlist/wishlist', () => ({
	listWishlistItemsForProduct: (...args: unknown[]) => listWishlistItemsForProduct(...args),
	markWishlistItemNotified: (...args: unknown[]) => markWishlistItemNotified(...args)
}));

const productFindUnique = vi.fn();
vi.mock('$lib/server', () => ({
	prisma: { product: { findUnique: productFindUnique } }
}));

const product = {
	id: 'prod_1',
	name: 'Bague test',
	slug: 'bague-test',
	price: 80,
	flashSaleEndsAt: null
};

const itemA = {
	id: 'item_a',
	lastNotifiedPrice: 100,
	lastNotifiedFlashSaleEndsAt: null,
	user: { email: 'a@example.test' }
};
const itemB = {
	id: 'item_b',
	lastNotifiedPrice: 100,
	lastNotifiedFlashSaleEndsAt: null,
	user: { email: 'b@example.test' }
};

describe('runWishlistPriceAlertJob — marquage après envoi (§2.2)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		productFindUnique.mockResolvedValue(product);
		listWishlistItemsForProduct.mockResolvedValue([itemA, itemB]);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("ne relance pas l'email si seul le marquage échoue, et traite les autres items", async () => {
		markWishlistItemNotified.mockImplementation((itemId: string) =>
			itemId === itemA.id ? Promise.reject(new Error('DB timeout')) : Promise.resolve(undefined)
		);

		const { runWishlistPriceAlertJob } = await import('./wishlistPriceAlert');
		await expect(runWishlistPriceAlertJob(product.id)).resolves.toBeUndefined();

		expect(sendMail).toHaveBeenCalledTimes(2);
		expect(markWishlistItemNotified).toHaveBeenCalledTimes(3 + 1); // itemA (3 tentatives) + itemB (1)
	});
});
