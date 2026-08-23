import { test, expect } from '../support/fixtures';
import { signUpAndVerify } from '../support/admin';
import {
	checkoutSessionCompletedPayload,
	signStripePayload
} from '../support/stripe';
import {
	attachOrderAddress,
	createCatalogProduct,
	createUserAddress,
	deleteCatalogProduct,
	deleteTransaction,
	getOrderById,
	getTransactionByStripePaymentId,
	linkProductToOrder,
	promoteToAdmin,
	requireUser
} from '../support/db';
import { clearMailbox, waitForEmailContaining } from '../support/mailbox';

/**
 * Webhook Stripe signé + pages facture / bordereau.
 *
 * Pas de paiement réel : le corps est signé localement avec le secret e2e.
 */
test.describe('Commerce — webhook Stripe', () => {
	test.setTimeout(6 * 60_000);

	test('signature, paiement, facture et bordereau', async ({ page, account }) => {
		await test.step('1. Signature invalide', async () => {
			const sessionId = `e2e-cs-bad-${Date.now()}`;
			const payload = checkoutSessionCompletedPayload({
				sessionId,
				orderId: 'missing',
				email: account.email
			});
			const response = await page.request.post('/api/webhooks', {
				headers: {
					'content-type': 'application/json',
					'stripe-signature': 't=1,v1=deadbeef'
				},
				data: payload
			});
			expect(response.status()).toBe(400);
			expect(await getTransactionByStripePaymentId(sessionId)).toBeNull();
		});

		const created = await createCatalogProduct();
		const { product } = created;
		const sessionId = `e2e-cs-${Date.now()}`;
		let transactionId: string | undefined;

		try {
			await signUpAndVerify(page, account);
			const user = await requireUser(account.email);
			const address = await createUserAddress(user.id);
			const linked = await linkProductToOrder(user.id, product.id);
			await attachOrderAddress(linked.order.id, address.id);

			await test.step('2. checkout.session.completed signé', async () => {
				await clearMailbox();
				const payload = checkoutSessionCompletedPayload({
					sessionId,
					orderId: linked.order.id,
					email: account.email
				});
				const response = await page.request.post('/api/webhooks', {
					headers: {
						'content-type': 'application/json',
						'stripe-signature': signStripePayload(payload)
					},
					data: payload
				});
				expect(response.status()).toBe(200);
				expect(await response.json()).toEqual({ received: true });

				const paid = await getOrderById(linked.order.id);
				expect(paid?.status).toBe('PAID');

				const transaction = await getTransactionByStripePaymentId(sessionId);
				expect(transaction).not.toBeNull();
				expect(transaction?.orderId).toBe(linked.order.id);
				expect(transaction?.amount).toBeCloseTo(12.5, 2);
				expect(transaction?.status).toBe('paid');
				transactionId = transaction!.id;
			});

			await test.step('3. Facture compte + PDF + e-mail', async () => {
				const response = await page.request.get(`/auth/settings/factures/${transactionId}`);
				expect(response.status()).toBe(200);
				expect(await response.text()).toContain(transactionId!);

				const pdf = await page.request.get(`/auth/settings/factures/${transactionId}/pdf`);
				expect(pdf.status()).toBe(200);
				expect(pdf.headers()['content-type']).toContain('application/pdf');
				expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF');

				const mail = await waitForEmailContaining(account.email, 'Votre facture');
				expect(mail.raw).toContain(transactionId);
			});

			await promoteToAdmin(account.email);

			await test.step('4. Facture admin', async () => {
				const response = await page.request.get(`/admin/sales/facture/${transactionId}`);
				expect(response.status()).toBe(200);
				expect(await response.text()).toContain(transactionId!);

				const pdf = await page.request.get(`/admin/sales/facture/${transactionId}/pdf`);
				expect(pdf.status()).toBe(200);
				expect(pdf.headers()['content-type']).toContain('application/pdf');
			});

			await test.step('5. Bordereau admin', async () => {
				const response = await page.request.get(`/admin/sales/bordereau/${transactionId}`);
				expect(response.status()).toBe(200);
				expect(await response.text()).toContain(transactionId!);

				const pdf = await page.request.get(`/admin/sales/bordereau/${transactionId}/pdf`);
				expect(pdf.status()).toBe(200);
				expect(pdf.headers()['content-type']).toContain('application/pdf');
			});
		} finally {
			if (transactionId) {
				await deleteTransaction(transactionId);
			}
			await deleteCatalogProduct(product.id);
		}
	});
});
