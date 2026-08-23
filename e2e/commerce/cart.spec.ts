import { test, expect } from '../support/fixtures';
import { waitForPath } from '../support/flows';
import { pageOrigin, signUpAndVerify } from '../support/admin';
import {
	createCatalogProduct,
	deleteCatalogProduct,
	deleteUser,
	getPendingOrder,
	getProductById,
	linkProductToOrder,
	occupyEmail,
	requireUser
} from '../support/db';

/**
 * Panier : addToCart, IDOR save-cart, prix catalogue.
 */
test.describe('Commerce — panier', () => {
	test.setTimeout(6 * 60_000);

	test('ajouter au panier, IDOR et prix catalogue', async ({ page, account }) => {
		const created = await createCatalogProduct();
		const { product } = created;
		const victimEmail = `e2e-commerce-victim-${Date.now()}@example.test`;
		await occupyEmail(victimEmail);
		const victim = await requireUser(victimEmail);
		const foreign = await linkProductToOrder(victim.id, product.id);

		try {
			await signUpAndVerify(page, account);
			const origin = pageOrigin(page);

			await test.step('1. Fiche : ajouter au panier', async () => {
				await page.goto(`/products/${product.slug}`);
				await waitForPath(page, `/products/${product.slug}`);
				await expect(page.getByRole('heading', { name: product.name })).toBeVisible();

				const save = page.waitForResponse(
					(response) =>
						response.url().includes('/api/save-cart') && response.request().method() === 'POST'
				);
				await page.getByRole('button', { name: 'Ajouter au panier' }).click();
				const saveResponse = await save;
				expect(saveResponse.ok()).toBe(true);

				await page.locator('.cartButton button').first().click();
				await expect(page.getByRole('heading', { name: 'Votre panier' })).toBeVisible();
				await expect(page.getByText(product.name).first()).toBeVisible();

				const user = await requireUser(account.email);
				const pending = await getPendingOrder(user.id);
				expect(pending?.items.some((item) => item.productId === product.id)).toBe(true);
			});

			await test.step('2. /api/save-cart d’une autre commande', async () => {
				const response = await page.request.post('/api/save-cart', {
					headers: { Origin: origin, 'Content-Type': 'application/json' },
					data: JSON.stringify({
						id: foreign.order.id,
						items: []
					})
				});
				expect(response.status()).toBe(403);
				const still = await getPendingOrder(victim.id);
				expect(still?.items.length).toBeGreaterThan(0);
			});

			await test.step('3. Prix posté ≠ catalogue', async () => {
				const user = await requireUser(account.email);
				const pending = await getPendingOrder(user.id);
				expect(pending).not.toBeNull();
				const catalog = await getProductById(product.id);
				expect(catalog).not.toBeNull();

				const response = await page.request.post('/api/save-cart', {
					headers: { Origin: origin, 'Content-Type': 'application/json' },
					data: JSON.stringify({
						id: pending!.id,
						items: [
							{
								product: { id: product.id },
								quantity: 1,
								price: 0.01
							}
						]
					})
				});
				expect(response.ok()).toBe(true);

				const updated = await getPendingOrder(user.id);
				const line = updated?.items.find((item) => item.productId === product.id);
				expect(line?.price).toBe(catalog!.price);
				expect(line?.price).not.toBe(0.01);
			});
		} finally {
			await deleteCatalogProduct(product.id);
			await deleteUser(victimEmail);
		}
	});
});
