// src/routes/admin/blog/categories/[id]/+page.server.ts

import type { PageServerLoad, Actions } from './$types';
import { superValidate, fail, message } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';

import { updateBlogCategorySchema } from '$lib/schema/BlogPost/categoriesSchema';
import { getCategoryById, updateCategory } from '$lib/prisma/blogPost/blogPost';
import { requireAdmin } from '$lib/admin/guards';

export const load: PageServerLoad = async ({ params }) => {
	// Récupérer la catégorie en base
	const category = await getCategoryById(params.id);

	if (!category) {
		return fail(404, { message: 'Category not found' });
	}

	// Pré-remplir le formulaire avec les données existantes
	const initialData = {
		id: category.id,
		name: category.name,
		description: category.description
		// description: category.description, si vous gérez la description
	};

	// Valider le schéma (mais surtout initialiser superValidate)
	const updateCategoryForm = await superValidate(initialData, zod(updateBlogCategorySchema));

	return { updateCategoryForm };
};

export const actions: Actions = {
	updateCategory: async ({ request, locals }) => {
		requireAdmin(locals);
		// Récupérer les données
		const formData = await request.formData();
		const form = await superValidate(formData, zod(updateBlogCategorySchema));

		// Vérifier la validité
		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			// Appel Prisma pour mettre à jour
			await updateCategory(form.data.id, {
				name: form.data.name,
				description: form.data.description
			});
			return message(form, 'Category updated successfully');
		} catch (error) {
			console.error('Error updating category:', error);
			return fail(500, { message: 'Category update failed' });
		}
	}
};
