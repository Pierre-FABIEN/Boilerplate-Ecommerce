import { test, expect } from '../support/fixtures';
import { signUpAndVerify, pageOrigin, sveltekitActionHeaders } from '../support/admin';
import { clearMailbox, waitForEmailContaining } from '../support/mailbox';

/**
 * Confirmation par e-mail au changement de mot de passe (`/auth/settings`,
 * action `password`) — voir `$lib/server/passwordChangedAlert.ts`. Le seul
 * comportement à vérifier ici est que l'e-mail part bien ; le changement de
 * mot de passe lui-même (révocation des autres sessions, réémission) est
 * déjà couvert par `journey.spec.ts` §7.
 */
test.describe('Auth — confirmation changement de mot de passe', () => {
	test.setTimeout(4 * 60_000);

	test('un e-mail confirme chaque changement de mot de passe', async ({ page, account }) => {
		await signUpAndVerify(page, account);
		const origin = pageOrigin(page);
		const newPassword = 'NouveauMdp!2026';

		await clearMailbox();

		const response = await page.request.post('/auth/settings?/password', {
			form: {
				password: account.password,
				new_password: newPassword
			},
			headers: sveltekitActionHeaders(origin)
		});
		expect(response.status()).toBe(200);
		const body = await response.json();
		expect(body.type).toBe('success');

		// Cherché en ASCII pur, sans accent : `waitForEmailContaining` décode le
		// quoted-printable octet par octet (`String.fromCharCode` par paire hexa),
		// pas un vrai décodage UTF-8 — un caractère accentué ne redeviendrait pas
		// la même chaîne qu'un littéral accentué de ce fichier.
		const mail = await waitForEmailContaining(account.email, 'aucune action');
		expect(mail.raw.toLowerCase()).toContain('mot de passe');
	});
});
