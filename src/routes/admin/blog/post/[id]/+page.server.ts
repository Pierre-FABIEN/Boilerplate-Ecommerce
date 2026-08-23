/**
 * BLOG-PLUGIN : édition d'un article. Gardes = module admin.
 */
import type { PageServerLoad } from './$types';
import type { Actions } from '@sveltejs/kit';
import { superValidate, fail, message } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';

import { updateBlogPostSchema } from '$lib/schema/BlogPost/BlogPostSchema';
import {
	getAllCategoriesPosts,
	getAllTagsPosts,
	getPostById,
	updatePost
} from '$lib/prisma/blogPost/blogPost';
import { requireAdmin } from '$lib/admin/guards';

export const load: PageServerLoad = async ({ params }) => {
	const blogPost = await getPostById(params.id);
	const AllCategoriesPost = await getAllCategoriesPosts();
	const AllTagsPost = await getAllTagsPosts();

	if (!blogPost) {
		return fail(404, { message: 'Blog post not found' });
	}

	const initialData = {
		id: blogPost.id,
		title: blogPost.title,
		content: blogPost.content,
		categoryId: blogPost.categoryId || undefined,
		tagIds: blogPost.tags.map((tag) => tag.id),
		published: blogPost.published,
		authorId: blogPost.authorId
	};

	const IupdateBlogPostSchema = await superValidate(initialData, zod(updateBlogPostSchema));

	return {
		AllTagsPost,
		AllCategoriesPost,
		IupdateBlogPostSchema
	};
};

export const actions: Actions = {
	updatePost: async ({ request, locals }) => {
		requireAdmin(locals);
		const formData = await request.formData();
		// console.log('Raw Form data:', formData);

		// Convertir formData en objet exploitable
		const cleanData = Object.fromEntries(formData.entries());

		// Vérifier et nettoyer tagIds (éviter [undefined])
		if (cleanData.tagIds) {
			// Si c'est une seule valeur, la convertir en tableau
			if (!Array.isArray(cleanData.tagIds)) {
				cleanData.tagIds = [cleanData.tagIds];
			}

			// Filtrer les valeurs nulles ou undefined
			cleanData.tagIds = cleanData.tagIds.filter(Boolean);
		} else {
			// S'assurer que c'est toujours un tableau vide
			cleanData.tagIds = [];
		}

		const raw = Object.fromEntries(formData);
		// Convert the "published" field to a boolean
		raw.published = raw.published === 'on';

		// console.log('Cleaned Form data:', cleanData);

		// Maintenant, on passe les données propres à superValidate
		const form = await superValidate(cleanData, zod(updateBlogPostSchema));
		// console.log('Validated Form data:', form);

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			const result = await updatePost(form.data);
			// console.log(result);

			return message(form, 'Post updated successfully');
		} catch (error) {
			console.error('Error updating blog post:', error);
			return fail(500, { message: 'Failed to update post' });
		}
	}
};
