import type { PageServerLoad } from './$types';
import { listBlogCategories, listPublishedPosts } from '$lib/blog/catalog';

/**
 * Vitrine publique du blog.
 *
 * BLOG-PLUGIN : lecture Prisma des articles `published` uniquement. Le filtre
 * `?categorie=` est optionnel. Aucune mutation ici — le CRUD vit sous
 * `/admin/blog`.
 */
export const load: PageServerLoad = async ({ url }) => {
	const categoryId = url.searchParams.get('categorie') ?? undefined;
	const [posts, categories] = await Promise.all([
		listPublishedPosts(categoryId || undefined),
		listBlogCategories()
	]);

	return {
		posts,
		categories,
		activeCategoryId: categoryId ?? null
	};
};
