import { test, expect } from '../support/fixtures';
import { waitForPath, waitForAppReady } from '../support/flows';
import { pageOrigin, signUpAndVerify } from '../support/admin';
import { taxonomyAdminRow } from '../support/products';
import {
	createCatalogProduct,
	createTaxonomy,
	createTaxonomyValue,
	deleteCatalogProduct,
	deleteTaxonomy,
	getProductById,
	getTaxonomyByName,
	getTaxonomyById,
	getTaxonomyValueById,
	promoteToAdmin
} from '../support/db';

/**
 * Taxonomie générique : CRUD admin (taxonomie + valeur), association à un
 * produit via `TaxonomyValuePicker`, filtre catalogue par slug et suppression
 * en cascade (`onDelete: Cascade`, contrairement à l'ancienne « Matière » qui
 * se contentait de `SetNull` sur `Product.materialId`).
 */
test.describe('Administration — taxonomies', () => {
	test.setTimeout(6 * 60_000);

	test('création, association, filtre, renommage et suppression en cascade', async ({
		page,
		account
	}) => {
		const created = await createCatalogProduct();
		const taxonomyName = `e2e-taxonomy-${Date.now()}`;
		const valueName = `e2e-value-${Date.now()}`;
		const renamedValueName = `${valueName}-renomme`;
		let taxonomyId: string | null = null;

		try {
			await signUpAndVerify(page, account);
			await promoteToAdmin(account.email);

			await test.step('1. Création de la taxonomie depuis /admin/products/taxonomies/create', async () => {
				await page.goto('/admin/products/taxonomies/create', { waitUntil: 'domcontentloaded' });
				const nameInput = page.locator('input[name="name"]');
				await expect(nameInput).toBeVisible({ timeout: 60_000 });
				await waitForAppReady(page);
				await nameInput.fill(taxonomyName);
				await page.getByRole('button', { name: 'Save changes' }).click();
				await waitForPath(page, '/admin/products');
				await expect(taxonomyAdminRow(page, taxonomyName)).toBeVisible();

				const taxonomy = await getTaxonomyByName(taxonomyName);
				expect(taxonomy).not.toBeNull();
				taxonomyId = taxonomy!.id;
			});

			await test.step('2. Création d\u2019une valeur pour cette taxonomie', async () => {
				await page.goto(`/admin/products/taxonomies/${taxonomyId}/values/create`, {
					waitUntil: 'domcontentloaded'
				});
				const valueInput = page.locator('input[name="value"]');
				await expect(valueInput).toBeVisible({ timeout: 60_000 });
				await waitForAppReady(page);
				await valueInput.fill(valueName);
				await page.getByRole('button', { name: 'Save changes' }).click();
				await waitForPath(page, `/admin/products/taxonomies/${taxonomyId}`);
				// La Table admin duplique le rendu desktop (colonnes valeur+libellé) et
				// mobile (cartes), d'où `.first()`.
				await expect(page.getByText(valueName, { exact: true }).first()).toBeVisible();
			});

			await test.step('3. Association à un produit depuis la fiche admin', async () => {
				await page.goto(`/admin/products/${created.product.id}`, { waitUntil: 'domcontentloaded' });
				const valueLabel = page.getByText(valueName, { exact: true }).first();
				await expect(valueLabel).toBeVisible({ timeout: 60_000 });
				await waitForAppReady(page);
				await valueLabel.click();
				await Promise.all([
					page.waitForResponse(
						(response) =>
							response.url().includes('?/updateProduct') && response.request().method() === 'POST'
					),
					page.getByRole('button', { name: 'Save changes' }).click()
				]);

				const updated = await getProductById(created.product.id);
				expect(updated?.taxonomyValues.some((tv) => tv.taxonomyValue.value === valueName)).toBe(
					true
				);
			});

			await test.step('4. Filtre catalogue par taxonomie', async () => {
				const taxonomy = await getTaxonomyById(taxonomyId!);
				await page.goto(`/products?${taxonomy!.slug}=${encodeURIComponent(valueName)}`);
				await expect(page.getByRole('heading', { name: created.product.name })).toBeVisible();

				await page.goto(`/products?${taxonomy!.slug}=placeholder-inexistant`);
				await expect(page.getByRole('heading', { name: created.product.name })).not.toBeVisible();
			});

			await test.step('5. Renommage de la valeur', async () => {
				await page.goto(`/admin/products/taxonomies/${taxonomyId}`, {
					waitUntil: 'domcontentloaded'
				});
				const valueRow = page.locator('tbody tr', { hasText: valueName });
				await expect(valueRow).toBeVisible({ timeout: 60_000 });
				await waitForAppReady(page);
				await valueRow.getByRole('link', { name: 'edit' }).click();
				const renameInput = page.locator('input[name="value"]');
				await expect(renameInput).toBeVisible({ timeout: 60_000 });
				await waitForAppReady(page);
				await renameInput.fill(renamedValueName);
				// L'action `updateTaxonomyValue` reste sur la page (pas de redirect) :
				// on attend le toast de succès plutôt qu'un changement d'URL.
				await page.getByRole('button', { name: 'Save changes' }).click();
				await expect(page.getByText('Valeur mise à jour')).toBeVisible({ timeout: 60_000 });

				await page.goto(`/admin/products/taxonomies/${taxonomyId}`, {
					waitUntil: 'domcontentloaded'
				});
				await expect(page.getByText(renamedValueName, { exact: true }).first()).toBeVisible({
					timeout: 60_000
				});
			});

			await test.step('6. Suppression de la taxonomie : cascade sur la valeur et le produit', async () => {
				await page.goto('/admin/products');
				await expect(taxonomyAdminRow(page, taxonomyName)).toBeVisible({ timeout: 60_000 });
				await waitForAppReady(page);
				await taxonomyAdminRow(page, taxonomyName).locator('[data-alert-dialog-trigger]').click();
				await expect(page.getByRole('alertdialog')).toBeVisible();
				await Promise.all([
					page.waitForResponse(
						(response) =>
							response.url().includes('?/deleteTaxonomy') && response.request().method() === 'POST'
					),
					page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer' }).click()
				]);

				expect(await getTaxonomyById(taxonomyId!)).toBeNull();
				const productAfterDelete = await getProductById(created.product.id);
				expect(
					productAfterDelete?.taxonomyValues.some((tv) => tv.taxonomyValue.value === valueName)
				).toBe(false);
				taxonomyId = null;
			});
		} finally {
			await deleteCatalogProduct(created.product.id);
			if (taxonomyId) await deleteTaxonomy(taxonomyId);
		}
	});

	test('un CLIENT ne peut pas créer de taxonomie', async ({ page, account }) => {
		const taxonomyName = `e2e-taxonomy-client-${Date.now()}`;

		await signUpAndVerify(page, account);
		const origin = pageOrigin(page);
		await page.request.post('/admin/products/taxonomies/create?/createTaxonomy', {
			form: { name: taxonomyName, slug: `e2e-taxonomy-client-${Date.now()}`, type: 'TEXT' },
			headers: { Origin: origin }
		});
		expect(await getTaxonomyByName(taxonomyName)).toBeNull();
	});

	test('suppression explicite d\u2019une valeur (?/deleteTaxonomyValue), la taxonomie et les autres valeurs survivent', async ({
		page,
		account
	}) => {
		const taxonomy = await createTaxonomy();
		const kept = await createTaxonomyValue(taxonomy.id, { value: `e2e-value-kept-${Date.now()}` });
		const removed = await createTaxonomyValue(taxonomy.id, {
			value: `e2e-value-removed-${Date.now()}`
		});

		try {
			await signUpAndVerify(page, account);
			await promoteToAdmin(account.email);

			await page.goto(`/admin/products/taxonomies/${taxonomy.id}`, {
				waitUntil: 'domcontentloaded'
			});
			await expect(page.getByText(removed.value, { exact: true }).first()).toBeVisible({
				timeout: 60_000
			});

			const row = page.locator('tbody tr', { hasText: removed.value });
			await row.locator('[data-alert-dialog-trigger]').click();
			await expect(page.getByRole('alertdialog')).toBeVisible();
			await Promise.all([
				page.waitForResponse(
					(response) =>
						response.url().includes('?/deleteTaxonomyValue') &&
						response.request().method() === 'POST'
				),
				page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer' }).click()
			]);

			expect(await getTaxonomyValueById(removed.id)).toBeNull();
			expect(await getTaxonomyValueById(kept.id)).not.toBeNull();
			expect(await getTaxonomyById(taxonomy.id)).not.toBeNull();
		} finally {
			await deleteTaxonomy(taxonomy.id);
		}
	});
});
