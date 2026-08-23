import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getPublishedPostBySlug } from '$lib/blog/catalog';

/**
 * Article public.
 *
 * BLOG-PLUGIN : 404 si le slug n'existe pas ou si l'article n'est pas publié.
 */
export const load: PageServerLoad = async ({ params }) => {
	const post = await getPublishedPostBySlug(params.slug);
	if (!post) {
		error(404, 'Article introuvable');
	}

	return { post };
};
