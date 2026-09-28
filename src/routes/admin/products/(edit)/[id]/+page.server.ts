import type { PageServerLoad } from './$types';
import { error, type Actions } from '@sveltejs/kit';
import { superValidate, fail, message, withFiles } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import cloudinary from '$lib/server/cloudinary';
import {
	connectProductToTaxonomyValues,
	deleteProductTaxonomyValues,
	getProductById,
	updateProductById
} from '$lib/prisma/products/products';
import { updateProductSchema } from '$lib/schema/products/productSchema';
import { getPublicIdFromUrl } from '$lib/prisma/getPublicIdFromUrl';
import { getAllTaxonomiesWithValues } from '$lib/prisma/taxonomies/taxonomies';
import { getTaxonomyValuesByIds } from '$lib/prisma/taxonomies/taxonomyValues';
import { requireAdmin } from '$lib/admin/guards';
import { validateImageUpload } from '$lib/server/imageUpload';
import { getStoreFeatureFlags } from '$lib/server/storeSettings';

export const load: PageServerLoad = async ({ params }) => {
	const product = await getProductById(params.id);

	if (!product) {
		error(404, 'Product not found');
	}

	const taxonomies = await getAllTaxonomiesWithValues();
	const { flashSaleEnabled } = await getStoreFeatureFlags();

	const initialData = {
		_id: product.id,
		name: product.name,
		description: product.description,
		price: product.price,
		stock: product.stock,
		colorProduct: product.colorProduct,
		sku: product.sku ?? '',
		compareAtPrice: product.compareAtPrice ?? 0,
		flashSaleEndsAt: product.flashSaleEndsAt
			? product.flashSaleEndsAt.toISOString().slice(0, 16)
			: undefined,
		weight: product.weight ?? undefined,
		length: product.length ?? undefined,
		width: product.width ?? undefined,
		height: product.height ?? undefined,
		taxonomyValueIds: product.taxonomyValues.map((tv) => tv.taxonomyValueId),
		images: [],
		existingImages: product.images
	};

	const IupdateProductSchema = await superValidate(initialData, zod(updateProductSchema));

	return {
		taxonomies,
		IupdateProductSchema,
		flashSaleEnabled
	};
};

export const actions: Actions = {
	updateProduct: async ({ request, locals }) => {
		requireAdmin(locals);
		try {
			const formData = await request.formData();
			const form = await superValidate(formData, zod(updateProductSchema));

			if (!form.valid) {
				return fail(400, withFiles({ form }));
			}

			if (form.data.compareAtPrice > 0 && form.data.compareAtPrice <= form.data.price) {
				form.errors.compareAtPrice = ['Le prix barré doit être supérieur au prix de vente'];
				form.valid = false;
				return fail(400, withFiles({ form }));
			}

			const productId = form.data._id;
			if (!productId) {
				return fail(400, { message: 'Invalid Product ID' });
			}

			const images = form.data.images ?? [];
			const existingImages = JSON.parse(formData.get('existingImages') as string) || [];
			const uploadedImageUrls: string[] = [];

			for (const image of images) {
				if (typeof image === 'string') {
					uploadedImageUrls.push(image);
				} else if (image instanceof File) {
					const invalid = validateImageUpload(image);
					if (invalid) {
						return fail(400, { message: invalid });
					}
					try {
						const buffer = await image.arrayBuffer();
						const base64String = Buffer.from(buffer).toString('base64');
						const uploadResponse = await cloudinary.uploader.upload(
							`data:${image.type};base64,${base64String}`,
							{
								folder: 'products'
							}
						);
						uploadedImageUrls.push(uploadResponse.secure_url);
					} catch {
						return fail(500, { message: 'Image upload failed' });
					}
				}
			}

			if (uploadedImageUrls.length > 0) {
				for (const imageUrl of existingImages) {
					const publicId = getPublicIdFromUrl(imageUrl);
					if (publicId) {
						try {
							const result = await cloudinary.uploader.destroy(`products/${publicId}`);
							if (result.result !== 'ok' && result.result !== 'not found') {
								return fail(500, { message: 'Failed to delete image from Cloudinary' });
							}
						} catch {
							return fail(500, { message: 'Failed to delete image from Cloudinary' });
						}
					}
				}
			}

			const taxonomyValueIds = (form.data.taxonomyValueIds[0] ?? '')
				.split(',')
				.map((id) => id.trim())
				.filter(Boolean);
			if (taxonomyValueIds.length > 0) {
				const existingValues = await getTaxonomyValuesByIds(taxonomyValueIds);
				if (existingValues.length !== taxonomyValueIds.length) {
					return fail(400, { message: 'Some selected taxonomy values do not exist' });
				}
			}

			try {
				await updateProductById(productId, {
					name: form.data.name,
					description: form.data.description,
					price: form.data.price,
					stock: form.data.stock,
					colorProduct: form.data.colorProduct,
					images: uploadedImageUrls.length > 0 ? uploadedImageUrls : existingImages,
					sku: form.data.sku || null,
					compareAtPrice: form.data.compareAtPrice || null,
					flashSaleEndsAt: form.data.flashSaleEndsAt || null,
					weight: form.data.weight ?? null,
					length: form.data.length ?? null,
					width: form.data.width ?? null,
					height: form.data.height ?? null
				});

				await deleteProductTaxonomyValues(productId);

				await connectProductToTaxonomyValues(productId, taxonomyValueIds);

				return message(form, 'Product updated successfully');
			} catch {
				return fail(500, { message: 'Product update failed' });
			}
		} catch {
			return fail(500, { message: 'An unexpected error occurred' });
		}
	}
};
