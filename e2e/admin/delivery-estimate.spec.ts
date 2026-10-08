import { test, expect } from '../support/fixtures';
import { waitForPath } from '../support/flows';
import { pageOrigin, signUpAndVerify, sveltekitActionHeaders } from '../support/admin';
import {
	createCatalogProduct,
	createUserAddress,
	deleteCatalogProduct,
	getStoreFeatureFlags,
	promoteToAdmin,
	requireUser,
	setStoreFeatureFlags
} from '../support/db';

/**
 * Délai de livraison estimé (`StoreSettings.estimatedDelivery{Min,Max}Days`)
 * — voir RESTE_A_FAIRE.md. `null` par défaut (rien affiché), vérifie
 * le formulaire admin ET l'affichage réel au checkout (Code conso. L216-1 :
 * communiqué avant validation de commande, pas seulement stocké en base).
 */
test.describe('Admin — délai de livraison', () => {
	test.setTimeout(4 * 60_000);

	test('modifié depuis /admin/livraison, affiché au checkout', async ({ page, account }) => {
		const originalFlags = await getStoreFeatureFlags();
		const created = await createCatalogProduct({ price: 100 });
		const { product } = created;

		try {
			await setStoreFeatureFlags({
				estimatedDeliveryMinDays: null,
				estimatedDeliveryMaxDays: null
			});
			await signUpAndVerify(page, account);
			await promoteToAdmin(account.email);
			const user = await requireUser(account.email);
			await createUserAddress(user.id);
			const origin = pageOrigin(page);

			await test.step('1. Rien affiché tant que non configuré', async () => {
				await page.goto(`/products/${product.slug}`);
				const save = page.waitForResponse(
					(response) =>
						response.url().includes('/api/save-cart') && response.request().method() === 'POST'
				);
				await page.getByRole('button', { name: 'Ajouter au panier' }).click();
				await save;

				await page.goto('/checkout');
				await expect(page.getByText('Livraison estimée')).toHaveCount(0);
			});

			await test.step('2. Formulaire admin : 2 à 4 jours persistés', async () => {
				await page.goto('/admin/livraison');
				await waitForPath(page, '/admin/livraison');

				const response = await page.request.post('/admin/livraison', {
					form: { minDays: '2', maxDays: '4' },
					headers: sveltekitActionHeaders(origin)
				});
				expect(response.status()).toBe(200);

				const flags = await getStoreFeatureFlags();
				expect(flags.estimatedDeliveryMinDays).toBe(2);
				expect(flags.estimatedDeliveryMaxDays).toBe(4);
			});

			await test.step('3. Affiché au checkout une fois configuré', async () => {
				await page.goto('/checkout');
				await expect(page.getByText('Livraison estimée sous 2 à 4 jours ouvrés')).toBeVisible();
			});
		} finally {
			await setStoreFeatureFlags(originalFlags);
			await deleteCatalogProduct(product.id);
		}
	});
});
