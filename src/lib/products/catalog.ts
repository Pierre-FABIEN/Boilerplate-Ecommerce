// -----------------------------------------------------------------------------
// Lecture publique du catalogue.
//
// Ces fonctions sont le point d'entrée de la vitrine : elles ne servent jamais
// à muter un produit. Les écritures restent dans les DAO Prisma, derrière les
// gardes admin. Retirer le module, pour ce fichier-là, se résume à ne plus
// appeler ces lecteurs depuis les routes `/products`.
// -----------------------------------------------------------------------------

import { prisma } from '$lib/server';

const publicProductInclude = {
	categories: {
		include: {
			category: true
		}
	}
} as const;

export type PublicProduct = Awaited<ReturnType<typeof listProducts>>[number];

/** Liste les produits, éventuellement filtrés par catégorie. */
export async function listProducts(categoryId?: string) {
	return prisma.product.findMany({
		where: categoryId
			? {
					categories: {
						some: { categoryId }
					}
				}
			: undefined,
		include: publicProductInclude,
		orderBy: { name: 'asc' }
	});
}

/** Fiche produit par slug, ou `null` si inconnu. */
export async function getProductBySlug(slug: string) {
	return prisma.product.findUnique({
		where: { slug },
		include: publicProductInclude
	});
}

/** Catégories du catalogue, pour le filtre de la vitrine. */
export async function listCategories() {
	return prisma.category.findMany({
		orderBy: { name: 'asc' }
	});
}
