import { test, expect } from '../support/fixtures';
import { waitForPath } from '../support/flows';
import { pageOrigin, signUpAndVerify, sveltekitActionHeaders } from '../support/admin';
import { hasLiveSendcloud } from '../support/third-party';
import {
	createCatalogProduct,
	createUserAddress,
	deleteCatalogProduct,
	getOrderById,
	getPendingOrder,
	requireUser
} from '../support/db';

const SHIPPING_BODY = {
	from_country_code: 'FR',
	to_country_code: 'FR',
	from_postal_code: '31000',
	to_postal_code: '31500',
	weight: { value: 1, unit: 'kilogram' as const },
	prefer_service_point: true,
	max_per_type: 5
};

type ShippingOption = { id: string; type: string; price?: number };

/**
 * Appels Sendcloud réels (options + points relais). Les étiquettes restent
 * coupées sur le webhook tant que `PUBLIC_ENV=test`.
 */
test.describe('Live — Sendcloud', () => {
	test.setTimeout(6 * 60_000);
	test.use({ navigationTimeout: 180_000 });
	test.skip(!hasLiveSendcloud(), 'SENDCLOUD_* factices : pas d’appel Sendcloud');

	test('options, points relais, persistance checkout', async ({ page, account }) => {
		let shipping: { data?: ShippingOption[] } = {};
		let servicePoints: Array<{
			id: number | string;
			latitude?: number;
			longitude?: number;
			shop_type?: string;
			extra_data?: { shop_ref?: string; ref_cab?: string };
		}> = [];

		await test.step('1. POST /api/sendcloud/shipping-options', async () => {
			const response = await page.request.post('/api/sendcloud/shipping-options', {
				data: SHIPPING_BODY
			});
			expect(response.status()).toBe(200);
			shipping = (await response.json()) as { data?: ShippingOption[] };
			expect(shipping.data?.length).toBeGreaterThan(0);
		});

		await test.step('2. POST /api/sendcloud/service-points', async () => {
			const response = await page.request.post('/api/sendcloud/service-points', {
				data: { to_country_code: 'FR', to_postal_code: '31000', radius: 20000 }
			});
			expect(response.status()).toBe(200);
			const body = await response.json();
			servicePoints = Array.isArray(body) ? body : (body.data ?? []);
			expect(servicePoints.length).toBeGreaterThan(0);
		});

		const created = await createCatalogProduct();
		const { product } = created;

		try {
			await signUpAndVerify(page, account);
			const user = await requireUser(account.email);
			const address = await createUserAddress(user.id);
			const origin = pageOrigin(page);

			await test.step('3. Checkout UI : options après adresse', async () => {
				await page.goto(`/products/${product.slug}`);
				const save = page.waitForResponse(
					(response) =>
						response.url().includes('/api/save-cart') && response.request().method() === 'POST'
				);
				await page.getByRole('button', { name: 'Ajouter au panier' }).click();
				await save;

				await page.goto('/checkout');
				await waitForPath(page, '/checkout');

				await page.getByRole('combobox').click();
				await page.getByText('E2e Tester').first().click();

				await expect(page.getByText('Options de livraison')).toBeVisible({ timeout: 30_000 });
			});

			const relayOption = shipping.data?.find((option) => option.type === 'service_point');
			if (!relayOption || !servicePoints[0]) return;

			await test.step('4. Point relais persisté (shippingCost 0, pas d’étiquette)', async () => {
				const relayRadios = page.locator('input[type="radio"][name="shippingOption"]');
				if ((await relayRadios.count()) > 0) {
					await relayRadios.first().click({ force: true });
				}

				const pending = await getPendingOrder(user.id);
				expect(pending).not.toBeNull();
				const point = servicePoints[0];

				await page.request.post('/checkout?/checkout', {
					form: {
						orderId: pending!.id,
						addressId: address.id,
						shippingOption: relayOption.id,
						shippingCost: '0',
						servicePointId: String(point.id),
						servicePointPostNumber: point.extra_data?.shop_ref ?? '',
						servicePointLatitude: String(point.latitude ?? ''),
						servicePointLongitude: String(point.longitude ?? ''),
						servicePointType: point.shop_type ?? '',
						servicePointExtraRefCab: point.extra_data?.ref_cab ?? '',
						servicePointExtraShopRef: point.extra_data?.shop_ref ?? ''
					},
					headers: sveltekitActionHeaders(origin),
					maxRedirects: 0
				});

				const saved = await getOrderById(pending!.id);
				expect(saved?.servicePointId).toBe(String(point.id));
				expect(saved?.shippingOption).toBe(relayOption.id);
			});
		} finally {
			await deleteCatalogProduct(product.id);
		}
	});
});
