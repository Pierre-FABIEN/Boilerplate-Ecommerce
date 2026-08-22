import { test, expect } from '../support/fixtures';
import { logIn, signUpAndVerify, waitForPath } from '../support/flows';
import { deleteUser, getEmailVerificationCode, requireUser } from '../support/db';

const NEW_PASSWORD = 'M0tDePasseChange!';

test.describe('Paramètres du compte', () => {
	test('le changement de mot de passe prend effet à la connexion suivante', async ({
		page,
		account
	}) => {
		await signUpAndVerify(page, account);

		await page.goto('/auth/settings');
		await expect(page.getByRole('heading', { name: 'Paramètres du compte' })).toBeVisible();

		await page.locator('input[name="password"]').fill(account.password);
		await page.locator('input[name="new_password"]').fill(NEW_PASSWORD);
		await page.getByRole('button', { name: 'Changer le mot de passe' }).click();

		await expect(page.getByText('Password modified successfully')).toBeVisible();

		await page.context().clearCookies();
		await logIn(page, account, NEW_PASSWORD);
		await page.waitForURL((url) => url.pathname === '/');
	});

	test('un mot de passe actuel erroné est refusé', async ({ page, account }) => {
		await signUpAndVerify(page, account);
		await page.goto('/auth/settings');

		await page.locator('input[name="password"]').fill('PasLeBon!1');
		await page.locator('input[name="new_password"]').fill(NEW_PASSWORD);
		await page.getByRole('button', { name: 'Changer le mot de passe' }).click();

		// Le mot de passe d'origine doit rester valide.
		await page.context().clearCookies();
		await logIn(page, account, account.password);
		await page.waitForURL((url) => url.pathname === '/');
	});

	test("le changement d'adresse exige une nouvelle vérification", async ({ page, account }) => {
		await signUpAndVerify(page, account);
		const newEmail = `e2e-changed-${Date.now()}@example.test`;

		await page.goto('/auth/settings');
		await page.locator('input[name="email"]').fill(newEmail);
		await page.getByRole('button', { name: "Mettre à jour l'email" }).click();

		await page.waitForURL('**/auth/verify-email');
		await expect(page.getByText(newEmail)).toBeVisible();

		// L'adresse en base ne change qu'après validation du code.
		const beforeVerification = await requireUser(account.email);
		expect(beforeVerification.email).toBe(account.email);

		const code = await getEmailVerificationCode(account.email);
		await page.locator('input[name="code"]').fill(code);
		await page.getByRole('button', { name: 'Vérifier' }).click();
		await waitForPath(page, '/auth');

		expect((await requireUser(newEmail)).email).toBe(newEmail);

		await deleteUser(newEmail);
	});

	test("une adresse déjà prise est refusée", async ({ page, account, browser }) => {
		const occupied = `e2e-occupied-${Date.now()}@example.test`;

		// Premier compte qui occupe l'adresse.
		const otherContext = await browser.newContext();
		const otherPage = await otherContext.newPage();
		await signUpAndVerify(otherPage, {
			email: occupied,
			username: 'e2e_occupant',
			password: account.password
		});
		await otherContext.close();

		await signUpAndVerify(page, account);
		await page.goto('/auth/settings');
		await page.locator('input[name="email"]').fill(occupied);
		await page.getByRole('button', { name: "Mettre à jour l'email" }).click();

		await expect(page.getByText('This email is already used')).toBeVisible();

		await deleteUser(occupied);
	});

	test('les paramètres sont inaccessibles sans session', async ({ page }) => {
		await page.goto('/auth/settings');
		await page.waitForURL('**/auth/login');
	});
});
