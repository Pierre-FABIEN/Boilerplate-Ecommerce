import { test, expect } from '../support/fixtures';
import { signUp, signUpAndVerify } from '../support/flows';
import { getUser } from '../support/db';

test.describe("Création de compte", () => {
	test("crée le compte et oriente vers la vérification d'adresse", async ({ page, account }) => {
		await signUp(page, account);

		await expect(page.getByRole('heading', { name: 'Vérifiez votre adresse email' })).toBeVisible();
		await expect(page.getByText(account.email)).toBeVisible();

		const user = await getUser(account.email);
		expect(user).not.toBeNull();
		expect(user?.username).toBe(account.username);
		expect(user?.emailVerified).toBe(false);
		// Le mot de passe ne doit jamais être stocké en clair.
		expect(user?.passwordHash).toBeTruthy();
		expect(user?.passwordHash).not.toContain(account.password);
	});

	test('ouvre une session dès l’inscription', async ({ page, account }) => {
		await signUp(page, account);

		const cookies = await page.context().cookies();
		expect(cookies.map((c) => c.name)).toContain('auth_session');
	});

	test('refuse une adresse déjà utilisée et renvoie vers la connexion', async ({
		page,
		account
	}) => {
		await signUpAndVerify(page, account);

		// Nouveau contexte pour repartir sans session.
		const secondContext = await page.context().browser()!.newContext();
		const secondPage = await secondContext.newPage();

		await secondPage.goto('/auth/signup');
		await secondPage.locator('input[name="username"]').fill('autre_pseudo');
		await secondPage.locator('input[name="email"]').fill(account.email);
		await secondPage.locator('input[name="password"]').fill('Un4utre!MotDePasse');
		await secondPage.getByRole('button', { name: "S'inscrire" }).click();

		await expect(
			secondPage.getByText('vous etes deja inscrit avec cette adresse email.')
		).toBeVisible();
		await secondPage.waitForURL('**/auth/login');

		await secondContext.close();
	});

	test('bloque un mot de passe trop faible côté client', async ({ page, account }) => {
		await page.goto('/auth/signup');
		await page.locator('input[name="username"]').fill(account.username);
		await page.locator('input[name="email"]').fill(account.email);
		await page.locator('input[name="password"]').fill('faible');
		await page.getByRole('button', { name: "S'inscrire" }).click();

		await expect(
			page.getByText('Le mot de passe doit contenir au moins 8 caractères.')
		).toBeVisible();

		// Aucun compte ne doit avoir été créé.
		expect(await getUser(account.email)).toBeNull();
		await expect(page).toHaveURL(/\/auth\/signup/);
	});

	test("bloque un nom d'utilisateur trop court", async ({ page, account }) => {
		await page.goto('/auth/signup');
		await page.locator('input[name="username"]').fill('ab');
		await page.locator('input[name="email"]').fill(account.email);
		await page.locator('input[name="password"]').fill(account.password);
		await page.getByRole('button', { name: "S'inscrire" }).click();

		await expect(
			page.getByText("Le nom d'utilisateur doit contenir au moins 4 caractères.")
		).toBeVisible();
		expect(await getUser(account.email)).toBeNull();
	});
});
