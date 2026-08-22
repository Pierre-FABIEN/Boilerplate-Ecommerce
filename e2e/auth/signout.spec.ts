import { test, expect } from '../support/fixtures';
import { signUpAndVerify } from '../support/flows';
import { countSessions } from '../support/db';

test.describe('Déconnexion', () => {
	test('le bouton ferme la session et invalide le cookie', async ({ page, account }) => {
		await signUpAndVerify(page, account);
		expect(await countSessions(account.email)).toBe(1);

		await page.getByRole('button', { name: 'Se déconnecter' }).click();
		await page.waitForURL('**/auth/login');

		// La session est supprimée en base et le cookie retiré du navigateur.
		expect(await countSessions(account.email)).toBe(0);
		const cookies = await page.context().cookies();
		expect(cookies.map((c) => c.name)).not.toContain('auth_session');

		// L'espace connecté n'est plus accessible.
		await page.goto('/auth/');
		await page.waitForURL('**/auth/login');
	});

	test("l'endpoint POST /auth/signout invalide la session", async ({ page, account }) => {
		await signUpAndVerify(page, account);

		const response = await page.request.post('/auth/signout');
		expect(response.status()).toBe(200);
		expect(await response.json()).toEqual({ success: true });

		expect(await countSessions(account.email)).toBe(0);
	});

	test("l'endpoint refuse un appel non authentifié", async ({ page }) => {
		const response = await page.request.post('/auth/signout');
		expect(response.status()).toBe(401);
	});
});
