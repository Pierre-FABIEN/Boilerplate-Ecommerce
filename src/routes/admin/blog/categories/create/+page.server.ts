import type { Actions, PageServerLoad } from './$types';
import { superValidate, fail, message } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';

import { createBlogCategorySchema } from '$lib/schema/BlogPost/categoriesSchema';
import { createCategory } from '$lib/prisma/blogPost/blogPost';
import { requireAdmin } from '$lib/admin/guards';

export const load: PageServerLoad = async () => {
	const createCategoryForm = await superValidate(zod(createBlogCategorySchema));
	return {
		createCategoryForm
	};
};

export const actions: Actions = {
	createCategory: async ({ request, locals }) => {
		requireAdmin(locals);
		const formData = await request.formData();
		// console.log('formData', formData);

		const form = await superValidate(formData, zod(createBlogCategorySchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			const ll = await createCategory(form.data.name, form.data.description);
			// console.log(ll);

			return message(form, 'Category created successfully');
		} catch (error) {
			console.error('Error creating category:', error);
			return fail(500, { message: 'Category creation failed' });
		}
	}
};
