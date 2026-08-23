import { test, expect } from '../support/fixtures';
import { sessionCookie, waitForPath } from '../support/flows';
import { deleteUser, requireUser } from '../support/db';
import { hasLiveGoogleOAuth } from '../support/third-party';

/**
 * Connexion Google : départ réel vers accounts.google.com.
 * Le callback sans écran Google n'existe que si GOOGLE_CLIENT_ID est factice.
 */
test.describe('Auth — Google OAuth', () => {
	test.setTimeout(6 * 60_000);

	test('lien, état invalide, départ (et callback e2e si clés factices)', async ({
		page,
		account
	}) => {
		await test.step('1. La page login expose le lien Google', async () => {
			await page.goto('/auth/login');
			await expect(page.getByRole('link', { name: 'Sign in with Google' })).toHaveAttribute(
				'href',
				'/auth/login/google'
			);
		});

		await test.step('2. Callback sans cookies PKCE', async () => {
			const response = await page.request.get(
				'/auth/login/google/callback?code=e2e-oauth&state=nope&email=' +
					encodeURIComponent(account.email)
			);
			expect(response.status()).toBe(400);
		});

		await test.step('3. Départ OAuth vers Google', async () => {
			const start = await page.request.get('/auth/login/google', { maxRedirects: 0 });
			expect(start.status()).toBe(302);
			const location = start.headers()['location'] ?? '';
			expect(location).toContain('accounts.google.com');
			expect(location).toContain('client_id=');

			if (hasLiveGoogleOAuth()) {
				return;
			}

			const cookies = await page.context().cookies();
			const state = cookies.find((cookie) => cookie.name === 'google_oauth_state')?.value;
			expect(state).toBeTruthy();

			const oauthEmail = `e2e-oauth-${Date.now()}@example.test`;
			try {
				await page.goto(
					`/auth/login/google/callback?code=e2e-oauth&state=${state}&email=${encodeURIComponent(oauthEmail)}`
				);
				await waitForPath(page, '/');
				expect(await sessionCookie(page)).not.toBeNull();

				const user = await requireUser(oauthEmail);
				expect(user.googleId).toBe(`e2e-google-${oauthEmail}`);
				expect(user.emailVerified).toBe(true);
				expect(user.passwordHash).toBeNull();
			} finally {
				await deleteUser(oauthEmail);
			}
		});
	});
});
