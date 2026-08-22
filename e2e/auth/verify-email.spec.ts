import { test, expect } from '../support/fixtures';
import { signUp, verifyEmail, waitForPath } from '../support/flows';
import { getEmailVerificationCode, requireUser } from '../support/db';

test.describe("Vérification de l'adresse email", () => {
	test('un code valide vérifie le compte et ouvre l’espace connecté', async ({ page, account }) => {
		await signUp(page, account);

		const code = await getEmailVerificationCode(account.email);
		// Le générateur produit 8 caractères en Base32 majuscule.
		expect(code).toMatch(/^[A-Z2-7]{8}$/);

		await verifyEmail(page, account);
		await waitForPath(page, '/auth');

		await expect(page.getByRole('heading', { name: `👋 Bonjour, ${account.username} !` })).toBeVisible();
		expect((await requireUser(account.email)).emailVerified).toBe(true);
	});

	test('un code erroné laisse le compte non vérifié', async ({ page, account }) => {
		await signUp(page, account);

		await page.locator('input[name="code"]').fill('AAAAAAAA');
		await page.getByRole('button', { name: 'Vérifier' }).click();

		await expect(page).toHaveURL(/\/auth\/verify-email/);
		expect((await requireUser(account.email)).emailVerified).toBe(false);
	});

	test('un code de longueur invalide est rejeté avant l’envoi', async ({ page, account }) => {
		await signUp(page, account);

		await page.locator('input[name="code"]').fill('123');
		await page.getByRole('button', { name: 'Vérifier' }).click();

		await expect(page.getByText('Le code doit contenir 8 chiffres.')).toBeVisible();
		expect((await requireUser(account.email)).emailVerified).toBe(false);
	});

	test('le renvoi produit un nouveau code utilisable', async ({ page, account }) => {
		await signUp(page, account);
		const firstCode = await getEmailVerificationCode(account.email);

		await page.getByRole('button', { name: 'Renvoyer le code' }).click();

		// Le nouveau code remplace le précédent en base.
		await expect
			.poll(async () => getEmailVerificationCode(account.email), { timeout: 15_000 })
			.not.toBe(firstCode);

		const secondCode = await getEmailVerificationCode(account.email);
		await page.locator('input[name="code"]').fill(secondCode);
		await page.getByRole('button', { name: 'Vérifier' }).click();

		await waitForPath(page, '/auth');
		expect((await requireUser(account.email)).emailVerified).toBe(true);
	});

	test('un visiteur anonyme est renvoyé vers la connexion', async ({ page }) => {
		await page.goto('/auth/verify-email');
		await page.waitForURL('**/auth/login');
	});
});
