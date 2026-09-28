import { test, expect } from '../support/fixtures';
import { signUpAndVerify, pageOrigin, sveltekitActionHeaders } from '../support/admin';
import { waitOutLoginThrottle } from '../support/flows';
import { clearMailbox, waitForEmailContaining, fetchMailbox } from '../support/mailbox';

/**
 * Alerte « plusieurs tentatives de connexion échouées »
 * (`$lib/server/failedLoginAlert.ts`) : un e-mail part au 3ᵉ mot de passe
 * refusé sur un compte réel, jamais avant (2 échecs ne suffisent pas), et
 * une seule fois (pas un e-mail par échec au-delà du seuil, dans la même
 * fenêtre de 15 minutes).
 */
test.describe('Auth — alerte tentatives de connexion échouées', () => {
	test.setTimeout(3 * 60_000);

	test('alerte au 3e échec, jamais avant, jamais en double', async ({ page, account }) => {
		await signUpAndVerify(page, account);
		const origin = pageOrigin(page);
		const wrongPassword = 'CeNestPasLeBonMotDePasse!1';

		const attempt = () =>
			page.request.post('/auth/login?/login', {
				form: { email: account.email, password: wrongPassword },
				headers: sveltekitActionHeaders(origin)
			});

		const noEmailReceived = async () => {
			const messages = await fetchMailbox();
			return !messages.some((m) => m.to.includes(account.email.toLowerCase()));
		};

		await clearMailbox();

		await test.step('1er et 2e échecs : aucune alerte', async () => {
			await attempt();
			await waitOutLoginThrottle(page, 1);
			await attempt();

			// Pas d'attente d'apparition (on vérifie une absence) : un court délai
			// fixe suffit, l'envoi est de toute façon fire-and-forget côté serveur
			// s'il devait avoir lieu par erreur.
			await page.waitForTimeout(1000);
			expect(await noEmailReceived()).toBe(true);
		});

		await test.step('3e échec : alerte envoyée', async () => {
			await waitOutLoginThrottle(page, 2);
			await attempt();

			// Recherché en ASCII pur : voir new-device-alert.spec.ts, même limite
			// du décodeur quoted-printable simplifié de cette suite.
			const mail = await waitForEmailContaining(
				account.email,
				'Plusieurs mots de passe incorrects'
			);
			expect(mail.raw).toContain('/auth/settings');
		});

		await test.step('4e échec (même fenêtre) : pas de second e-mail', async () => {
			await clearMailbox();
			await waitOutLoginThrottle(page, 4);
			await attempt();

			await page.waitForTimeout(1000);
			expect(await noEmailReceived()).toBe(true);
		});
	});
});
