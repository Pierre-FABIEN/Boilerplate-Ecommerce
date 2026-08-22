import type { PageServerLoad } from './$types';
import { listCategories, listProducts } from '$lib/products/catalog';

/**
 * Catalogue public.
 *
 * PRODUCT-PLUGIN : lecture Prisma uniquement. Le filtre `?categorie=` est
 * optionnel. Aucune mutation ici — le CRUD vit sous `/admin/products`.
 */
export const load: PageServerLoad = async ({ url }) => {
	const categoryId = url.searchParams.get('categorie') ?? undefined;
	const [products, categories] = await Promise.all([
		listProducts(categoryId || undefined),
		listCategories()
	]);

	return {
		products,
		categories,
		activeCategoryId: categoryId ?? null
	};
};
