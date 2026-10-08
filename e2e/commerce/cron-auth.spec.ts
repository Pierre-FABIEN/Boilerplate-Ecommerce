import { test, expect } from '../support/fixtures';

/**
 * Garde d'authentification des routes cron QStash-only — `loyalty-check`,
 * `stock-alerts`, `invoice-email` (`src/routes/api/jobs/*`). Contrairement à
 * `cleanup.spec.ts`/`cart-recovery.spec.ts`, ces routes n'ont **pas** de
 * repli `CRON_SECRET` : seule la signature `upstash-signature` est acceptée
 * (`getQStashReceiver().verify(...)`). QStash n'étant pas configuré en
 * environnement de test, seul le chemin de refus (401, en-tête manquant) est
 * testable ici — le chemin nominal nécessiterait une vraie signature QStash.
 */
test.describe('Routes cron QStash — garde d’authentification', () => {
	test('loyalty-check sans en-tête : refusé', async ({ page }) => {
		const response = await page.request.post('/api/jobs/loyalty-check', {
			data: { orderId: 'whatever' }
		});
		expect(response.status()).toBe(401);
	});

	test('stock-alerts sans en-tête : refusé', async ({ page }) => {
		const response = await page.request.post('/api/jobs/stock-alerts', {
			data: { productId: 'whatever' }
		});
		expect(response.status()).toBe(401);
	});

	test('invoice-email sans en-tête : refusé', async ({ page }) => {
		const response = await page.request.post('/api/jobs/invoice-email', {
			data: { transactionId: 'whatever' }
		});
		expect(response.status()).toBe(401);
	});
});
