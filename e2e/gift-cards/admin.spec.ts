import { test, expect } from '../support/fixtures';
import { waitForPath } from '../support/flows';
import { pageOrigin, signUpAndVerify } from '../support/admin';
import { giftCardAdminRow } from '../support/giftCards';
import { createGiftCard, db, deleteGiftCard, getGiftCardById, promoteToAdmin } from '../support/db';

/**
 * CRUD admin des cartes cadeaux : liste, création (code généré), édition du
 * statut/de l'expiration, ajustement manuel du solde, suppression, CLIENT.
 */
test.describe('Administration — cartes cadeaux', () => {
	test.setTimeout(6 * 60_000);

	test('liste, édition, ajustement du solde et suppression', async ({ page, account }) => {
		const stamp = Date.now().toString(36).toUpperCase();
		const editable = await createGiftCard(`E2EED${stamp}`, { initialValue: 40 });
		const removable = await createGiftCard(`E2ERM${stamp}`, { initialValue: 20 });

		try {
			await signUpAndVerify(page, account);
			await promoteToAdmin(account.email);

			await test.step('1. La liste admin affiche les cartes', async () => {
				await page.goto('/admin/gift-cards', { waitUntil: 'domcontentloaded' });
				await waitForPath(page, '/admin/gift-cards');
				await expect(page.getByRole('heading', { name: 'Cartes cadeaux', level: 1 })).toBeVisible({
					timeout: 60_000
				});
				const search = page.getByPlaceholder('Cherchez dans le tableau').first();
				await search.fill(editable.code);
				await expect(giftCardAdminRow(page, editable.code)).toBeVisible();
			});

			await test.step('2. Désactivation depuis la fiche', async () => {
				await page.goto(`/admin/gift-cards/${editable.id}`);
				await expect(page.getByRole('heading', { name: editable.code })).toBeVisible();
				await page.locator('#active').click();
				await page.getByRole('button', { name: 'Enregistrer' }).click();
				await expect(page.getByText('Carte cadeau mise à jour avec succès')).toBeVisible();

				const updated = await getGiftCardById(editable.id);
				expect(updated?.active).toBe(false);
			});

			await test.step('3. Ajustement manuel du solde (SAV)', async () => {
				await page.locator('input[name="balance"]').fill('12.5');
				await page.getByRole('button', { name: 'Ajuster' }).click();
				await expect(page.getByText('Solde ajusté avec succès')).toBeVisible();

				const updated = await getGiftCardById(editable.id);
				expect(updated?.balance).toBeCloseTo(12.5, 2);
				// L'ajustement ne touche jamais la valeur d'émission.
				expect(updated?.initialValue).toBeCloseTo(40, 2);
			});

			await test.step('4. Suppression d’une carte', async () => {
				await page.goto('/admin/gift-cards');
				await page.getByPlaceholder('Cherchez dans le tableau').first().fill(removable.code);
				const row = giftCardAdminRow(page, removable.code);
				await row.locator('[data-alert-dialog-trigger]').click();
				await expect(page.getByRole('alertdialog')).toBeVisible();
				await Promise.all([
					page.waitForResponse(
						(response) =>
							response.url().includes('deleteGiftCard') && response.request().method() === 'POST'
					),
					page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer' }).click()
				]);
				expect(await getGiftCardById(removable.id)).toBeNull();
			});
		} finally {
			await deleteGiftCard(editable.id);
			await deleteGiftCard(removable.id);
		}
	});

	test('création : le code est généré et affiché', async ({ page, account }) => {
		let createdId: string | undefined;
		try {
			await signUpAndVerify(page, account);
			await promoteToAdmin(account.email);

			await page.goto('/admin/gift-cards/create');
			await page.locator('input[name="initialValue"]').fill('75');
			await page.getByRole('button', { name: 'Créer la carte cadeau' }).click();

			await expect(page.getByText('Carte cadeau créée avec succès')).toBeVisible();
			const codeLocator = page.locator('p.font-mono');
			await expect(codeLocator).toBeVisible();
			const code = (await codeLocator.textContent())?.trim();
			expect(code).toMatch(/^GIFT-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

			const created = await db.giftCard.findUnique({ where: { code } });
			createdId = created?.id;
			expect(created?.initialValue).toBeCloseTo(75, 2);
			expect(created?.balance).toBeCloseTo(75, 2);
		} finally {
			if (createdId) await deleteGiftCard(createdId);
		}
	});

	test('un CLIENT ne peut pas supprimer une carte cadeau', async ({ page, account }) => {
		const giftCard = await createGiftCard(`E2ECL${Date.now().toString(36).toUpperCase()}`);

		try {
			await signUpAndVerify(page, account);
			const origin = pageOrigin(page);
			await page.request.post('/admin/gift-cards?/deleteGiftCard', {
				form: { id: giftCard.id },
				headers: { Origin: origin }
			});
			expect(await getGiftCardById(giftCard.id)).not.toBeNull();
		} finally {
			await deleteGiftCard(giftCard.id);
		}
	});
});
