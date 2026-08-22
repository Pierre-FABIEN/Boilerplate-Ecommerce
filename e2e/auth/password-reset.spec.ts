import { test, expect } from '../support/fixtures';
import {
	currentTotpCode,
	enrollWithTotp,
	logIn,
	signUpAndVerify,
	waitForPath
} from '../support/flows';
import { getPasswordResetCode } from '../support/db';

const NEW_PASSWORD = 'N0uveauMotDePasse!';

/** Demande la réinitialisation depuis une session anonyme. */
async function requestReset(page: import('@playwright/test').Page, email: string) {
	await page.goto('/auth/forgot-password');
	await expect(page.getByRole('heading', { name: 'Mot de passe oublié' })).toBeVisible();

	await page.locator('input[name="email"]').fill(email);
	await page.getByRole('button', { name: 'Envoyer' }).click();

	await page.waitForURL('**/auth/reset-password/verify-email');
}

test.describe('Mot de passe oublié', () => {
	test('parcours complet puis connexion avec le nouveau mot de passe', async ({
		page,
		account
	}) => {
		await signUpAndVerify(page, account);
		await page.context().clearCookies();

		await requestReset(page, account.email);

		const code = await getPasswordResetCode(account.email);
		// Le code de réinitialisation utilise 8 caractères alphanumériques majuscules.
		expect(code).toMatch(/^[A-Z0-9]{8}$/);

		await page.locator('input[name="code"]').fill(code);
		await page.getByRole('button', { name: 'Vérifier' }).click();

		// Sans 2FA configurée, l'étape du second facteur est sautée.
		await page.waitForURL('**/auth/reset-password');
		await expect(
			page.getByRole('heading', { name: 'Réinitialiser votre mot de passe' })
		).toBeVisible();

		await page.locator('input[name="password"]').fill(NEW_PASSWORD);
		await page.getByRole('button', { name: 'Réinitialiser le mot de passe' }).click();
		await waitForPath(page, '/auth');

		// L'ancien mot de passe ne fonctionne plus, le nouveau oui.
		await page.context().clearCookies();
		await logIn(page, account, account.password);
		await expect(page.getByText('Invalid password')).toBeVisible();

		await logIn(page, account, NEW_PASSWORD);
		await page.waitForURL((url) => url.pathname === '/');
	});

	test('une adresse inconnue ne déclenche pas de réinitialisation', async ({ page }) => {
		await page.goto('/auth/forgot-password');
		await page.locator('input[name="email"]').fill('inconnu-e2e@example.test');
		await page.getByRole('button', { name: 'Envoyer' }).click();

		await expect(page.getByText('Account does not exist')).toBeVisible();
		await expect(page).toHaveURL(/\/auth\/forgot-password/);
	});

	test('un code erroné bloque la réinitialisation', async ({ page, account }) => {
		await signUpAndVerify(page, account);
		await page.context().clearCookies();

		await requestReset(page, account.email);

		await page.locator('input[name="code"]').fill('ZZZZZZZZ');
		await page.getByRole('button', { name: 'Vérifier' }).click();

		await expect(page.getByText('Incorrect code')).toBeVisible();

		// L'accès direct au formulaire de nouveau mot de passe reste fermé.
		await page.goto('/auth/reset-password');
		await page.waitForURL('**/auth/reset-password/verify-email');
	});

	test('sans session de réinitialisation, la page renvoie vers le formulaire', async ({ page }) => {
		await page.goto('/auth/reset-password');
		await page.waitForURL('**/auth/forgot-password');
	});

	test('un compte protégé par 2FA doit fournir son code TOTP', async ({ page, account }) => {
		await enrollWithTotp(page, account);
		await page.context().clearCookies();

		await requestReset(page, account.email);

		await page.locator('input[name="code"]').fill(await getPasswordResetCode(account.email));
		await page.getByRole('button', { name: 'Vérifier' }).click();

		// La 2FA ne doit pas être contournable par la réinitialisation.
		await page.waitForURL('**/auth/reset-password/2fa');
		await expect(
			page.getByRole('heading', { name: 'Authentification à deux facteurs' })
		).toBeVisible();

		await page.locator('input[name="code"]').first().fill(await currentTotpCode(account.email));
		await page.getByRole('button', { name: 'Vérifier' }).first().click();

		await page.waitForURL('**/auth/reset-password');
		await page.locator('input[name="password"]').fill(NEW_PASSWORD);
		await page.getByRole('button', { name: 'Réinitialiser le mot de passe' }).click();

		await waitForPath(page, '/auth');
	});
});
