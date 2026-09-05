import { prisma } from '$lib/server';
import { bumpCacheVersion } from '$lib/server/cache';

/**
 * Accès Prisma aux catégories du catalogue produit (pas les catégories blog).
 *
 * PRODUCT-PLUGIN : retirer avec le module catalogue, ou les conserver si le
 * commerce continue d'afficher des rayons.
 *
 * `bumpCacheVersion('catalog')` invalide le cache de lecture publique
 * (`$lib/products/catalog`) après chaque écriture — voir `src/lib/server/cache.ts`.
 */

export const getAllcategories = async () => {
	try {
		const categories = await prisma.category.findMany();
		return categories;
	} catch (error) {
		console.error('Error fetching categories:', error);
		throw new Error('Could not fetch categories');
	}
};

export const getCategoriesById = async (categoryId: string) => {
	return await prisma.category.findUnique({
		where: { id: categoryId }
	});
};

export const deleteCategoryById = async (categoryId: string) => {
	const deleted = await prisma.category.delete({
		where: { id: categoryId }
	});
	await bumpCacheVersion('catalog');
	return deleted;
};

export const deleteProductCategories = async (productId: string) => {
	const result = await prisma.productCategory.deleteMany({
		where: { productId: productId }
	});
	await bumpCacheVersion('catalog');
	return result;
};

export const createCategory = async (data: { name: string; description?: string }) => {
	const category = await prisma.category.create({
		data
	});
	await bumpCacheVersion('catalog');
	return category;
};

export async function deleteProductCategoriesByCategoryId(categoryId: string) {
	const result = await prisma.productCategory.deleteMany({
		where: { categoryId: categoryId }
	});
	await bumpCacheVersion('catalog');
	return result;
}

export const updateCategory = async (data: { id: string; name: string }) => {
	// console.log('Updating category with data:', data);

	try {
		const updatedCategory = await prisma.category.update({
			where: { id: data.id },
			data: { name: data.name }
		});
		await bumpCacheVersion('catalog');
		// console.log('Category updated successfully:', updatedCategory);
		return updatedCategory;
	} catch (error) {
		console.error('Error updating category:', error);
		throw error;
	}
};

export const getCategoriesByIds = async (categoryIds: string[]) => {
	return await prisma.category.findMany({
		where: {
			id: { in: categoryIds }
		},
		select: {
			id: true
		}
	});
};
