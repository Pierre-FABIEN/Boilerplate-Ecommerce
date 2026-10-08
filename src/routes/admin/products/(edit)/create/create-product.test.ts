import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `?/createProduct` n'avait de couverture que via `e2e/live/cloudinary.spec.ts`
 * (`test.skip` hors `CLOUDINARY_*` réels — jamais exécuté en CI). Ce test
 * stub Cloudinary et Prisma pour exercer la logique métier de l'action
 * (slug, garde admin, validation des taxonomies, prix barré, échec d'upload)
 * sans dépendance externe.
 */

const cloudinaryUpload = vi.fn();
const createProductMock = vi.fn();
const connectProductToTaxonomyValuesMock = vi.fn();
const getTaxonomyValuesByIdsMock = vi.fn();

vi.mock('$lib/server/cloudinary', () => ({
	default: { uploader: { upload: (...args: unknown[]) => cloudinaryUpload(...args) } }
}));

vi.mock('$lib/prisma/products/products', () => ({
	createProduct: (...args: unknown[]) => createProductMock(...args),
	connectProductToTaxonomyValues: (...args: unknown[]) =>
		connectProductToTaxonomyValuesMock(...args)
}));

vi.mock('$lib/prisma/taxonomies/taxonomyValues', () => ({
	getTaxonomyValuesByIds: (...args: unknown[]) => getTaxonomyValuesByIdsMock(...args)
}));

const PNG_1x1 = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64'
);

function validFormData(overrides?: Record<string, string>) {
	const formData = new FormData();
	formData.set('name', 'Bague e2e test');
	formData.set('description', 'Une description suffisamment longue.');
	formData.set('price', '99.9');
	formData.set('stock', '3');
	formData.set('colorProduct', '#112233');
	formData.set('compareAtPrice', overrides?.compareAtPrice ?? '0');
	formData.append('images', new File([PNG_1x1], 'e2e.png', { type: 'image/png' }));
	for (const [key, value] of Object.entries(overrides ?? {})) {
		if (key === 'compareAtPrice') continue;
		formData.set(key, value);
	}
	return formData;
}

function fakeEvent(formData: FormData, locals: Record<string, unknown> = adminLocals) {
	return {
		request: { formData: async () => formData },
		locals
	};
}

const adminLocals = { user: { id: 'admin-1' }, role: 'ADMIN' };

function isActionFailure(value: unknown): value is { status: number; data?: unknown } {
	return typeof value === 'object' && value !== null && 'status' in value;
}

beforeEach(() => {
	vi.clearAllMocks();
	cloudinaryUpload.mockResolvedValue({ secure_url: 'https://cloudinary.test/fake.png' });
	createProductMock.mockResolvedValue({ id: 'product-1' });
	connectProductToTaxonomyValuesMock.mockResolvedValue({ count: 1 });
	getTaxonomyValuesByIdsMock.mockResolvedValue([{ id: 'tax-1' }]);
});

describe('admin/products create — ?/createProduct', () => {
	it('refuse un visiteur non-admin (403), sans toucher Cloudinary ni Prisma', async () => {
		const { actions } = await import('./+page.server');
		const formData = validFormData();

		await expect(
			// @ts-expect-error minimal fake RequestEvent
			actions.createProduct(fakeEvent(formData, { user: null, role: null }))
		).rejects.toMatchObject({ status: 403 });

		expect(cloudinaryUpload).not.toHaveBeenCalled();
		expect(createProductMock).not.toHaveBeenCalled();
	});

	it('crée le produit : slug dérivé du nom, image uploadée, taxonomies liées', async () => {
		const { actions } = await import('./+page.server');
		const formData = validFormData({ taxonomyValueIds: 'tax-1' });

		// @ts-expect-error minimal fake RequestEvent
		const result = await actions.createProduct(fakeEvent(formData));

		expect(isActionFailure(result)).toBe(false);
		expect(cloudinaryUpload).toHaveBeenCalledTimes(1);
		expect(cloudinaryUpload.mock.calls[0][0]).toMatch(/^data:image\/png;base64,/);

		expect(createProductMock).toHaveBeenCalledTimes(1);
		const productData = createProductMock.mock.calls[0][0];
		expect(productData.slug).toBe('bague-e2e-test');
		expect(productData.images).toEqual(['https://cloudinary.test/fake.png']);

		expect(connectProductToTaxonomyValuesMock).toHaveBeenCalledWith('product-1', ['tax-1']);
	});

	it("refuse si une valeur de taxonomie sélectionnée n'existe pas (400)", async () => {
		getTaxonomyValuesByIdsMock.mockResolvedValue([]);
		const { actions } = await import('./+page.server');
		const formData = validFormData({ taxonomyValueIds: 'tax-inconnue' });

		// @ts-expect-error minimal fake RequestEvent
		const result = await actions.createProduct(fakeEvent(formData));

		expect(isActionFailure(result)).toBe(true);
		if (isActionFailure(result)) {
			expect(result.status).toBe(400);
		}
		expect(createProductMock).not.toHaveBeenCalled();
	});

	it('refuse un prix barré inférieur ou égal au prix de vente (400)', async () => {
		const formData = validFormData();
		formData.set('price', '50');
		formData.set('compareAtPrice', '50');
		const { actions } = await import('./+page.server');

		// @ts-expect-error minimal fake RequestEvent
		const result = await actions.createProduct(fakeEvent(formData));

		expect(isActionFailure(result)).toBe(true);
		if (isActionFailure(result)) {
			expect(result.status).toBe(400);
		}
		expect(createProductMock).not.toHaveBeenCalled();
	});

	it("échec d'upload Cloudinary : 500, aucune écriture en base", async () => {
		cloudinaryUpload.mockRejectedValue(new Error('Cloudinary indisponible'));
		const { actions } = await import('./+page.server');
		const formData = validFormData();

		// @ts-expect-error minimal fake RequestEvent
		const result = await actions.createProduct(fakeEvent(formData));

		expect(isActionFailure(result)).toBe(true);
		if (isActionFailure(result)) {
			expect(result.status).toBe(500);
		}
		expect(createProductMock).not.toHaveBeenCalled();
	});
});
