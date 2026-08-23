import { test, expect } from '../support/fixtures';
import { logIn, signOut, waitForPath } from '../support/flows';
import { signUpAndVerify } from '../support/admin';
import {
	createCatalogProduct,
	deleteCatalogProduct,
	getPendingOrder,
	requireUser
} from '../support/db';

const GUEST_CART_KEY = 'commerce:guest-cart';

async function addAnonymousProduct(page: import('@playwright/test').Page, slug: string, productId: string) {
	await page.goto(`/products/${slug}`);
	await waitForPath(page, `/products/${slug}`);
	await page.getByRole('button', { name: 'Ajouter au panier' }).click();
	await expect
		.poll(async () => (await page.evaluate((key) => localStorage.getItem(key), GUEST_CART_KEY)) ?? '')
		.toContain(productId);
}

/**
 * Panier invité : localStorage, fusion à l'inscription et à la connexion.
 */
test.describe('Commerce — panier invité', () => {
	test.setTimeout(6 * 60_000);

	test('anonyme : l’article survit au rechargement', async ({ page }) => {
		const created = await createCatalogProduct();
		const { product } = created;

		try {
			await test.step('1. Anonyme : ajouter puis recharger', async () => {
				await addAnonymousProduct(page, product.slug, product.id);
				await page.reload();
				await waitForPath(page, `/products/${product.slug}`);

				await page.locator('.cartButton button').first().click();
				await expect(page.getByRole('heading', { name: 'Votre panier' })).toBeVisible();
				await expect(page.getByText(product.name).first()).toBeVisible();
			});
		} finally {
			await deleteCatalogProduct(product.id);
		}
	});

	test('anonyme puis inscription : le panier est sur le compte', async ({ page, account }) => {
		const created = await createCatalogProduct();
		const { product } = created;

		try {
			await addAnonymousProduct(page, product.slug, product.id);

			await test.step('2. Anonyme puis inscription', async () => {
				await signUpAndVerify(page, account);
				const user = await requireUser(account.email);

				await expect
					.poll(async () => {
						const pending = await getPendingOrder(user.id);
						return pending?.items.some((item) => item.productId === product.id) ?? false;
					})
					.toBe(true);

				await expect
					.poll(async () => page.evaluate((key) => localStorage.getItem(key), GUEST_CART_KEY))
					.toBeNull();
			});
		} finally {
			await deleteCatalogProduct(product.id);
		}
	});

	test('login : fusion d’un produit compte et d’un produit invité', async ({ page, account }) => {
		const first = await createCatalogProduct({
			name: `e2e-guest-a-${Date.now()}`,
			slug: `e2e-guest-a-${Date.now()}`
		});
		const second = await createCatalogProduct({
			name: `e2e-guest-b-${Date.now()}`,
			slug: `e2e-guest-b-${Date.now()}`
		});

		try {
			await signUpAndVerify(page, account);

			await test.step('compte : premier produit', async () => {
				await page.goto(`/products/${first.product.slug}`);
				await waitForPath(page, `/products/${first.product.slug}`);
				const save = page.waitForResponse(
					(response) =>
						response.url().includes('/api/save-cart') && response.request().method() === 'POST'
				);
				await page.getByRole('button', { name: 'Ajouter au panier' }).click();
				expect((await save).ok()).toBe(true);
			});

			await signOut(page);

			await addAnonymousProduct(page, second.product.slug, second.product.id);

			await test.step('3. Compte + invité (autre produit)', async () => {
				await logIn(page, account.email, account.password);
				await page.waitForURL((url) => url.pathname.replace(/\/+$/, '') !== '/auth/login');
				const user = await requireUser(account.email);

				await expect
					.poll(async () => {
						const pending = await getPendingOrder(user.id);
						const ids = pending?.items.map((item) => item.productId) ?? [];
						return ids.includes(first.product.id) && ids.includes(second.product.id);
					})
					.toBe(true);
			});
		} finally {
			await deleteCatalogProduct(first.product.id);
			await deleteCatalogProduct(second.product.id);
		}
	});
});
