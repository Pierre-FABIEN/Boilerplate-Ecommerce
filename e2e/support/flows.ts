import { expect, type Page } from '@playwright/test';
import { generateTOTP } from '@oslojs/otp';
import { decodeBase64 } from '@oslojs/encoding';
import type { Account } from './account';
import { enableMfa, getEmailVerificationCode, getTotpKey } from './db';

/**
 * Attend une URL par son chemin, en ignorant le slash final.
 *
 * Les redirections serveur visent `/auth/` mais SvelteKit normalise l'adresse en
 * `/auth`, ce qu'un motif glob ne rattrape pas.
 */
export function waitForPath(page: Page, path: string) {
	const expected = path.replace(/\/+$/, '');
	return page.waitForURL((url) => url.pathname.replace(/\/+$/, '') === expected);
}

/** Chemin courant, sans slash final, pour les assertions. */
export function currentPath(page: Page): string {
	return new URL(page.url()).pathname.replace(/\/+$/, '');
}

/**
 * Remplit et soumet le formulaire d'inscription.
 *
 * À l'issue de l'action le serveur redirige vers `/auth/2fa/setup`, dont le
 * `load` renvoie aussitôt vers `/auth/verify-email` puisque l'adresse n'est pas
 * encore vérifiée. La page d'atterrissage attendue est donc la vérification.
 */
export async function signUp(page: Page, account: Account) {
	await page.goto('/auth/signup');
	await expect(page.getByRole('heading', { name: 'Créer un compte' })).toBeVisible();

	await page.locator('input[name="username"]').fill(account.username);
	await page.locator('input[name="email"]').fill(account.email);
	await page.locator('input[name="password"]').fill(account.password);
	await page.getByRole('button', { name: "S'inscrire" }).click();

	await page.waitForURL('**/auth/verify-email');
}

/** Saisit le code reçu par email, lu directement en base. */
export async function verifyEmail(page: Page, account: Account) {
	const code = await getEmailVerificationCode(account.email);
	await page.locator('input[name="code"]').fill(code);
	await page.getByRole('button', { name: 'Vérifier' }).click();
}

/** Inscription complète jusqu'à l'espace connecté, sans 2FA. */
export async function signUpAndVerify(page: Page, account: Account) {
	await signUp(page, account);
	await verifyEmail(page, account);
	await waitForPath(page, '/auth');
}

export async function logIn(page: Page, account: Account, password = account.password) {
	await page.goto('/auth/login');
	await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();

	await page.locator('input[name="email"]').fill(account.email);
	await page.locator('input[name="password"]').fill(password);
	await page.getByRole('button', { name: 'Continuer' }).click();
}

/**
 * Configure la 2FA sur la page `/auth/2fa/setup`.
 *
 * La clé proposée par le serveur est lue dans le champ caché, ce qui permet de
 * calculer un code TOTP valide sans dépendre de la base.
 * @returns le code de récupération affiché à l'étape suivante.
 */
export async function setUpTotp(page: Page): Promise<string> {
	await expect(
		page.getByRole('heading', { name: "Configurer l'authentification à deux facteurs" })
	).toBeVisible();

	const encodedKey = await page.locator('input[name="encodedTOTPKey"]').inputValue();
	const code = generateTOTP(decodeBase64(encodedKey), 30, 6);

	await page.locator('input[name="code"]').fill(code);
	await page.getByRole('button', { name: 'Valider' }).click();

	await page.waitForURL('**/auth/recovery-code');
	const recoveryCode = (await page.locator('.font-mono').innerText()).trim();
	expect(recoveryCode).toHaveLength(16);
	return recoveryCode;
}

/** Génère un code TOTP valide depuis la clé chiffrée stockée en base. */
export async function currentTotpCode(email: string): Promise<string> {
	return generateTOTP(await getTotpKey(email), 30, 6);
}

/**
 * Amène un compte à l'état « 2FA exigée et configurée ».
 *
 * L'interface d'activation de la MFA est commentée dans les paramètres, donc le
 * drapeau est basculé en base ; le reste du parcours passe bien par les pages.
 * @returns le code de récupération du compte.
 */
export async function enrollWithTotp(page: Page, account: Account): Promise<string> {
	await signUpAndVerify(page, account);
	await enableMfa(account.email);

	// Le hook d'authentification renvoie vers la configuration dès la requête
	// suivante, puisque la 2FA est désormais exigée sans être configurée.
	await page.goto('/auth/');
	await page.waitForURL('**/auth/2fa/setup');

	return setUpTotp(page);
}
