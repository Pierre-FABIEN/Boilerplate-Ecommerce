import { test, expect } from '../support/fixtures';
import { requestSubmitForm, waitForPath } from '../support/flows';
import { signUpAndVerify } from '../support/admin';
import { hasLiveCloudinary } from '../support/third-party';
import {
	createCatalogCategory,
	deleteCatalogCategory,
	deleteCatalogProduct,
	getProductById,
	getProductByName,
	promoteToAdmin
} from '../support/db';

const PNG_1x1 = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64'
);

/**
 * Upload réel vers Cloudinary via le formulaire admin de création.
 */
test.describe('Administration — Cloudinary', () => {
	test.setTimeout(6 * 60_000);
	test.skip(!hasLiveCloudinary(), 'CLOUDINARY_* factices : pas d’upload réel');

	test('création UI avec image hébergée', async ({ page, account }) => {
		const category = await createCatalogCategory();
		const name = `e2e-cloudinary-${Date.now()}`;
		let productId: string | null = null;

		try {
			await signUpAndVerify(page, account);
			await promoteToAdmin(account.email);

			await test.step('1. Formulaire create + upload', async () => {
				await page.goto('/admin/products/create');
				await expect(page.getByText('Name', { exact: true })).toBeVisible();

				await page.locator('input[name="name"]').fill(name);
				await page.locator('input[name="price"]').fill('12.5');
				await page.locator('input[name="stock"]').fill('3');
				await page.locator('textarea[name="description"]').fill('Produit upload Cloudinary e2e.');
				await page.locator('input[name="colorProduct"]').fill('#112233');
				await page.getByText(category.name).click();
				await page.locator('input[name="images"]').setInputFiles({
					name: 'e2e.png',
					mimeType: 'image/png',
					buffer: PNG_1x1
				});

				await requestSubmitForm(page, '?/createProduct');
				await waitForPath(page, '/admin/products');
			});

			await test.step('2. L’image est une URL Cloudinary', async () => {
				const product = await getProductByName(name);
				expect(product).not.toBeNull();
				productId = product!.id;
				expect(product!.images.some((url) => url.includes('res.cloudinary.com'))).toBe(true);
				expect(await getProductById(product!.id)).not.toBeNull();
			});
		} finally {
			if (productId) await deleteCatalogProduct(productId);
			await deleteCatalogCategory(category.id);
		}
	});
});
