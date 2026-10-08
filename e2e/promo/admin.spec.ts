import { test, expect } from '../support/fixtures';
import { fillStable, waitForPath } from '../support/flows';
import { pageOrigin, signUpAndVerify } from '../support/admin';
import { promoAdminRow } from '../support/promo';
import {
	createPromoCode,
	deletePromoCode,
	deletePromoCodeByCode,
	findPromoCode,
	findPromoCodeByCode,
	promoteToAdmin
} from '../support/db';

/**
 * CRUD admin des codes promo : liste, édition, suppression, création, CLIENT.
 */
test.describe('Administration — codes promo', () => {
	test.setTimeout(6 * 60_000);

	test('liste, édition et suppression', async ({ page, account }) => {
		const stamp = Date.now().toString(36).toUpperCase();
		const editable = await createPromoCode(`E2EED${stamp}`, { value: 10 });
		const removable = await createPromoCode(`E2ERM${stamp}`, { value: 5, type: 'FIXED' });

		try {
			await signUpAndVerify(page, account);
			await promoteToAdmin(account.email);

			await test.step('1. La liste admin affiche les codes', async () => {
				await page.goto('/admin/promo', { waitUntil: 'domcontentloaded' });
				await waitForPath(page, '/admin/promo');
				await expect(page.getByRole('heading', { name: 'Gestion des codes promo' })).toBeVisible({
					timeout: 60_000
				});
				const search = page.getByPlaceholder('Cherchez dans le tableau').first();
				await search.fill(editable.code);
				await expect(promoAdminRow(page, editable.code)).toBeVisible();
			});

			await test.step('2. Édition de la valeur', async () => {
				await page.goto(`/admin/promo/${editable.id}`);
				await expect(page.getByRole('heading', { name: 'Modifier le code promo' })).toBeVisible();
				await page.locator('input[name="value"]').fill('15');
				await page.getByRole('button', { name: 'Enregistrer les modifications' }).click();
				await waitForPath(page, '/admin/promo');

				const updated = await findPromoCode(editable.id);
				expect(updated?.value).toBeCloseTo(15, 2);
			});

			await test.step('3. Suppression d’un code', async () => {
				await page.goto('/admin/promo');
				await page.getByPlaceholder('Cherchez dans le tableau').first().fill(removable.code);
				const row = promoAdminRow(page, removable.code);
				await row.locator('[data-alert-dialog-trigger]').click();
				await expect(page.getByRole('alertdialog')).toBeVisible();
				await Promise.all([
					page.waitForResponse(
						(response) =>
							response.url().includes('deletePromo') && response.request().method() === 'POST'
					),
					page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer' }).click()
				]);
				expect(await findPromoCode(removable.id)).toBeNull();
			});
		} finally {
			await deletePromoCode(editable.id);
			await deletePromoCode(removable.id);
		}
	});

	test('création via le formulaire admin', async ({ page, account }) => {
		const code = `E2ECR${Date.now().toString(36).toUpperCase()}`;

		try {
			await signUpAndVerify(page, account);
			await promoteToAdmin(account.email);

			await page.goto('/admin/promo/create', { waitUntil: 'domcontentloaded' });
			await expect(page.getByRole('heading', { name: 'Créer un code promo' })).toBeVisible();

			await fillStable(page.locator('input[name="code"]'), code);
			await page.locator('select[name="type"]').selectOption('PERCENTAGE');
			await fillStable(page.locator('input[name="value"]'), '15');

			await page.getByRole('button', { name: 'Créer le code promo' }).click();
			await waitForPath(page, '/admin/promo');

			const created = await findPromoCodeByCode(code);
			expect(created).not.toBeNull();
			expect(created?.type).toBe('PERCENTAGE');
			expect(created?.value).toBeCloseTo(15, 2);
			expect(created?.active).toBe(true);
		} finally {
			await deletePromoCodeByCode(code);
		}
	});

	test('un CLIENT ne peut pas supprimer un code promo', async ({ page, account }) => {
		const promo = await createPromoCode(`E2ECL${Date.now().toString(36).toUpperCase()}`);

		try {
			await signUpAndVerify(page, account);
			const origin = pageOrigin(page);
			await page.request.post('/admin/promo?/deletePromo', {
				form: { id: promo.id },
				headers: { Origin: origin }
			});
			expect(await findPromoCode(promo.id)).not.toBeNull();
		} finally {
			await deletePromoCode(promo.id);
		}
	});
});
