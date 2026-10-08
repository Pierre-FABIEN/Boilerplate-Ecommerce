import { test, expect } from '../support/fixtures';
import { pageOrigin, signUpAndVerify, sveltekitActionHeaders } from '../support/admin';
import { db, deleteUser, requireUser } from '../support/db';

/**
 * `auth/settings` → `marketingEmailsOptIn` (RGPD opt-in) : bascule un simple
 * booléen sans body (`event.locals.user` suffit), jamais vérifié par aucun
 * autre test — une inversion de ce champ ne serait détectée par rien.
 *
 * Anonyme : le `load()` de la page redirige vers `/auth/login` avant même
 * d'atteindre l'action (`event.locals.user === null`) ; pour un POST via
 * `page.request` (pas une navigation), SvelteKit sérialise ce `redirect()`
 * en 200 JSON `{ type: 'redirect', status, location }` plutôt qu'un vrai
 * 401/303 HTTP — confirmé en conditions réelles (voir
 * `fraud-detection.spec.ts`, même mécanisme).
 */
test.describe('Auth — settings', () => {
	test.setTimeout(6 * 60_000);

	test('marketingEmailsOptIn : anonyme redirigé, bascule, revert', async ({ page, account }) => {
		try {
			await test.step('1. Anonyme : redirigé vers /auth/login', async () => {
				await page.goto('/');
				const response = await page.request.post('/auth/settings?/marketingEmailsOptIn', {
					headers: sveltekitActionHeaders(pageOrigin(page))
				});
				expect(response.status()).toBe(200);
				const body = await response.json();
				expect(body.type).toBe('redirect');
				expect(body.location).toBe('/auth/login');
			});

			await signUpAndVerify(page, account);
			const user = await requireUser(account.email);
			const origin = pageOrigin(page);

			await test.step('2. Valeur par défaut : false (opt-in jamais présumé)', async () => {
				const fresh = await db.user.findUniqueOrThrow({ where: { id: user.id } });
				expect(fresh.marketingEmailsOptIn).toBe(false);
			});

			await test.step('3. Première bascule : true', async () => {
				const response = await page.request.post('/auth/settings?/marketingEmailsOptIn', {
					form: {},
					headers: sveltekitActionHeaders(origin)
				});
				expect(response.ok()).toBe(true);

				const updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
				expect(updated.marketingEmailsOptIn).toBe(true);
			});

			await test.step('4. Seconde bascule : retour à false', async () => {
				const response = await page.request.post('/auth/settings?/marketingEmailsOptIn', {
					form: {},
					headers: sveltekitActionHeaders(origin)
				});
				expect(response.ok()).toBe(true);

				const updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
				expect(updated.marketingEmailsOptIn).toBe(false);
			});
		} finally {
			await deleteUser(account.email);
		}
	});
});
