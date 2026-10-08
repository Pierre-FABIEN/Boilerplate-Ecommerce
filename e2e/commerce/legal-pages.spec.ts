import { test, expect } from '../support/fixtures';
import { pageOrigin, signUpAndVerify } from '../support/admin';
import {
	createCatalogProduct,
	createUserAddress,
	deleteCatalogProduct,
	getPendingOrder,
	requireUser
} from '../support/db';

/**
 * Pages légales (mentions légales, CGV, confidentialité) + case CGV
 * obligatoire au checkout — voir RESTE_A_FAIRE.md.
 */
test.describe('Pages légales', () => {
	test.setTimeout(6 * 60_000);

	test('les pages répondent, liées depuis le pied de page', async ({ page }) => {
		for (const path of ['/mentions-legales', '/cgv', '/cgu', '/confidentialite']) {
			const response = await page.goto(path);
			expect(response?.status()).toBe(200);
		}

		await page.goto('/');
		const footer = page.locator('footer');
		await expect(footer.getByRole('link', { name: 'Mentions légales' })).toHaveAttribute(
			'href',
			'/mentions-legales'
		);
		await expect(footer.getByRole('link', { name: 'CGV', exact: true })).toHaveAttribute(
			'href',
			'/cgv'
		);
		await expect(footer.getByRole('link', { name: 'CGU', exact: true })).toHaveAttribute(
			'href',
			'/cgu'
		);
		await expect(
			footer.getByRole('link', { name: 'Confidentialité', exact: true })
		).toHaveAttribute('href', '/confidentialite');
	});

	test('case CGV non cochée : checkout refusé côté serveur', async ({ page, account }) => {
		const created = await createCatalogProduct();
		const { product } = created;

		try {
			await signUpAndVerify(page, account);
			const user = await requireUser(account.email);
			const address = await createUserAddress(user.id);
			const origin = pageOrigin(page);

			await page.goto(`/products/${product.slug}`);
			const save = page.waitForResponse(
				(response) =>
					response.url().includes('/api/save-cart') && response.request().method() === 'POST'
			);
			await page.getByRole('button', { name: 'Ajouter au panier' }).click();
			await save;

			const pending = await getPendingOrder(user.id);
			expect(pending).not.toBeNull();

			const response = await page.request.post('/checkout?/checkout', {
				form: {
					orderId: pending!.id,
					shippingAddressId: address.id,
					billingAddressId: address.id,
					shippingOption: 'no_shipping',
					shippingCost: '0'
					// cgvAccepted volontairement absent
				},
				headers: { Origin: origin }
			});

			expect(response.status()).toBe(400);
		} finally {
			await deleteCatalogProduct(product.id);
		}
	});
});
