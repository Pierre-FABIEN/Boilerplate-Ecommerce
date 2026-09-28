import { test, expect } from '../support/fixtures';
import { signUpAndVerify } from '../support/admin';
import { logIn, signOut, waitForPath } from '../support/flows';
import { makeClientIp } from '../support/account';
import { clearMailbox, waitForEmailContaining } from '../support/mailbox';
import { deleteUser, getLoginEvents } from '../support/db';

/**
 * Historique des connexions (`LoginEvent`) + alerte « nouvelle connexion
 * détectée » (`$lib/server/newDeviceAlert.ts`) : un second appareil (User-
 * Agent jamais vu pour ce compte) déclenche l'e-mail, un appareil déjà connu
 * n'en déclenche jamais. La création du compte (signup) n'alerte jamais,
 * même si c'est techniquement le tout premier « appareil » du compte — voir
 * `recordLoginEvent`.
 */
test.describe('Auth — alerte nouvel appareil', () => {
	test.setTimeout(6 * 60_000);

	test('signup silencieux, même appareil silencieux, nouvel appareil alerté', async ({
		page,
		account,
		browser
	}) => {
		try {
			await test.step('1. Inscription : enregistrée, jamais marquée "nouvel appareil"', async () => {
				await signUpAndVerify(page, account);

				const events = await getLoginEvents(account.email);
				expect(events).toHaveLength(1);
				expect(events[0].method).toBe('signup');
				expect(events[0].isNewDevice).toBe(false);
			});

			await test.step('2. Reconnexion, même navigateur : appareil déjà connu, aucune alerte', async () => {
				await clearMailbox();
				await signOut(page);
				await logIn(page, account.email, account.password);
				await waitForPath(page, '/');

				const events = await getLoginEvents(account.email);
				expect(events).toHaveLength(2);
				expect(events[0].method).toBe('password');
				expect(events[0].isNewDevice).toBe(false);
			});

			await test.step('3. Connexion depuis un appareil jamais vu : marquée et alertée par e-mail', async () => {
				await clearMailbox();
				const otherContext = await browser.newContext({
					userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/128.0 Mobile',
					extraHTTPHeaders: { 'X-Forwarded-For': makeClientIp() }
				});
				const otherPage = await otherContext.newPage();

				try {
					await logIn(otherPage, account.email, account.password);
					await waitForPath(otherPage, '/');

					const events = await getLoginEvents(account.email);
					expect(events).toHaveLength(3);
					expect(events[0].method).toBe('password');
					expect(events[0].isNewDevice).toBe(true);

					// Cherché dans le corps, pas le sujet : le sujet accentué part encodé
					// MIME (`=?UTF-8?Q?...?=`, espaces en underscores), que le décodeur
					// volontairement simple de `waitForEmailContaining` ne restitue pas —
					// contrairement au corps (quoted-printable classique, déjà décodé
					// ailleurs dans cette suite, voir `journey.spec.ts`).
					const mail = await waitForEmailContaining(
						account.email,
						'appareil que nous ne reconnaissons pas'
					);
					expect(mail.raw.toLowerCase()).toContain('android');

					await test.step('4. La page Sessions affiche le badge "Nouvel appareil"', async () => {
						await otherPage.goto('/auth/settings/sessions');
						await expect(
							otherPage.getByRole('heading', { name: 'Historique des connexions récentes' })
						).toBeVisible();
						await expect(otherPage.getByText('Nouvel appareil')).toBeVisible();
					});
				} finally {
					await otherContext.close();
				}
			});
		} finally {
			await deleteUser(account.email);
		}
	});
});
