/**
 * BLOG-PLUGIN : liste et suppressions admin (articles, catégories, tags).
 * Les gardes d'écriture sont celles de l'admin (`requireAdmin`).
 */
import type { PageServerLoad } from './$types';
import { type Actions } from '@sveltejs/kit';
import { superValidate, fail, message } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';

import { deleteBlogPostSchema } from '$lib/schema/BlogPost/BlogPostSchema';

import {
	deleteCategory,
	deleteTag,
	getAllCategoriesPosts,
	getAllTagsPosts,
	getCategoryById,
	getPostById,
	getTagById
} from '$lib/prisma/blogPost/blogPost';
import { deletePost } from '$lib/prisma/blogPost/blogPost';
import { getAllPosts } from '$lib/prisma/blogPost/blogPost';
import { deleteBlogCategorySchema } from '$lib/schema/BlogPost/categoriesSchema';
import { deleteBlogTagSchema } from '$lib/schema/BlogPost/tagSchema';
import { requireAdmin } from '$lib/admin/guards';

export const load: PageServerLoad = async () => {
	const BlogPost = await getAllPosts();
	const AllCategoriesPost = await getAllCategoriesPosts();
	const AllTagsPost = await getAllTagsPosts();

	const IdeleteBlogPostSchema = await superValidate(zod(deleteBlogPostSchema));
	const IdeleteBlogCategorySchema = await superValidate(zod(deleteBlogCategorySchema));
	const IdeleteBlogTagSchema = await superValidate(zod(deleteBlogTagSchema));

	return {
		AllCategoriesPost,
		AllTagsPost,
		IdeleteBlogPostSchema,
		BlogPost,
		IdeleteBlogTagSchema,
		IdeleteBlogCategorySchema
	};
};

export const actions: Actions = {
	deleteBlogPost: async ({ request, locals }) => {
		requireAdmin(locals);
		// console.log('deletePost action initiated.', request);

		const formData = await request.formData();
		// console.log(formData, 'form data');

		const form = await superValidate(formData, zod(deleteBlogPostSchema));
		const id = formData.get('id') as string;
		// console.log('Received id:', id);
		if (!id) {
			// console.log('No id provided');
			return fail(400, { message: 'Post ID is required' });
		}
		try {
			// Vérifier si la catégorie existe
			const existingPost = await getPostById(id);
			if (!existingPost) {
				// console.log('Post not found:', id);
				return fail(400, { message: 'Post not found' });
			}
			// console.log('Post found:', existingPost);

			// Supprimer la catégorie
			const deletedPost = await deletePost(id);
			// console.log('Deleted category:', deletedPost);
			return message(form, 'Post deleted successfully');
		} catch (error) {
			console.error('Error deleting category:', error);
			return fail(500, { message: 'Post deletion failed' });
		}
	},
	deleteBlogTag: async ({ request, locals }) => {
		requireAdmin(locals);
		// console.log('deleteTag action initiated.', request);

		const formData = await request.formData();
		// console.log(formData, 'form data');

		const form = await superValidate(formData, zod(deleteBlogTagSchema));
		const id = formData.get('id') as string;
		// console.log('Received id:', id);
		if (!id) {
			// console.log('No id provided');
			return fail(400, { message: 'Tag ID is required' });
		}
		try {
			// Vérifier si le tag existe
			const existingTag = await getTagById(id);
			if (!existingTag) {
				// console.log('Tag not found:', id);
				return fail(400, { message: 'Tag not found' });
			}
			// console.log('Tag found:', existingTag);

			// Supprimer le tag
			const deletedTag = await deleteTag(id);
			// console.log('Deleted tag:', deletedTag);
			return message(form, 'Tag deleted successfully');
		} catch (error) {
			console.error('Error deleting tag:', error);
			return fail(500, { message: 'Tag deletion failed' });
		}
	},
	deleteBlogCategory: async ({ request, locals }) => {
		requireAdmin(locals);
		// console.log('deleteCategory action initiated.', request);

		const formData = await request.formData();
		// console.log(formData, 'form data');

		const form = await superValidate(formData, zod(deleteBlogCategorySchema));
		const id = formData.get('id') as string;
		// console.log('Received id:', id);
		if (!id) {
			// console.log('No id provided');
			return fail(400, { message: 'Category ID is required' });
		}
		try {
			// Vérifier si la catégorie existe
			const existingCategory = await getCategoryById(id);
			if (!existingCategory) {
				// console.log('Category not found:', id);
				return fail(400, { message: 'Category not found' });
			}
			// console.log('Category found:', existingCategory);

			// Supprimer la catégorie
			const deletedCategory = await deleteCategory(id);
			// console.log('Deleted category:', deletedCategory);
			return message(form, 'Category deleted successfully');
		} catch (error) {
			console.error('Error deleting category:', error);
			return fail(500, { message: 'Category deletion failed' });
		}
	}
};
