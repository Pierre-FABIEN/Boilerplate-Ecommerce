import { test, expect } from '../support/fixtures';
import { waitForPath } from '../support/flows';
import { pageOrigin, signUpAndVerify } from '../support/admin';
import {
	countSessions,
	createCatalogProduct,
	createRawSession,
	deleteCatalogProduct,
	deleteUser,
	getOrderById,
	getTransactionById,
	getUser,
	linkProductToOrder,
	occupyEmail,
	promoteToAdmin,
	requireUser,
	simulatePaidOrder
} from '../support/db';

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
		// La suppression admin (étape 5) anonymise désormais au lieu de
		// supprimer physiquement (voir $lib/prisma/user/anonymizeUser.ts,
		// CONFORMITE_ECOMMERCE.md) : une commande payée doit survivre à la
		// suppression du compte, obligation comptable.
		const created = await createCatalogProduct();
		const { product } = created;
		const linked = await linkProductToOrder(victim.id, product.id);
		const victimTransaction = await simulatePaidOrder(linked.order.id, victim.id, victimEmail);
		const anonymizedVictimEmail = `deleted-${victim.id}@erased.local`;

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

			await test.step('2. Promotion CLIENT → ADMIN (crayon)', async () => {
				await page.goto('/admin/users');
				await page.getByPlaceholder('Cherchez dans le tableau').fill(targetEmail);
				await page
					.locator('tr', { hasText: targetEmail })
					.getByRole('link', { name: 'edit' })
					.click();
				await waitForPath(page, `/admin/users/${target.id}`);
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

			await test.step('4. La MFA se bascule depuis la fiche, et révoque les sessions de la cible', async () => {
				// Une session active existante sur le compte visé : si un admin
				// bascule la MFA (ou change le mot de passe) sans révoquer les
				// sessions, un attaquant avec un cookie volé garderait la main.
				await createRawSession(victim.id);
				expect(await countSessions(victimEmail)).toBe(1);

				await page.goto(`/admin/users/${victim.id}`);
				await expect(
					page.getByRole('heading', { name: 'Update User and Addresses' })
				).toBeVisible();
				await page.locator('input[type="checkbox"]').check();
				await page.getByRole('button', { name: 'Save changes' }).click();
				await waitForPath(page, '/admin/users');
				expect((await requireUser(victimEmail)).isMfaEnabled).toBe(true);

				// §4.1 de l'audit fonctionnel : changer la MFA/le mot de passe
				// d'un compte depuis l'admin doit déconnecter ce compte partout.
				expect(await countSessions(victimEmail)).toBe(0);
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
				// Ancien e-mail introuvable : le compte a bien changé d'identité —
				// pas la preuve à elle seule qu'il a été anonymisé plutôt que
				// supprimé, d'où les vérifications suivantes.
				expect(await getUser(victimEmail)).toBeNull();

				const anonymized = await requireUser(anonymizedVictimEmail);
				expect(anonymized.id).toBe(victim.id);
				expect(anonymized.passwordHash).toBeNull();

				// Le point qui compte : la commande payée existe toujours,
				// l'historique comptable n'est jamais perdu.
				const order = await getOrderById(linked.order.id);
				expect(order).not.toBeNull();
				expect(order?.userId).toBe(victim.id);

				const transaction = await getTransactionById(victimTransaction.id);
				expect(transaction).not.toBeNull();
			});
		} finally {
			await deleteUser(targetEmail);
			await deleteUser(anonymizedVictimEmail);
			await deleteCatalogProduct(product.id);
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
