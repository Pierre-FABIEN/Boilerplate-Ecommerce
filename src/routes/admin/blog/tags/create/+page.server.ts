import type { Actions, PageServerLoad } from './$types';
import { superValidate, fail, message } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';

import { createBlogTagSchema } from '$lib/schema/BlogPost/tagSchema';
import { createTag } from '$lib/prisma/blogPost/blogPost';
import { requireAdmin } from '$lib/admin/guards';

export const load: PageServerLoad = async () => {
	const createTagForm = await superValidate(zod(createBlogTagSchema));
	return {
		createTagForm
	};
};

export const actions: Actions = {
	createTag: async ({ request, locals }) => {
		requireAdmin(locals);
		const formData = await request.formData();
		// console.log('formData', formData);

		const form = await superValidate(formData, zod(createBlogTagSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			await createTag(form.data.name);

			return message(form, 'Tag created successfully');
		} catch (error) {
			console.error('Error creating Tag:', error);
			return fail(500, { message: 'Tag creation failed' });
		}
	}
};
