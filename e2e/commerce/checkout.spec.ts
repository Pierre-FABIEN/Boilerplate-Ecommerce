import { test, expect } from '../support/fixtures';
import { waitForPath } from '../support/flows';
import { pageOrigin, signUpAndVerify } from '../support/admin';
import {
	createCatalogProduct,
	createUserAddress,
	deleteCatalogProduct,
	deleteUser,
	getOrderById,
	getPendingOrder,
	linkProductToOrder,
	occupyEmail,
	requireUser,
	simulatePaidOrder
} from '../support/db';

/**
 * Checkout : login, refus IDOR, commande payée.
 */
test.describe('Commerce — checkout', () => {
	test.setTimeout(6 * 60_000);

	test('anonyme renvoyé ; CLIENT refuse les IDOR ; paiement simulé', async ({ page, account }) => {
		await test.step('1. Anonyme GET /checkout', async () => {
			await page.goto('/checkout');
			await waitForPath(page, '/auth/login');
		});

		const created = await createCatalogProduct();
		const { product } = created;
		const victimEmail = `e2e-commerce-co-victim-${Date.now()}@example.test`;
		await occupyEmail(victimEmail);
		const victim = await requireUser(victimEmail);
		const foreign = await linkProductToOrder(victim.id, product.id);

		try {
			await signUpAndVerify(page, account);
			const user = await requireUser(account.email);
			const address = await createUserAddress(user.id);
			const origin = pageOrigin(page);

			await test.step('2. CLIENT avec panier', async () => {
				await page.goto(`/products/${product.slug}`);
				const save = page.waitForResponse(
					(response) =>
						response.url().includes('/api/save-cart') && response.request().method() === 'POST'
				);
				await page.getByRole('button', { name: 'Ajouter au panier' }).click();
				await save;

				await page.goto('/checkout');
				await waitForPath(page, '/checkout');
				await expect(page.getByText('Sélectionnez une adresse…')).toBeVisible();
			});

			await test.step('3. POST sans adresse / sans être proprio', async () => {
				const pending = await getPendingOrder(user.id);
				expect(pending).not.toBeNull();

				const missingAddress = await page.request.post('/checkout?/checkout', {
					form: {
						orderId: pending!.id,
						addressId: ''
					},
					headers: { Origin: origin }
				});
				expect(missingAddress.status()).toBe(400);

				const stolen = await page.request.post('/checkout?/checkout', {
					form: {
						orderId: foreign.order.id,
						addressId: address.id,
						shippingOption: 'no_shipping',
						shippingCost: '0'
					},
					headers: { Origin: origin }
				});
				expect(stolen.status()).toBe(403);
			});

			await test.step('4. Paiement simulé', async () => {
				const pending = await getPendingOrder(user.id);
				expect(pending).not.toBeNull();
				await simulatePaidOrder(pending!.id, user.id, account.email);
				const paid = await getOrderById(pending!.id);
				expect(paid?.status).toBe('PAID');
			});
		} finally {
			await deleteCatalogProduct(product.id);
			await deleteUser(victimEmail);
		}
	});
});
