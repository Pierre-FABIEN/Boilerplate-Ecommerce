import { prisma } from '$lib/server';

/**
 * Accès Prisma aux produits.
 *
 * PRODUCT-PLUGIN : ces fonctions alimentent la vitrine (`src/lib/products`) et
 * le CRUD admin. Ne pas les appeler depuis le panier ou le checkout sans
 * marqueur COMMERCE : le prix affiché ici n'est pas encore revalidé à l'achat.
 */

/** Un produit déjà commandé ne peut pas être effacé : l'historique de vente reste. */
export class ProductInUseError extends Error {
	constructor(public readonly productId: string) {
		super('Ce produit est lié à des commandes et ne peut pas être supprimé.');
		this.name = 'ProductInUseError';
	}
}

export const createProduct = async (productData: {
	name: string;
	description: string;
	price: number;
	stock: number;
	images: string[];
	slug: string;
	colorProduct: string;
}) => {
	return prisma.product.create({
		data: productData
	});
};

export const getProductById = async (productId: string) => {
	return await prisma.product.findUnique({
		where: { id: productId },
		include: { categories: true }
	});
};

export const getProductBySlug = async (slug: string) => {
	return prisma.product.findUnique({
		where: { slug },
		include: {
			categories: {
				include: { category: true }
			}
		}
	});
};

export const deleteProductById = async (productId: string) => {
	const linkedItems = await prisma.orderItem.count({
		where: { productId }
	});
	if (linkedItems > 0) {
		throw new ProductInUseError(productId);
	}

	await prisma.productCategory.deleteMany({
		where: { productId }
	});

	return prisma.product.delete({
		where: { id: productId }
	});
};

export const connectProductToCategories = async (productId: string, categoryIds: string[]) => {
	return prisma.productCategory.createMany({
		data: categoryIds.map((categoryId) => ({
			productId,
			categoryId
		}))
	});
};

export const getAllProducts = async () => {
	try {
		const products = await prisma.product.findMany({
			include: {
				categories: {
					include: {
						category: true
					}
				}
			}
		});
		return products;
	} catch (error) {
		console.error('Error fetching products:', error);
		throw new Error('Could not fetch products');
	}
};

export const updateProductById = async (
	productId: string,
	data: {
		name?: string;
		description?: string;
		price?: number;
		stock?: number;
		images?: string[];
		colorProduct?: string;
	}
) => {
	return await prisma.product.update({
		where: { id: productId },
		data
	});
};
