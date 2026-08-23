/**
 * BLOG-PLUGIN : création d'article. AUTH-PLUGIN : `authorId` est aujourd'hui
 * l'utilisateur connecté ; le modèle `BlogAuthor` n'est pas le `User`.
 */
import type { Actions } from '@sveltejs/kit';
import { superValidate, fail, message } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { createBlogPostSchema } from '$lib/schema/BlogPost/BlogPostSchema';
import { createPost, getAllCategoriesPosts, getAllTagsPosts } from '$lib/prisma/blogPost/blogPost';
import { slugify } from '$lib/prisma/slugify';
import { prisma } from '$lib/server';
import { requireAdmin } from '$lib/admin/guards';

export const load = async () => {
	const AllCategoriesPost = await getAllCategoriesPosts();
	const AllTagsPost = await getAllTagsPosts();
	const IcreateBlogPostSchema = await superValidate(zod(createBlogPostSchema));
	return {
		AllCategoriesPost,
		AllTagsPost,
		IcreateBlogPostSchema
	};
};

export const actions: Actions = {
	createPost: async ({ request, locals }) => {
		requireAdmin(locals);
		// console.log('createPost action initiated.');
		const formData = await request.formData();
		// console.log('Received form data:', formData);

		// Convert formData into a flat object
		const raw = Object.fromEntries(formData);

		// Convert tagIds to an array (if not already)
		if (raw.tagIds) {
			raw.tagIds = (raw.tagIds as string).split(',');
		}

		// Convert the "published" field to a boolean
		raw.published = raw.published === 'on';

		// Validate the form data
		const form = await superValidate(raw, zod(createBlogPostSchema));
		// console.log('Form validation result:', form);

		if (!form.valid) {
			// console.log('Validation errors:', form.errors);
			return fail(400, { form });
		}

		const { title, content, authorId, published, categoryId, tagIds } = form.data;
		let slug = slugify(title);

		// Ensure the slug is unique
		let uniqueSlug = slug;
		let counter = 1;

		// Check if a post with the same slug already exists in the database
		while (await prisma.blogPost.findUnique({ where: { slug: uniqueSlug } })) {
			uniqueSlug = `${slug}-${counter}`;
			counter++;
		}

		await createPost(title, content, authorId, uniqueSlug, published, categoryId, tagIds);

		// console.log('Post created successfully.', form);
		return message(form, 'Post created successfully');
	}
};
