import { test, expect } from '../support/fixtures';
import { waitForPath } from '../support/flows';
import { ADMIN_PATHS, pageOrigin, signUpAndVerify } from '../support/admin';
import {
	createPromoCode,
	deletePromoCode,
	deleteUser,
	findPromoCode,
	getUser,
	occupyEmail,
	promoteToAdmin,
	requireUser
} from '../support/db';

/**
 * Accès au back-office : anonyme et CLIENT refusés (GET et POST), ADMIN accepté.
 * Pas de validation de formulaires ici.
 */
test.describe('Accès administration', () => {
	test.setTimeout(8 * 60_000);

	test('anonyme et CLIENT sont refusés ; ADMIN entre', async ({ page, account }) => {
		const victimEmail = `e2e-admin-victim-${Date.now()}@example.test`;
		const promoCode = `E2E${Date.now().toString(36).toUpperCase()}`;
		let promoId: string | null = null;

		await occupyEmail(victimEmail);
		const victim = await requireUser(victimEmail);
		const promo = await createPromoCode(promoCode);
		promoId = promo.id;

		try {
			await test.step('1. Un visiteur anonyme est renvoyé à la connexion', async () => {
				for (const path of ADMIN_PATHS) {
					await page.goto(path);
					await waitForPath(page, '/auth/login');
				}
			});

			await test.step('2. Un CLIENT est renvoyé à l’accueil', async () => {
				await signUpAndVerify(page, account);
				expect((await requireUser(account.email)).role).toBe('CLIENT');

				for (const path of ADMIN_PATHS) {
					await page.goto(path);
					await waitForPath(page, '/');
				}
			});

			await test.step('3. Un CLIENT ne peut pas muter (users, promo)', async () => {
				const origin = pageOrigin(page);

				await page.request.post('/admin/users?/deleteUser', {
					form: { id: victim.id },
					headers: { Origin: origin }
				});
				expect(await getUser(victimEmail)).not.toBeNull();

				await page.request.post('/admin/promo?/deletePromo', {
					form: { id: promo.id },
					headers: { Origin: origin }
				});
				expect(await findPromoCode(promo.id)).not.toBeNull();
			});

			await test.step('4. Un ADMIN atteint le tableau de bord et les comptes', async () => {
				await promoteToAdmin(account.email);
				expect((await requireUser(account.email)).role).toBe('ADMIN');

				await page.goto('/admin');
				await waitForPath(page, '/admin');
				await expect(page.getByRole('heading', { name: 'Accueil' })).toBeVisible();

				await page.goto('/admin/users');
				await waitForPath(page, '/admin/users');
				await expect(page.getByRole('heading', { name: 'Utilisateurs' })).toBeVisible();
				await expect(page.getByRole('cell', { name: account.email })).toBeVisible();
			});
		} finally {
			await deleteUser(victimEmail);
			if (promoId) await deletePromoCode(promoId);
		}
	});
});
