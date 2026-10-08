import { test, expect } from '../support/fixtures';
import { waitForPath } from '../support/flows';
import { signUpAndVerify } from '../support/admin';
import {
	createCatalogProduct,
	deleteCatalogProduct,
	deleteTransaction,
	getReturnRequestByTransactionId,
	getStoreFeatureFlags,
	linkProductToOrder,
	promoteToAdmin,
	requireUser,
	setStoreFeatureFlags,
	simulatePaidOrder
} from '../support/db';

/**
 * Rétractation légale (14 jours, sans motif) vs retour SAV — voir
 * RESTE_A_FAIRE.md. L'option de rétractation n'est proposée que si
 * `Transaction.shippingOption !== 'no_shipping'` (commande sur-mesure
 * exclue par la loi, art. L221-28, 3°).
 */
test.describe('Retours — rétractation légale vs SAV', () => {
	test.setTimeout(6 * 60_000);

	test('commande livrable : rétractation proposée, acceptée sans motif', async ({
		page,
		account
	}) => {
		const originalFlags = await getStoreFeatureFlags();
		const created = await createCatalogProduct();
		const { product } = created;
		let transactionId: string | undefined;

		try {
			await setStoreFeatureFlags({ returnsEnabled: true });
			await signUpAndVerify(page, account);
			const user = await requireUser(account.email);
			const linked = await linkProductToOrder(user.id, product.id);
			const sale = await simulatePaidOrder(linked.order.id, user.id, account.email, {
				shippingOption: 'colissimo:home/fr'
			});
			transactionId = sale.id;

			await test.step('1. Option rétractation visible, sélectionnée par défaut', async () => {
				await page.goto(`/auth/settings/returns/${transactionId}`);
				await expect(page.locator('#kind-withdrawal')).toBeVisible();
				await expect(page.locator('#kind-withdrawal')).toHaveAttribute('data-state', 'checked');
				await expect(page.locator('textarea[name="reason"]')).not.toHaveAttribute('required');
			});

			await test.step('2. Envoyée sans motif : acceptée', async () => {
				await page.getByRole('button', { name: 'Envoyer la demande' }).click();
				await expect(page.getByText('En attente de traitement')).toBeVisible();

				const request = await getReturnRequestByTransactionId(transactionId!);
				expect(request?.kind).toBe('WITHDRAWAL');
			});

			await test.step('3. Visible avec le bon type dans /admin/returns', async () => {
				await promoteToAdmin(account.email);
				await page.goto('/admin/returns');
				await waitForPath(page, '/admin/returns');
				await expect(page.getByText('Rétractation (14j)')).toBeVisible();
			});
		} finally {
			await setStoreFeatureFlags(originalFlags);
			if (transactionId) await deleteTransaction(transactionId);
			await deleteCatalogProduct(product.id);
		}
	});

	test('commande sur-mesure : rétractation masquée, motif requis', async ({ page, account }) => {
		const originalFlags = await getStoreFeatureFlags();
		const created = await createCatalogProduct();
		const { product } = created;
		let transactionId: string | undefined;

		try {
			await setStoreFeatureFlags({ returnsEnabled: true });
			await signUpAndVerify(page, account);
			const user = await requireUser(account.email);
			const linked = await linkProductToOrder(user.id, product.id);
			// `simulatePaidOrder` sans override : `shippingOption: 'no_shipping'`
			// par défaut, exactement le signal d'une commande sur-mesure.
			const sale = await simulatePaidOrder(linked.order.id, user.id, account.email);
			transactionId = sale.id;

			await page.goto(`/auth/settings/returns/${transactionId}`);
			await expect(page.locator('#kind-withdrawal')).toHaveCount(0);
			await expect(page.getByText('exclue du droit de rétractation légal')).toBeVisible();
			await expect(page.locator('textarea[name="reason"]')).toHaveAttribute('required', '');

			await page.locator('textarea[name="reason"]').fill('Gravure incorrecte.');
			await page.getByRole('button', { name: 'Envoyer la demande' }).click();
			await expect(page.getByText('En attente de traitement')).toBeVisible();

			const request = await getReturnRequestByTransactionId(transactionId!);
			expect(request?.kind).toBe('WARRANTY');
		} finally {
			await setStoreFeatureFlags(originalFlags);
			if (transactionId) await deleteTransaction(transactionId);
			await deleteCatalogProduct(product.id);
		}
	});
});
