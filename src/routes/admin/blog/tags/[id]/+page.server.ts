// src/routes/admin/blog/tag/[id]/+page.server.ts

import type { PageServerLoad, Actions } from './$types';
import { superValidate, fail, message } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';

import { updateBlogTagSchema } from '$lib/schema/BlogPost/tagSchema';
import { getTagById, updateTag } from '$lib/prisma/blogPost/blogPost';
import { requireAdmin } from '$lib/admin/guards';

export const load: PageServerLoad = async ({ params }) => {
	// Récupérer la catégorie en base
	const tag = await getTagById(params.id);

	if (!tag) {
		return fail(404, { message: 'Tag not found' });
	}

	// Pré-remplir le formulaire avec les données existantes
	const initialData = {
		id: tag.id,
		name: tag.name
		// description: tag.description, si vous gérez la description
	};

	// Valider le schéma (mais surtout initialiser superValidate)
	const updateTagForm = await superValidate(initialData, zod(updateBlogTagSchema));

	return { updateTagForm };
};

export const actions: Actions = {
	updateTag: async ({ request, locals }) => {
		requireAdmin(locals);
		// Récupérer les données
		const formData = await request.formData();
		const form = await superValidate(formData, zod(updateBlogTagSchema));

		// Vérifier la validité
		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			// Appel Prisma pour mettre à jour
			await updateTag(form.data.id, {
				name: form.data.name
			});
			return message(form, 'Tag updated successfully');
		} catch (error) {
			console.error('Error updating tag:', error);
			return fail(500, { message: 'Tag update failed' });
		}
	}
};
