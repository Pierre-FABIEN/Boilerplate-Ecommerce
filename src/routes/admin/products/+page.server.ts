// src/routes/+page.server.ts
import type { PageServerLoad } from './$types';
import { type Actions } from '@sveltejs/kit';
import { superValidate, fail, message } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import cloudinary from '$lib/server/cloudinary';

import { deleteProductSchema } from '$lib/schema/products/productSchema';
import { deleteCategorySchema } from '$lib/schema/categories/deleteCategorySchema';

import {
	deleteCategoryById,
	deleteProductCategories,
	getAllcategories,
	getCategoriesById
} from '$lib/prisma/categories/categories';
import { deleteProductById, getAllProducts, getProductById } from '$lib/prisma/products/products';
import { requireAdmin } from '$lib/admin/guards';

export const load: PageServerLoad = async () => {
	const IdeleteProductSchema = await superValidate(zod(deleteProductSchema));
	const IdeleteCategorySchema = await superValidate(zod(deleteCategorySchema));
	const products = await getAllProducts();
	const categories = await getAllcategories();

	return {
		products,
		IdeleteCategorySchema,
		IdeleteProductSchema,
		categories
	};
};

export const actions: Actions = {
	deleteProduct: async ({ request, locals }) => {
		requireAdmin(locals);
		const formData = await request.formData();
		const form = await superValidate(formData, zod(deleteProductSchema));
		const id = formData.get('id') as string;

		if (!id) {
			return fail(400, { message: 'Product ID is required' });
		}
		try {
			const existingProduct = await getProductById(id);
			if (!existingProduct) {
				return fail(400, { message: 'Product not found' });
			}

			const images = existingProduct.images;
			for (const imageUrl of images) {
				const publicId = getPublicIdFromUrl(imageUrl);
				if (publicId) {
					try {
						const result = await cloudinary.uploader.destroy(`products/${publicId}`);

						if (result.result !== 'ok' && result.result !== 'not found') {
							console.error('Error deleting image from Cloudinary:', result);
							return fail(500, { message: 'Failed to delete image from Cloudinary' });
						}
					} catch (error) {
						console.error('Error deleting image from Cloudinary:', error);
						return fail(500, { message: 'Failed to delete image from Cloudinary' });
					}
				}
			}

			await deleteProductCategories(id);

			await deleteProductById(id);

			return message(form, 'Product deleted successfully');
		} catch (error) {
			console.error('Error deleting product:', error);
			return fail(500, { message: 'Product deletion failed' });
		}
	},
	deleteCategory: async ({ request, locals }) => {
		requireAdmin(locals);
		const formData = await request.formData();
		const form = await superValidate(formData, zod(deleteCategorySchema));
		const categoryId = formData.get('categoryId') as string;

		if (!categoryId) {
			return fail(400, { message: 'Category ID is required' });
		}
		try {
			const existingCategory = await getCategoriesById(categoryId);
			if (!existingCategory) {
				return fail(400, { message: 'Category not found' });
			}

			await deleteProductCategories(categoryId);

			await deleteCategoryById(categoryId);

			return message(form, 'Category deleted successfully');
		} catch (error) {
			console.error('Error deleting category:', error);
			return fail(500, { message: 'Category deletion failed' });
		}
	}
};

const getPublicIdFromUrl = (url: string): string | null => {
	const regex = /\/([^/]+)\.[a-z]+$/;
	const match = url.match(regex);
	return match ? match[1] : null;
};
