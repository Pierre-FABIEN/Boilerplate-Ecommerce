import { prisma } from '$lib/server';

/**
 * Accès Prisma aux catégories du catalogue produit (pas les catégories blog).
 *
 * PRODUCT-PLUGIN : retirer avec le module catalogue, ou les conserver si le
 * commerce continue d'afficher des rayons.
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
	return await prisma.category.delete({
		where: { id: categoryId }
	});
};

export const deleteProductCategories = async (productId: string) => {
	return await prisma.productCategory.deleteMany({
		where: { productId: productId }
	});
};

export const createCategory = async (data: { name: string; description?: string }) => {
	return await prisma.category.create({
		data
	});
};

export async function deleteProductCategoriesByCategoryId(categoryId: string) {
	return await prisma.productCategory.deleteMany({
		where: { categoryId: categoryId }
	});
}

export const updateCategory = async (data: { id: string; name: string }) => {
	// console.log('Updating category with data:', data);

	try {
		const updatedCategory = await prisma.category.update({
			where: { id: data.id },
			data: { name: data.name }
		});
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
