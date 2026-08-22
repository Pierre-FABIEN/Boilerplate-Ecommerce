import { test, expect } from '../support/fixtures';
import {
	currentTotpCode,
	enrollWithTotp,
	logIn,
	setUpTotp,
	signUpAndVerify,
	waitForPath
} from '../support/flows';
import { enableMfa, getRecoveryCode, requireUser } from '../support/db';

test.describe('Authentification à deux facteurs', () => {
	test('la 2FA exigée force la configuration puis livre un code de récupération', async ({
		page,
		account
	}) => {
		await signUpAndVerify(page, account);
		await enableMfa(account.email);

		await page.goto('/auth/');
		await page.waitForURL('**/auth/2fa/setup');

		const recoveryCode = await setUpTotp(page);

		// Le code affiché est bien celui stocké, chiffré, en base.
		expect(await getRecoveryCode(account.email)).toBe(recoveryCode);

		const user = await requireUser(account.email);
		expect(user.totpKey).toBeTruthy();
		expect(user.isMfaEnabled).toBe(true);

		await page.getByRole('button', { name: 'Continuer' }).click();
		await waitForPath(page, '/auth');
	});

	test('un code TOTP invalide bloque la configuration', async ({ page, account }) => {
		await signUpAndVerify(page, account);
		await enableMfa(account.email);

		await page.goto('/auth/');
		await page.waitForURL('**/auth/2fa/setup');

		await page.locator('input[name="code"]').fill('000000');
		await page.getByRole('button', { name: 'Valider' }).click();

		await expect(page.getByText('Invalid TOTP code')).toBeVisible();
		expect((await requireUser(account.email)).totpKey).toBeNull();
	});

	test('la connexion réclame un code TOTP valide', async ({ page, account }) => {
		await enrollWithTotp(page, account);
		await page.context().clearCookies();

		await logIn(page, account);
		// Compte avec 2FA configurée : la connexion mène à la saisie du code.
		await page.waitForURL('**/auth/2fa');
		await expect(page.getByRole('heading', { name: 'Two-factor Authentication' })).toBeVisible();

		await page.locator('input[name="code"]').fill(await currentTotpCode(account.email));
		await page.getByRole('button', { name: 'Verify' }).click();

		await waitForPath(page, '/auth');
		await expect(
			page.getByRole('heading', { name: `👋 Bonjour, ${account.username} !` })
		).toBeVisible();
	});

	test('un code TOTP erroné est refusé à la connexion', async ({ page, account }) => {
		await enrollWithTotp(page, account);
		await page.context().clearCookies();

		await logIn(page, account);
		await page.waitForURL('**/auth/2fa');

		await page.locator('input[name="code"]').fill('000000');
		await page.getByRole('button', { name: 'Verify' }).click();

		await expect(page.getByText('Invalid TOTP code')).toBeVisible();
		await expect(page).toHaveURL(/\/auth\/2fa/);
	});

	test('tant que la 2FA n’est pas validée, les pages protégées restent fermées', async ({
		page,
		account
	}) => {
		await enrollWithTotp(page, account);
		await page.context().clearCookies();

		await logIn(page, account);
		await page.waitForURL('**/auth/2fa');

		// Le hook d'authentification ramène systématiquement à la saisie du code.
		await page.goto('/auth/settings');
		await page.waitForURL('**/auth/2fa');
	});

	test('le code de récupération réinitialise la 2FA', async ({ page, account }) => {
		const recoveryCode = await enrollWithTotp(page, account);
		await page.context().clearCookies();

		await logIn(page, account);
		await page.waitForURL('**/auth/2fa');

		await page.getByRole('link', { name: 'Use recovery code instead' }).click();
		await page.waitForURL('**/auth/2fa/reset');

		await page.locator('input[name="code"]').fill(recoveryCode);
		await page.getByRole('button', { name: 'Vérifier' }).click();

		// La 2FA est retirée : le parcours repart sur une nouvelle configuration.
		await page.waitForURL('**/auth/2fa/setup');
		expect((await requireUser(account.email)).totpKey).toBeNull();

		// Un code de récupération est à usage unique.
		expect(await getRecoveryCode(account.email)).not.toBe(recoveryCode);
	});

	test('un code de récupération erroné est refusé', async ({ page, account }) => {
		await enrollWithTotp(page, account);
		await page.context().clearCookies();

		await logIn(page, account);
		await page.waitForURL('**/auth/2fa');
		await page.goto('/auth/2fa/reset');

		await page.locator('input[name="code"]').fill('AAAAAAAAAAAAAAAA');
		await page.getByRole('button', { name: 'Vérifier' }).click();

		await expect(page.getByText('Invalid recovery code')).toBeVisible();
		// La clé TOTP doit rester en place.
		expect((await requireUser(account.email)).totpKey).toBeTruthy();
	});
});
