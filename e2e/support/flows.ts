import { expect, type Page } from '@playwright/test';
import { generateTOTP } from '@oslojs/otp';
import { decodeBase64 } from '@oslojs/encoding';
import { getTotpKey } from './db';

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
 * Vérifie qu'un message est affiché.
 *
 * Les erreurs de formulaire remontent à la fois dans un toast et sous le champ
 * concerné : on ne retient que la première occurrence pour éviter l'échec du
 * mode strict de Playwright.
 */
export async function expectMessage(page: Page, text: string) {
	await expect(page.getByText(text).first()).toBeVisible();
}

/**
 * Nom du cookie de session.
 *
 * `sessionCookie.name` n'est pas surchargé dans `src/lib/lucia/index.ts`, Lucia
 * retombe donc sur sa valeur par défaut.
 */
export const SESSION_COOKIE = 'auth_session';

/** Cookie de session courant du navigateur, ou `null` s'il n'y en a pas. */
export async function sessionCookie(page: Page) {
	const cookies = await page.context().cookies();
	return cookies.find((cookie) => cookie.name === SESSION_COOKIE && cookie.value !== '') ?? null;
}

/** Remplit les trois champs de l'inscription sans soumettre. */
export async function fillSignupForm(
	page: Page,
	values: { username: string; email: string; password: string }
) {
	await page.locator('input[name="username"]').fill(values.username);
	await page.locator('input[name="email"]').fill(values.email);
	await page.locator('input[name="password"]').fill(values.password);
}

/** Soumet le formulaire de connexion depuis la page dédiée. */
export async function logIn(page: Page, email: string, password: string) {
	await page.goto('/auth/login');
	await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();

	await page.locator('input[name="email"]').fill(email);
	await page.locator('input[name="password"]').fill(password);
	await page.getByRole('button', { name: 'Continuer' }).click();
}

/**
 * Patiente le temps du délai imposé après des échecs de connexion.
 *
 * `Throttler` (src/lib/lucia/rate-limit.ts) impose une attente croissante entre
 * deux tentatives sur un même compte : 0s, 1s, 2s, 4s… Sans cette pause, la
 * tentative suivante reçoit « Too many requests » au lieu du message attendu.
 */
export async function waitOutLoginThrottle(page: Page, seconds: number) {
	await page.waitForTimeout(seconds * 1000 + 300);
}

/** Se déconnecte depuis l'espace connecté et attend la page de connexion. */
export async function signOut(page: Page) {
	await page.goto('/auth/');
	await page.getByRole('button', { name: 'Se déconnecter' }).click();
	await waitForPath(page, '/auth/login');
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

	await submitTotpSetupCode(page, await validSetupCode(page));

	await page.waitForURL('**/auth/recovery-code');
	const recoveryCode = (await page.locator('.font-mono').innerText()).trim();
	expect(recoveryCode).toHaveLength(16);
	return recoveryCode;
}

/** Code TOTP valide calculé depuis la clé proposée par la page de configuration. */
export async function validSetupCode(page: Page): Promise<string> {
	const encodedKey = await page.locator('input[name="encodedTOTPKey"]').inputValue();
	return generateTOTP(decodeBase64(encodedKey), 30, 6);
}

/** Saisit un code sur la page de configuration 2FA et soumet. */
export async function submitTotpSetupCode(page: Page, code: string) {
	await page.locator('input[name="code"]').fill(code);
	await page.getByRole('button', { name: 'Valider' }).click();
}

/** Génère un code TOTP valide depuis la clé chiffrée stockée en base. */
export async function currentTotpCode(email: string): Promise<string> {
	return generateTOTP(await getTotpKey(email), 30, 6);
}
