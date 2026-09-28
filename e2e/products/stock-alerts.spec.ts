import { test, expect } from '../support/fixtures';
import { signUpAndVerify } from '../support/admin';
import { waitForPath, waitForAppReady } from '../support/flows';
import {
	createCatalogProduct,
	deleteCatalogProduct,
	getStockAlert,
	getStoreFeatureFlags,
	promoteToAdmin,
	requireUser,
	setStoreFeatureFlags
} from '../support/db';
import { waitForEmailContaining } from '../support/mailbox';

/**
 * Alertes réassort : bouton « Me prévenir » sur une fiche produit en rupture
 * (`Product.stock <= 0`), file d'attente en base (`StockAlert`, un compte —
 * pas un simple e-mail anonyme, même patron que le module Questions produit
 * déjà en place). La vente décrémente désormais le stock (webhook Stripe),
 * mais ne repasse jamais un produit de rupture à disponible — le seul
 * déclencheur possible pour la notification de réassort reste donc une
 * édition admin qui fait repasser le stock au-dessus de 0
 * (`updateProductById`), qui enfile alors
 * `$lib/server/jobs/stockAlerts.ts` — en fallback synchrone dans la requête
 * admin quand QStash n'est pas configuré (cas e2e).
 *
 * `StoreSettings` est une ligne unique partagée par toute la suite : les
 * valeurs d'origine sont restaurées en `finally`.
 */
test.describe('Alertes réassort', () => {
	test.setTimeout(4 * 60_000);

	test('module désactivé : pas de bouton, inscription refusée', async ({ page, account }) => {
		const originalFlags = await getStoreFeatureFlags();
		const created = await createCatalogProduct({ stock: 0 });
		const { product } = created;

		try {
			await setStoreFeatureFlags({ stockAlertsEnabled: false });

			await signUpAndVerify(page, account);
			await page.goto(`/products/${product.slug}`);

			await expect(page.getByRole('button', { name: 'Me prévenir' })).not.toBeVisible();

			const res = await page.request.post('/api/stock-alerts', {
				data: { productId: product.id }
			});
			expect(res.status()).toBe(404);
		} finally {
			await setStoreFeatureFlags(originalFlags);
			await deleteCatalogProduct(product.id);
		}
	});

	test('inscription en rupture puis e-mail au réassort admin', async ({ page, account }) => {
		const originalFlags = await getStoreFeatureFlags();
		const created = await createCatalogProduct({ stock: 0 });
		const { product } = created;

		try {
			await setStoreFeatureFlags({ stockAlertsEnabled: true });

			await signUpAndVerify(page, account);
			await promoteToAdmin(account.email);

			await test.step('1. Inscription à la file via « Me prévenir »', async () => {
				await page.goto(`/products/${product.slug}`);
				await page.getByRole('button', { name: 'Me prévenir' }).click();
				await expect(page.getByRole('button', { name: 'Vous serez prévenu' })).toBeVisible();

				const subscriber = await requireUser(account.email);
				const alert = await getStockAlert(product.id, subscriber.id);
				expect(alert?.notifiedAt).toBeNull();
			});

			await test.step('2. Réassort admin déclenche la notification', async () => {
				await page.goto(`/admin/products/${product.id}`, { waitUntil: 'domcontentloaded' });
				await waitForAppReady(page);
				await expect(page.getByText('Price', { exact: true })).toBeVisible({ timeout: 30_000 });
				await page.locator('input[name="stock"]').fill('5');
				await page.getByRole('button', { name: 'Save changes' }).click();
				await waitForPath(page, '/admin/products');

				await waitForEmailContaining(account.email, product.name);

				const user = await requireUser(account.email);
				const alert = await getStockAlert(product.id, user.id);
				expect(alert?.notifiedAt).not.toBeNull();
			});
		} finally {
			await setStoreFeatureFlags(originalFlags);
			await deleteCatalogProduct(product.id);
		}
	});
});
