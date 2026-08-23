import { test, expect } from '../support/fixtures';
import { expectMessage, waitForPath } from '../support/flows';
import { pageOrigin, sveltekitActionHeaders } from '../support/admin';
import {
	countContactMessagesByEmail,
	deleteContactMessagesByEmail
} from '../support/db';

const validPayload = (email: string) => ({
	__superform_id: 'contactForm',
	name: 'Pierre Test',
	email,
	subject: 'Demande e2e contact',
	message: 'Bonjour, ceci est un message de test assez long.'
});

/**
 * Formulaire public : envoi, refus serveur, limiteur par IP.
 */
test.describe('Contact — formulaire', () => {
	test.setTimeout(6 * 60_000);

	test('envoi valide, refus serveur et limiteur', async ({ page, account }) => {
		const email = account.email.replace('@', '+contact@');

		try {
			await test.step('1. Envoi valide', async () => {
				await page.goto('/contact');
				await waitForPath(page, '/contact');
				await expect(page.getByRole('heading', { name: 'Contact' })).toBeVisible();

				await page.locator('input[name="name"]').fill(validPayload(email).name);
				await page.locator('input[name="email"]').fill(email);
				await page.locator('input[name="subject"]').fill(validPayload(email).subject);
				await page.locator('textarea[name="message"]').fill(validPayload(email).message);

				const sent = page.waitForResponse(
					(response) =>
						response.url().includes('?/send') && response.request().method() === 'POST'
				);
				await page.getByRole('button', { name: 'Envoyer' }).click();
				await sent;
				await expectMessage(page, 'Message envoyé');
				expect(await countContactMessagesByEmail(email)).toBe(1);
			});

			await test.step('2. Email invalide (serveur)', async () => {
				const headers = sveltekitActionHeaders(pageOrigin(page));
				const before = await countContactMessagesByEmail(email);
				const response = await page.request.post('/contact?/send', {
					form: {
						__superform_id: 'contactForm',
						name: 'Pierre Test',
						email: 'pas-un-email',
						subject: 'Demande e2e contact',
						message: 'Bonjour, ceci est un message de test assez long.'
					},
					headers
				});
				const body = await response.text();
				expect(await countContactMessagesByEmail(email)).toBe(before);
				// fail(400) sans `x-sveltekit-action` re-rend la page en 200 HTML.
				expect(
					response.status() === 400 ||
						body.includes('"type":"failure"') ||
						body.includes("n'est pas valide")
				).toBeTruthy();
			});

			await test.step('3. Limiteur', async () => {
				const headers = sveltekitActionHeaders(pageOrigin(page));
				const payload = validPayload(email);
				for (let i = 0; i < 4; i++) {
					const response = await page.request.post('/contact?/send', {
						form: payload,
						headers
					});
					expect(response.status()).toBeLessThan(400);
				}
				const blocked = await page.request.post('/contact?/send', {
					form: payload,
					headers
				});
				const blockedBody = await blocked.text();
				expect(
					blocked.status() === 429 || blockedBody.includes('Too many requests')
				).toBeTruthy();
				expect(await countContactMessagesByEmail(email)).toBe(5);
			});
		} finally {
			await deleteContactMessagesByEmail(email);
		}
	});
});
