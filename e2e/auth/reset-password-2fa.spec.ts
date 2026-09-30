import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { signUpAndVerify } from '../support/admin';
import {
	fillStable,
	setUpTotp,
	signOut,
	submitCode,
	waitForPath,
	currentTotpCode,
	expectMessage
} from '../support/flows';
import { clearMailbox, waitForEmailCode } from '../support/mailbox';
import { deleteUser, enableMfa, requireUser } from '../support/db';
import type { Account } from '../support/account';

/**
 * `/auth/reset-password/2fa` n'était jamais exercé de bout en bout — seul le
 * garde d'accès anonyme est couvert dans `journey.spec.ts`. Un compte avec
 * 2FA active doit passer par cette étape avant `/auth/reset-password`,
 * contrairement à un compte sans 2FA (`journey.spec.ts`, étapes 12-13) qui
 * saute directement dessus — voir la garde dans
 * `src/routes/auth/reset-password/+page.server.ts`.
 *
 * La page a deux formulaires sur le même champ `input[name="code"]` (`?/totp`
 * et `?/recovery_code`) : contrairement au reste du parcours 2FA, le helper
 * générique `submitCode`/`codeInput` (`e2e/support/flows.ts`) matcherait les
 * deux — chaque cas ci-dessous soumet donc son propre formulaire, scopé par
 * son `action`.
 */

async function submitScopedCode(page: Page, action: '?/totp' | '?/recovery_code', code: string) {
	const input = page.locator(`form[action="${action}"] input[name="code"]`);
	await fillStable(input, code);
	await input.fill(code);
	await page.locator(`form[action="${action}"] button[type="submit"]`).click();
}

/**
 * Calcule et soumet un code TOTP juste avant qu'il n'expire (fenêtre de 30s,
 * `@oslojs/otp`) — sans cette garde, un code calculé à moins de ~5s de la
 * bascule peut devenir invalide entre son calcul et sa validation serveur
 * (observé une fois sur ce spec : échec, succès au retry immédiat suivant).
 */
async function submitFreshTotpCode(page: Page, email: string) {
	const msIntoWindow = Date.now() % 30_000;
	if (msIntoWindow > 24_000) {
		await page.waitForTimeout(30_000 - msIntoWindow + 500);
	}
	await submitScopedCode(page, '?/totp', await currentTotpCode(email));
}

/** Compte avec 2FA active, jusqu'à `/auth` — même patron que journey.spec.ts
 * étapes 14-15, factorisé ici pour ne pas le répéter dans chaque test. */
async function setUpAccountWith2FA(page: Page, account: Account): Promise<string> {
	await signUpAndVerify(page, account);
	await enableMfa(account.email);

	await page.goto('/auth/');
	await waitForPath(page, '/auth/2fa/setup');
	const recoveryCode = await setUpTotp(page);
	await page.getByRole('button', { name: 'Continuer' }).click();
	await waitForPath(page, '/auth');

	return recoveryCode;
}

/** Déclenche « mot de passe oublié » jusqu'à la redirection attendue vers
 * `/auth/reset-password/2fa` — même patron que journey.spec.ts étape 12-13. */
async function triggerForgotPasswordUntil2FA(page: Page, email: string) {
	await clearMailbox();
	await signOut(page);

	await page.goto('/auth/login');
	await page.getByRole('link', { name: 'Mot de passe oublié ?' }).click();
	await waitForPath(page, '/auth/forgot-password');

	await fillStable(page.locator('input[name="email"]'), email);
	await page.getByRole('button', { name: 'Envoyer' }).click();
	await waitForPath(page, '/auth/reset-password/verify-email');

	await submitCode(page, await waitForEmailCode(email));

	// Le point précis que ce spec existe pour prouver : un compte 2FA ne doit
	// jamais atterrir directement sur /auth/reset-password.
	await waitForPath(page, '/auth/reset-password/2fa');
}

test.describe('Réinitialisation de mot de passe — compte 2FA actif', () => {
	test.setTimeout(4 * 60_000);

	test('code TOTP : invalide puis valide', async ({ page, account }) => {
		try {
			await setUpAccountWith2FA(page, account);
			await triggerForgotPasswordUntil2FA(page, account.email);

			await submitScopedCode(page, '?/totp', '000000');
			await expectMessage(page, 'Invalid TOTP code');
			expect(page.url()).toContain('/auth/reset-password/2fa');

			await submitFreshTotpCode(page, account.email);
			await waitForPath(page, '/auth/reset-password');

			const passwordField = page.locator('input[name="password"]');
			await fillStable(passwordField, 'NouveauMotDePasse!2026');
			await page.getByRole('button', { name: 'Réinitialiser le mot de passe' }).click();
			await waitForPath(page, '/auth');
		} finally {
			await deleteUser(account.email);
		}
	});

	test('code de récupération : invalide puis valide, retire la 2FA', async ({ page, account }) => {
		try {
			const recoveryCode = await setUpAccountWith2FA(page, account);
			await triggerForgotPasswordUntil2FA(page, account.email);

			await submitScopedCode(page, '?/recovery_code', '0000000000000000');
			await expectMessage(page, 'Invalid code');
			expect(page.url()).toContain('/auth/reset-password/2fa');

			await submitScopedCode(page, '?/recovery_code', recoveryCode);
			await waitForPath(page, '/auth/reset-password');

			expect((await requireUser(account.email)).totpKey).toBeNull();

			const passwordField = page.locator('input[name="password"]');
			await fillStable(passwordField, 'NouveauMotDePasse!2026');
			await page.getByRole('button', { name: 'Réinitialiser le mot de passe' }).click();

			// `resetUser2FAWithRecoveryCode` retire `totpKey` mais laisse
			// `isMfaEnabled` intact (même comportement que `/auth/2fa/reset`,
			// voir docs/auth/README.md) : la 2FA reste exigée mais plus
			// configurée, `authHandle` renvoie donc vers la reconfiguration au
			// lieu de `/auth`.
			await waitForPath(page, '/auth/2fa/setup');
		} finally {
			await deleteUser(account.email);
		}
	});
});
