import { test, expect } from '../support/fixtures';
import { waitForPath } from '../support/flows';
import { createCatalogProduct, deleteCatalogProduct, getProductBySlug } from '../support/db';

/**
 * Vitrine publique Prisma : liste, fiche, 404. Pas de formulaires admin.
 */
test.describe('Catalogue — vitrine', () => {
	test('liste, fiche et slug inconnu', async ({ page }) => {
		const created = await createCatalogProduct();
		const { product, category } = created;

		try {
			await test.step('1. La liste affiche le nom Prisma', async () => {
				await page.goto('/products');
				await waitForPath(page, '/products');
				await expect(page.getByRole('heading', { name: 'Catalogue' })).toBeVisible();
				await expect(page.getByRole('heading', { name: product.name })).toBeVisible();
				await expect(page.getByRole('link', { name: category.name })).toBeVisible();
			});

			await test.step('2. La fiche s’ouvre par slug', async () => {
				await page.goto(`/products/${product.slug}`);
				await waitForPath(page, `/products/${product.slug}`);
				await expect(page.getByRole('heading', { name: product.name })).toBeVisible();
				await expect(page.getByText(`${product.price.toFixed(2)} €`)).toBeVisible();
				expect(await getProductBySlug(product.slug)).not.toBeNull();
			});

			await test.step('3. Un slug inconnu renvoie 404', async () => {
				const response = await page.goto('/products/e2e-slug-inconnu-absent');
				expect(response?.status()).toBe(404);
			});

			await test.step('4. Pas d’UI d’édition admin sur la vitrine', async () => {
				await page.goto('/products');
				const html = await page.content();
				expect(html).not.toContain('/admin/products');
				expect(html).not.toContain('passwordHash');
			});
		} finally {
			await deleteCatalogProduct(product.id);
		}
	});
});
