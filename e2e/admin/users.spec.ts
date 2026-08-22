import { test, expect } from '../support/fixtures';
import { waitForPath } from '../support/flows';
import { pageOrigin, signUpAndVerify } from '../support/admin';
import { deleteUser, getUser, occupyEmail, promoteToAdmin, requireUser } from '../support/db';

/**
 * CRUD des comptes dans l'admin : liste sans secrets, rôle, MFA, suppression.
 */
test.describe('Administration — utilisateurs', () => {
	test.setTimeout(6 * 60_000);

	test('liste, promotion, contraintes, MFA et suppression', async ({ page, account }) => {
		const targetEmail = `e2e-admin-cible-${Date.now()}@example.test`;
		const victimEmail = `e2e-admin-suppr-${Date.now()}@example.test`;

		await occupyEmail(targetEmail);
		await occupyEmail(victimEmail);
		const target = await requireUser(targetEmail);
		const victim = await requireUser(victimEmail);

		try {
			await signUpAndVerify(page, account);
			await promoteToAdmin(account.email);

			await test.step('1. La liste affiche les emails, sans secret', async () => {
				await page.goto('/admin/users');
				await waitForPath(page, '/admin/users');
				await expect(page.getByRole('heading', { name: 'Utilisateurs' })).toBeVisible();

				const search = page.getByPlaceholder('Cherchez dans le tableau');
				for (const email of [account.email, targetEmail, victimEmail]) {
					await search.fill(email);
					await expect(page.getByRole('cell', { name: email })).toBeVisible();
				}

				const html = await page.content();
				expect(html).not.toMatch(/\$argon2/i);
				expect(html).not.toContain('totpKey');
				expect(html).not.toContain('recoveryCode');
				expect(html).not.toContain('passwordHash');
			});

			await test.step('2. Promotion CLIENT → ADMIN', async () => {
				await page.goto(`/admin/users/${target.id}`);
				await expect(
					page.getByRole('heading', { name: 'Update User and Addresses' })
				).toBeVisible();

				await page.locator('[data-dropdown-menu-trigger]').click();
				await page.getByRole('menuitem', { name: 'ADMIN' }).click();
				await page.getByRole('button', { name: 'Save changes' }).click();
				await waitForPath(page, '/admin/users');

				expect((await requireUser(targetEmail)).role).toBe('ADMIN');
			});

			await test.step('3. Un rôle hors enum est refusé', async () => {
				const origin = pageOrigin(page);
				await page.request.post(`/admin/users/${victim.id}?/updateUserAndAddresses`, {
					form: {
						__superform_json: JSON.stringify(['', victim.id, 'SUPERUSER', false, '', []])
					},
					headers: { Origin: origin }
				});
				expect((await requireUser(victimEmail)).role).toBe('CLIENT');
			});

			await test.step('4. La MFA se bascule depuis la fiche', async () => {
				await page.goto(`/admin/users/${victim.id}`);
				await expect(
					page.getByRole('heading', { name: 'Update User and Addresses' })
				).toBeVisible();
				await page.locator('input[type="checkbox"]').check();
				await page.getByRole('button', { name: 'Save changes' }).click();
				await waitForPath(page, '/admin/users');
				expect((await requireUser(victimEmail)).isMfaEnabled).toBe(true);
			});

			await test.step('5. Suppression d’un CLIENT', async () => {
				await page.goto('/admin/users');
				await page.getByPlaceholder('Cherchez dans le tableau').fill(victimEmail);
				const row = page.locator('tr', { hasText: victimEmail });
				await row.locator('[data-alert-dialog-trigger]').click();
				await expect(page.getByRole('alertdialog')).toBeVisible();
				await Promise.all([
					page.waitForResponse(
						(response) =>
							response.url().includes('deleteUser') && response.request().method() === 'POST'
					),
					page.getByRole('alertdialog').getByRole('button', { name: 'Continue' }).click()
				]);
				await expect(page.getByRole('cell', { name: victimEmail })).toHaveCount(0, {
					timeout: 15_000
				});
				expect(await getUser(victimEmail)).toBeNull();
			});
		} finally {
			await deleteUser(targetEmail);
			await deleteUser(victimEmail);
		}
	});

	test('un CLIENT n’ouvre pas la fiche d’un autre compte', async ({ page, account }) => {
		const otherEmail = `e2e-admin-autre-${Date.now()}@example.test`;
		await occupyEmail(otherEmail);
		const other = await requireUser(otherEmail);

		try {
			await signUpAndVerify(page, account);
			await page.goto(`/admin/users/${other.id}`);
			await waitForPath(page, '/');
		} finally {
			await deleteUser(otherEmail);
		}
	});
});
