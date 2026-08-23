import { test, expect } from '../support/fixtures';
import { waitForPath } from '../support/flows';
import { signUpAndVerify } from '../support/admin';
import { postValidatePromo } from '../support/promo';
import {
	createCatalogProduct,
	createPromoCode,
	deleteCatalogProduct,
	deletePromoCode
} from '../support/db';

/**
 * Contrat `validatePromo` via l'API, puis application UI au checkout.
 * Stripe n'est pas appelé : `incrementUsage` reste hors de ce spec.
 */
test.describe('Promo — validation', () => {
	test.setTimeout(6 * 60_000);

	test('API : accepté, inconnu, inactif, expiré, seuils', async ({ page }) => {
		const stamp = Date.now().toString(36).toUpperCase();
		const ok = await createPromoCode(`E2EOK${stamp}`, { type: 'PERCENTAGE', value: 10 });
		const inactive = await createPromoCode(`E2EIN${stamp}`, { active: false });
		const expired = await createPromoCode(`E2EEX${stamp}`, {
			expiresAt: new Date(Date.now() - 60_000)
		});
		const minAmount = await createPromoCode(`E2EMN${stamp}`, { minAmount: 50 });
		const exhausted = await createPromoCode(`E2ELM${stamp}`, {
			usageLimit: 1,
			usageCount: 1
		});

		try {
			await page.goto('/');

			await test.step('1. Pourcentage accepté', async () => {
				const { status, json } = await postValidatePromo(page, {
					code: ok.code,
					productTotalTTC: 100
				});
				expect(status).toBe(200);
				expect(json.valid).toBe(true);
				expect(json.discountAmount).toBeCloseTo(10, 2);
				expect(json.code).toBe(ok.code);
			});

			await test.step('2. Code inconnu / inactif / expiré', async () => {
				const unknown = await postValidatePromo(page, {
					code: 'INCONNU-E2E',
					productTotalTTC: 100
				});
				expect(unknown.json.valid).toBe(false);

				const off = await postValidatePromo(page, {
					code: inactive.code,
					productTotalTTC: 100
				});
				expect(off.json.valid).toBe(false);
				expect(String(off.json.reason)).toMatch(/inactif/i);

				const past = await postValidatePromo(page, {
					code: expired.code,
					productTotalTTC: 100
				});
				expect(past.json.valid).toBe(false);
				expect(String(past.json.reason)).toMatch(/expiré/i);
			});

			await test.step('3. Montant min. et limite d’usage', async () => {
				const tooSmall = await postValidatePromo(page, {
					code: minAmount.code,
					productTotalTTC: 20
				});
				expect(tooSmall.json.valid).toBe(false);
				expect(String(tooSmall.json.reason)).toMatch(/minimum/i);

				const full = await postValidatePromo(page, {
					code: exhausted.code,
					productTotalTTC: 100
				});
				expect(full.json.valid).toBe(false);
				expect(String(full.json.reason)).toMatch(/limite/i);
			});
		} finally {
			await deletePromoCode(ok.id);
			await deletePromoCode(inactive.id);
			await deletePromoCode(expired.id);
			await deletePromoCode(minAmount.id);
			await deletePromoCode(exhausted.id);
		}
	});

	test('checkout : code appliqué ou refusé', async ({ page, account }) => {
		const stamp = Date.now().toString(36).toUpperCase();
		const promo = await createPromoCode(`E2ECK${stamp}`, { type: 'PERCENTAGE', value: 10 });
		const created = await createCatalogProduct();

		try {
			await page.goto('/');
			await expect(page.locator('body')).toBeVisible();

			await signUpAndVerify(page, account);
			await page.goto(`/products/${created.product.slug}`);
			await expect(page.getByRole('button', { name: 'Ajouter au panier' })).toBeVisible();
			const save = page.waitForResponse(
				(response) =>
					response.url().includes('/api/save-cart') && response.request().method() === 'POST'
			);
			await page.getByRole('button', { name: 'Ajouter au panier' }).click();
			await save;

			await page.goto('/checkout', { waitUntil: 'domcontentloaded' });
			await waitForPath(page, '/checkout');
			await expect(page.getByRole('heading', { name: 'Code promo' })).toBeVisible({
				timeout: 60_000
			});

			await test.step('4. Checkout : code appliqué', async () => {
				await page.getByPlaceholder('Entrez votre code').fill(promo.code);
				const validate = page.waitForResponse(
					(response) =>
						response.url().includes('/api/promo/validate') && response.request().method() === 'POST'
				);
				await page.getByRole('button', { name: 'Appliquer' }).click();
				await validate;
				await expect(page.getByText(promo.code, { exact: true })).toBeVisible();
				await expect(page.getByText(/Remise de /)).toBeVisible();
			});

			await test.step('5. Checkout : code refusé', async () => {
				await page.getByRole('button', { name: 'Retirer le code promo' }).click();
				await page.getByPlaceholder('Entrez votre code').fill('FAUX-E2E');
				const validate = page.waitForResponse(
					(response) =>
						response.url().includes('/api/promo/validate') && response.request().method() === 'POST'
				);
				await page.getByRole('button', { name: 'Appliquer' }).click();
				await validate;
				await expect(page.getByPlaceholder('Entrez votre code')).toBeVisible();
				await expect(page.getByText(promo.code, { exact: true })).toHaveCount(0);
			});
		} finally {
			await deletePromoCode(promo.id);
			await deleteCatalogProduct(created.product.id);
		}
	});
});
