/**
 * Liste des produits, suppression, catégories.
 *
 * PRODUCT-PLUGIN : les gardes d'écriture sont celles de l'admin. Un produit
 * déjà commandé ne peut pas être effacé (`ProductInUseError`).
 */
import type { PageServerLoad } from './$types';
import { type Actions } from '@sveltejs/kit';
import { superValidate, fail, message } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import cloudinary from '$lib/server/cloudinary';

import { deleteProductSchema } from '$lib/schema/products/productSchema';
import { deleteCategorySchema } from '$lib/schema/categories/deleteCategorySchema';

import {
	deleteCategoryById,
	deleteProductCategoriesByCategoryId,
	getAllcategories,
	getCategoriesById
} from '$lib/prisma/categories/categories';
import {
	deleteProductById,
	getAllProducts,
	getProductById,
	ProductInUseError
} from '$lib/prisma/products/products';
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

			await deleteProductById(id);

			for (const imageUrl of existingProduct.images) {
				const publicId = getPublicIdFromUrl(imageUrl);
				if (!publicId || !imageUrl.includes('cloudinary')) continue;
				try {
					await cloudinary.uploader.destroy(`products/${publicId}`);
				} catch (error) {
					console.error('Error deleting image from Cloudinary:', error);
				}
			}

			return message(form, 'Product deleted successfully');
		} catch (error) {
			if (error instanceof ProductInUseError) {
				return fail(409, { message: error.message });
			}
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

			await deleteProductCategoriesByCategoryId(categoryId);

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
