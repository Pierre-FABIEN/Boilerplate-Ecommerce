import { test, expect } from '../support/fixtures';
import { waitForPath } from '../support/flows';
import { pageOrigin, signUpAndVerify } from '../support/admin';
import { productAdminRow } from '../support/products';
import {
	createCatalogProduct,
	deleteCatalogProduct,
	deleteUser,
	getProductById,
	linkProductToOrder,
	occupyEmail,
	promoteToAdmin,
	requireUser
} from '../support/db';

/**
 * CRUD admin des produits : liste, édition, suppression, contrainte FK, CLIENT.
 *
 * La création passe par Prisma : `.env.test` n'a pas de Cloudinary réel, et le
 * schéma impose une image à l'upload UI.
 */
test.describe('Administration — produits', () => {
	test.setTimeout(6 * 60_000);

	test('liste, édition, suppression et refus', async ({ page, account }) => {
		const editable = await createCatalogProduct();
		const removable = await createCatalogProduct();
		const locked = await createCatalogProduct();
		const ownerEmail = `e2e-product-owner-${Date.now()}@example.test`;

		await occupyEmail(ownerEmail);
		const owner = await requireUser(ownerEmail);
		await linkProductToOrder(owner.id, locked.product.id);

		try {
			await signUpAndVerify(page, account);
			await promoteToAdmin(account.email);

			await test.step('1. La liste admin affiche les produits', async () => {
				await page.goto('/admin/products');
				await waitForPath(page, '/admin/products');
				await expect(page.getByRole('heading', { name: 'Gestion produits' })).toBeVisible();
				const search = page.getByPlaceholder('Cherchez dans le tableau').first();
				await search.fill(editable.product.name);
				// Le nom est aussi dans l'`alt` de la miniature : on cible la ligne, pas la cellule.
				await expect(productAdminRow(page, editable.product.name)).toBeVisible();
			});

			await test.step('2. Création Prisma visible sur la vitrine', async () => {
				await page.goto('/products');
				await expect(page.getByRole('heading', { name: editable.product.name })).toBeVisible();
				expect(await getProductById(editable.product.id)).not.toBeNull();
			});

			await test.step('3. Édition prix et stock', async () => {
				await page.goto(`/admin/products/${editable.product.id}`);
				await expect(page.getByText('Price', { exact: true })).toBeVisible();
				await page.locator('input[name="price"]').fill('9.99');
				await page.locator('input[name="stock"]').fill('7');
				await page.getByRole('button', { name: 'Save changes' }).click();
				await waitForPath(page, '/admin/products');

				const updated = await getProductById(editable.product.id);
				expect(updated?.price).toBeCloseTo(9.99, 2);
				expect(updated?.stock).toBe(7);

				await page.goto(`/products/${editable.product.slug}`);
				await expect(page.getByText('9.99 €')).toBeVisible();
				await expect(page.getByText('Stock : 7')).toBeVisible();
			});

			await test.step('4. Suppression d’un produit sans commande', async () => {
				await page.goto('/admin/products');
				await page.getByPlaceholder('Cherchez dans le tableau').first().fill(removable.product.name);
				const row = productAdminRow(page, removable.product.name);
				await row.locator('[data-alert-dialog-trigger]').click();
				await expect(page.getByRole('alertdialog')).toBeVisible();
				await Promise.all([
					page.waitForResponse(
						(response) =>
							response.url().includes('deleteProduct') && response.request().method() === 'POST'
					),
					page.getByRole('alertdialog').getByRole('button', { name: 'Continue' }).click()
				]);
				expect(await getProductById(removable.product.id)).toBeNull();
			});

			await test.step('5. Un produit commandé est refusé à la suppression', async () => {
				await page.goto('/admin/products');
				await page.getByPlaceholder('Cherchez dans le tableau').first().fill(locked.product.name);
				const row = productAdminRow(page, locked.product.name);
				await row.locator('[data-alert-dialog-trigger]').click();
				await expect(page.getByRole('alertdialog')).toBeVisible();
				await Promise.all([
					page.waitForResponse(
						(response) =>
							response.url().includes('deleteProduct') && response.request().method() === 'POST'
					),
					page.getByRole('alertdialog').getByRole('button', { name: 'Continue' }).click()
				]);
				expect(await getProductById(locked.product.id)).not.toBeNull();
			});
		} finally {
			await deleteCatalogProduct(editable.product.id);
			await deleteCatalogProduct(removable.product.id);
			await deleteCatalogProduct(locked.product.id);
			await deleteUser(ownerEmail);
		}
	});

	test('un CLIENT ne peut pas supprimer un produit', async ({ page, account }) => {
		const created = await createCatalogProduct();

		try {
			await signUpAndVerify(page, account);
			const origin = pageOrigin(page);
			await page.request.post('/admin/products?/deleteProduct', {
				form: { id: created.product.id },
				headers: { Origin: origin }
			});
			expect(await getProductById(created.product.id)).not.toBeNull();
		} finally {
			await deleteCatalogProduct(created.product.id);
		}
	});
});
