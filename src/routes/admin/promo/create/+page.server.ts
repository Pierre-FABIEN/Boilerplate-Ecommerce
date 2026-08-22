import type { Actions, PageServerLoad } from './$types';
import { superValidate, fail, message } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';

import { createPromoSchema } from '$lib/schema/promo/promoSchema';
import { createPromoCode, getPromoCodeByCode } from '$lib/prisma/promo/promo';
import { requireAdmin } from '$lib/admin/guards';

export const load: PageServerLoad = async () => {
	const createPromoForm = await superValidate(zod(createPromoSchema));
	return { createPromoForm };
};

export const actions: Actions = {
	createPromo: async ({ request, locals }) => {
		requireAdmin(locals);
		const formData = await request.formData();
		const form = await superValidate(formData, zod(createPromoSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			const existing = await getPromoCodeByCode(form.data.code);
			if (existing) {
				return message(form, 'Un code promo avec ce code existe déjà', { status: 400 });
			}

			await createPromoCode({
				code: form.data.code,
				type: form.data.type,
				value: form.data.value,
				minAmount: form.data.minAmount,
				usageLimit: form.data.usageLimit,
				expiresAt: form.data.expiresAt,
				active: form.data.active
			});

			return message(form, 'Code promo créé avec succès');
		} catch (error) {
			console.error('Error creating promo code:', error);
			return fail(500, { message: 'Échec de la création du code promo' });
		}
	}
};
