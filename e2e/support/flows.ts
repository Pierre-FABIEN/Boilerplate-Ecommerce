import { expect, type Locator, type Page } from '@playwright/test';
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
 * Champ visible d'un Superforms : le même `name` existe aussi en `hidden`.
 */
export function visibleNamedInput(page: Page, name: string, type = 'text') {
	return page.locator(`input[name="${name}"][type="${type}"]`);
}

/** Clic qui traverse la barre de navigation flottante. */
export async function clickThroughOverlay(locator: Locator) {
	await locator.click({ force: true });
}

/** Soumission native : la barre du bas intercepte souvent le clic sur le bouton. */
export async function requestSubmitForm(page: Page, action: string) {
	await page.locator(`form[action="${action}"]`).evaluate((form) => {
		(form as HTMLFormElement).requestSubmit();
	});
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
 * Saisit une valeur et s'assure qu'elle a bien pris.
 *
 * Après une soumission refusée, superforms réinjecte les données postées dans le
 * formulaire. Ce rendu peut arriver juste après une nouvelle saisie et l'écraser
 * sans erreur : c'est alors l'ancienne valeur qui repart au serveur, panne
 * d'autant plus trompeuse que le champ affiche la bonne valeur au moment où on
 * l'observe. On laisse donc passer un cycle de rendu, et on réessaie jusqu'à ce
 * que la saisie tienne.
 */
export async function fillStable(input: Locator, value: string) {
	await expect(async () => {
		await input.fill(value);
		await input.page().waitForTimeout(200);
		await expect(input).toHaveValue(value, { timeout: 1_000 });
	}).toPass({ timeout: 15_000 });
}

/** Champ de saisie de code à usage unique, commun aux pages de vérification. */
export function codeInput(page: Page): Locator {
	return page.locator('input[name="code"]');
}

/** Saisit un code à usage unique et soumet le formulaire correspondant. */
export async function submitCode(page: Page, code: string, button = 'Vérifier') {
	await fillStable(codeInput(page), code);
	await page.getByRole('button', { name: button }).click();
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
	await fillStable(page.locator('input[name="username"]'), values.username);
	await fillStable(page.locator('input[name="email"]'), values.email);
	await fillStable(page.locator('input[name="password"]'), values.password);
}

/** Soumet le formulaire de connexion depuis la page dédiée. */
export async function logIn(page: Page, email: string, password: string) {
	await page.goto('/auth/login');
	await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();

	await fillStable(page.locator('input[name="email"]'), email);
	await fillStable(page.locator('input[name="password"]'), password);
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

/** Se déconnecte depuis le tiroir panier (pas le formulaire de `/auth`). */
export async function signOutFromCart(page: Page) {
	await page.goto('/');
	await page.locator('.cartButton button').first().click();
	await expect(page.getByRole('heading', { name: 'Votre panier' })).toBeVisible();
	await page.getByRole('button', { name: 'Se déconnecter' }).click();
	await waitForPath(page, '/auth/login');
}

/**
 * Configure la 2FA sur la page `/auth/2fa/setup`.
 *
 * @returns le code de récupération affiché à l'étape suivante.
 */
export async function setUpTotp(page: Page): Promise<string> {
	await expect(
		page.getByRole('heading', { name: "Configurer l'authentification à deux facteurs" })
	).toBeVisible();

	await submitCode(page, await validSetupCode(page), 'Valider');

	await page.waitForURL('**/auth/recovery-code');
	const recoveryCode = (await page.locator('.font-mono').innerText()).trim();
	expect(recoveryCode).toHaveLength(16);
	return recoveryCode;
}

/**
 * Code TOTP valide calculé depuis la clé proposée par la page de configuration.
 *
 * La clé est lue dans le champ caché du formulaire, ce qui évite de dépendre de
 * la base pour une clé qui n'y est pas encore enregistrée.
 */
export async function validSetupCode(page: Page): Promise<string> {
	const encodedKey = await page.locator('input[name="encodedTOTPKey"]').inputValue();
	return generateTOTP(decodeBase64(encodedKey), 30, 6);
}

/** Génère un code TOTP valide depuis la clé chiffrée stockée en base. */
export async function currentTotpCode(email: string): Promise<string> {
	return generateTOTP(await getTotpKey(email), 30, 6);
}
