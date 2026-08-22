import type { PageServerLoad } from './$types';
import { type Actions } from '@sveltejs/kit';
import { superValidate, fail, message, withFiles } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';

import { createCategorySchema } from '$lib/schema/categories/deleteCategorySchema';
import { createCategory } from '$lib/prisma/categories/categories';
import { requireAdmin } from '$lib/admin/guards';

// Fonction de chargement
export const load: PageServerLoad = async () => {
	const IcreateCategorySchema = await superValidate(zod(createCategorySchema));
	// console.log('Load function executed. Schema:', IcreateCategorySchema);
	return {
		IcreateCategorySchema
	};
};

export const actions: Actions = {
	createCategory: async ({ request, locals }) => {
		requireAdmin(locals);
		// console.log('createCategory action initiated.');

		const formData = await request.formData();
		// console.log('Received form data:', formData);

		const form = await superValidate(formData, zod(createCategorySchema));
		// console.log('Form validation result:', form);

		if (!form.valid) {
			// console.log('Validation errors:', form.errors);
			return fail(400, withFiles({ form }));
		}

		try {
			// console.log('Creating new category with name:', form.data.name);
			await createCategory({ name: form.data.name });

			return message(form, 'Category created successfully');
		} catch (error) {
			console.error('Error creating category:', error);
			return fail(500, { message: 'Category creation failed' });
		}
	}
};
