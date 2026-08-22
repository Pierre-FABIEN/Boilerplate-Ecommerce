import { test, expect } from '../support/fixtures';
import { logIn, signUpAndVerify } from '../support/flows';
import { countSessions } from '../support/db';

test.describe('Connexion', () => {
	test('un compte vérifié se connecte et atteint l’accueil', async ({ page, account }) => {
		await signUpAndVerify(page, account);
		await page.context().clearCookies();

		await logIn(page, account);

		// Sans 2FA exigée, la connexion mène à la racine du site.
		await page.waitForURL((url) => url.pathname === '/');

		const cookies = await page.context().cookies();
		expect(cookies.map((c) => c.name)).toContain('auth_session');
	});

	test('un mot de passe erroné est refusé', async ({ page, account }) => {
		await signUpAndVerify(page, account);
		await page.context().clearCookies();

		await logIn(page, account, 'MauvaisMotDePasse!1');

		await expect(page.getByText('Invalid password')).toBeVisible();
		await expect(page).toHaveURL(/\/auth\/login/);
	});

	test('un compte inexistant est refusé', async ({ page }) => {
		await page.goto('/auth/login');
		await page.locator('input[name="email"]').fill('inconnu-e2e@example.test');
		await page.locator('input[name="password"]').fill('Sup3rSecret!2026');
		await page.getByRole('button', { name: 'Continuer' }).click();

		await expect(page.getByText('Le compte nexiste pas')).toBeVisible();
		await expect(page).toHaveURL(/\/auth\/login/);
	});

	test('une adresse mal formée est rejetée côté client', async ({ page }) => {
		await page.goto('/auth/login');
		await page.locator('input[name="email"]').fill('pas-une-adresse');
		await page.locator('input[name="password"]').fill('Sup3rSecret!2026');
		await page.getByRole('button', { name: 'Continuer' }).click();

		await expect(page).toHaveURL(/\/auth\/login/);
	});

	test("une adresse non vérifiée est redirigée vers la vérification", async ({ page, account }) => {
		// On s'inscrit sans valider le code, puis on repart d'une session vierge.
		await page.goto('/auth/signup');
		await page.locator('input[name="username"]').fill(account.username);
		await page.locator('input[name="email"]').fill(account.email);
		await page.locator('input[name="password"]').fill(account.password);
		await page.getByRole('button', { name: "S'inscrire" }).click();
		await page.waitForURL('**/auth/verify-email');

		await page.context().clearCookies();
		await logIn(page, account);

		await page.waitForURL('**/auth/verify-email');
	});

	test('chaque connexion crée une session distincte', async ({ page, account }) => {
		await signUpAndVerify(page, account);
		expect(await countSessions(account.email)).toBe(1);

		await page.context().clearCookies();
		await logIn(page, account);
		await page.waitForURL((url) => url.pathname === '/');

		expect(await countSessions(account.email)).toBe(2);
	});
});
