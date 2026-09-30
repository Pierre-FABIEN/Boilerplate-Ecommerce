import { test, expect } from '../support/fixtures';
import { signUpAndVerify } from '../support/admin';
import { countSessions, createExpiredSession, deleteUser, requireUser } from '../support/db';

const CRON_HEADERS = { authorization: `Bearer ${process.env.CRON_SECRET}` };

/**
 * Purge programmée (`$lib/server/jobs/cleanup.ts`, route
 * `/api/jobs/cleanup`) : même patron d'authentification directe que
 * `cart-recovery.spec.ts` (`CRON_SECRET` en repli sans QStash — voir
 * `assertAuthorized`, identique dans les deux routes). Se limite à
 * l'authentification et à l'effet sur les sessions expirées, la catégorie la
 * plus simple à mettre en place sans attendre réellement — les autres
 * catégories purgées par le même job (`cleanup.ts`) ne sont pas reprises ici
 * pour ne pas dupliquer une logique déjà couverte à la lecture du code.
 */
test.describe('Purge programmée', () => {
	test.setTimeout(2 * 60_000);

	test('sans en-tête : refusé', async ({ page }) => {
		const response = await page.request.post('/api/jobs/cleanup');
		expect(response.status()).toBe(401);
	});

	test('avec CRON_SECRET : purge les sessions expirées', async ({ page, account }) => {
		await signUpAndVerify(page, account);

		try {
			const user = await requireUser(account.email);
			await createExpiredSession(user.id);

			// La session courante (créée par signUpAndVerify) + la session
			// expirée injectée directement en base.
			const before = await countSessions(account.email);
			expect(before).toBeGreaterThanOrEqual(2);

			const response = await page.request.post('/api/jobs/cleanup', {
				headers: CRON_HEADERS
			});
			expect(response.status()).toBe(200);
			const body = await response.json();
			expect(body.ok).toBe(true);
			expect(body.expiredSessions).toBeGreaterThanOrEqual(1);

			// Seule la session expirée disparaît, pas celle en cours.
			const after = await countSessions(account.email);
			expect(after).toBe(before - 1);
		} finally {
			await deleteUser(account.email);
		}
	});
});
