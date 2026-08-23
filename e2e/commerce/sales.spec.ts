import { test, expect } from '../support/fixtures';
import { waitForPath } from '../support/flows';
import { signUpAndVerify } from '../support/admin';
import {
	createCatalogProduct,
	deleteCatalogProduct,
	deleteTransaction,
	deleteUser,
	linkProductToOrder,
	occupyEmail,
	promoteToAdmin,
	requireUser,
	simulatePaidOrder
} from '../support/db';

/**
 * Ventes admin + facture compte (IDOR).
 */
test.describe('Commerce — ventes', () => {
	test.setTimeout(6 * 60_000);

	test('ADMIN voit la vente ; CLIENT est renvoyé', async ({ page, account }) => {
		const created = await createCatalogProduct();
		const { product } = created;
		const ownerEmail = `e2e-commerce-sale-${Date.now()}@example.test`;

		await occupyEmail(ownerEmail);
		const owner = await requireUser(ownerEmail);
		const linked = await linkProductToOrder(owner.id, product.id);
		const sale = await simulatePaidOrder(linked.order.id, owner.id, ownerEmail);

		try {
			await signUpAndVerify(page, account);

			await test.step('2. CLIENT GET /admin/sales', async () => {
				await page.goto('/admin/sales');
				await waitForPath(page, '/');
			});

			await promoteToAdmin(account.email);

			await test.step('1. ADMIN voit la transaction', async () => {
				await page.goto('/admin/sales');
				await waitForPath(page, '/admin/sales');
				await expect(page.getByRole('heading', { name: 'Ventes' })).toBeVisible();
				const search = page.getByPlaceholder('Cherchez dans le tableau');
				await search.fill(ownerEmail);
				await expect(page.getByRole('cell', { name: ownerEmail })).toBeVisible();
			});
		} finally {
			await deleteTransaction(sale.id);
			await deleteUser(ownerEmail);
			await deleteCatalogProduct(product.id);
		}
	});

	test('facture user : uniquement la sienne', async ({ page, account }) => {
		const created = await createCatalogProduct();
		const { product } = created;
		const otherEmail = `e2e-commerce-facture-${Date.now()}@example.test`;
		await occupyEmail(otherEmail);
		const other = await requireUser(otherEmail);
		const linked = await linkProductToOrder(other.id, product.id);
		const otherSale = await simulatePaidOrder(linked.order.id, other.id, otherEmail);

		try {
			await signUpAndVerify(page, account);
			const response = await page.goto(`/auth/settings/factures/${otherSale.id}`);
			expect(response?.status()).toBe(404);
		} finally {
			await deleteTransaction(otherSale.id);
			await deleteUser(otherEmail);
			await deleteCatalogProduct(product.id);
		}
	});
});
