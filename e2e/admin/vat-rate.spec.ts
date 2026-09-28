import { test, expect } from '../support/fixtures';
import { waitForPath } from '../support/flows';
import { pageOrigin, signUpAndVerify, sveltekitActionHeaders } from '../support/admin';
import {
	createCatalogProduct,
	deleteCatalogProduct,
	getOrderById,
	getPendingOrder,
	getStoreFeatureFlags,
	promoteToAdmin,
	requireUser,
	setStoreFeatureFlags
} from '../support/db';

/**
 * Taux de TVA configurable (`StoreSettings.vatRate`) — remplace l'ancienne
 * constante figée à 5,5 %, incorrecte pour de la bijouterie (voir
 * CONFORMITE_ECOMMERCE.md). Vérifie le formulaire admin ET la propagation
 * réelle jusqu'au calcul serveur du panier (`updateOrderItems`,
 * `$lib/prisma/order/prendingOrder.ts`), pas seulement la valeur stockée.
 */
test.describe('Admin — taux de TVA', () => {
	test.setTimeout(4 * 60_000);

	test('modifié depuis /admin/tva, propagé au calcul du panier', async ({ page, account }) => {
		const originalFlags = await getStoreFeatureFlags();
		const created = await createCatalogProduct({ price: 100 });
		const { product } = created;

		try {
			await setStoreFeatureFlags({ vatRate: 0.055 });
			await signUpAndVerify(page, account);
			await promoteToAdmin(account.email);
			const user = await requireUser(account.email);
			const origin = pageOrigin(page);

			await test.step('1. Formulaire admin : 20 % persisté', async () => {
				await page.goto('/admin/tva');
				await waitForPath(page, '/admin/tva');

				const response = await page.request.post('/admin/tva', {
					form: { vatRatePercent: '20' },
					headers: sveltekitActionHeaders(origin)
				});
				expect(response.status()).toBe(200);

				const flags = await getStoreFeatureFlags();
				expect(flags.vatRate).toBeCloseTo(0.2, 5);
			});

			await test.step('2. Nouveau produit ajouté au panier : TVA à 20 % appliquée', async () => {
				await page.goto(`/products/${product.slug}`);
				const save = page.waitForResponse(
					(response) =>
						response.url().includes('/api/save-cart') && response.request().method() === 'POST'
				);
				await page.getByRole('button', { name: 'Ajouter au panier' }).click();
				await save;

				const pending = await getPendingOrder(user.id);
				expect(pending).not.toBeNull();
				const order = await getOrderById(pending!.id);
				expect(order?.tax).toBeCloseTo(100 * 0.2, 2);
			});

			await test.step('3. Le tiroir panier affiche le taux réellement configuré (§3.1 audit)', async () => {
				await page.reload();
				await page.getByRole('button', { name: /Voir le panier/ }).click();
				await expect(page.getByText('TVA (20 %) :')).toBeVisible();
			});
		} finally {
			await setStoreFeatureFlags(originalFlags);
			await deleteCatalogProduct(product.id);
		}
	});
});
